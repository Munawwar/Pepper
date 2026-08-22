import {
	clearTemplateCache,
	force,
	html as baseHtml,
	mathml as baseMathml,
	rawText,
	renderToString as baseRenderToString,
	svg as baseSvg,
	unsafeHTML,
	unsafeMathML,
	unsafeSVG,
} from './html-ssr.js'
import {
	component,
	captureBoundaryError,
	createChildIdPath,
	createContextValues,
	createComponentRuntime,
	finalizeComponentRuntime,
	getCurrentOwnerRuntime,
	isErrorBoundarySignal,
	ref,
	renderComponentRuntime,
	runWithOwnerRuntime,
	state,
	throwBoundaryError,
	stableId,
} from './component-runtime.js'
import {
	compileComponentTemplate,
	lowerComponentValues,
	resolveComponentProps,
} from './component-syntax.js'

/**
 * @typedef {import('./component-runtime.js').ComponentRuntime} ComponentRuntime
 * @typedef {import('./component-runtime.js').PepperComponent} PepperComponent
 * @typedef {import('./component-syntax.js').ComponentDescriptor} ComponentDescriptor
 * @typedef {string[] & { raw: string[] }} MutableTemplateStringsArray
 * @typedef {{
 *   html(strings: TemplateStringsArray, ...values: unknown[]): ReturnType<typeof baseHtml>,
  *   mathml: typeof baseMathml,
  *   svg: typeof baseSvg,
 * }} SsrTags
 * @typedef {{
 *   context: Map<string, unknown>,
 *   identifierPrefix?: string,
 *   idPath: string[],
 *   nextChildId: number,
 *   scheduleRender(): void,
 *   seenChildKeys: WeakMap<object, { pass: number, sites: Map<unknown, Set<string | number>> }>,
 *   ssrTags: SsrTags | null,
 * }} SsrRootRecord
*/

/** @type {SsrRootRecord} */
const publicSsrTagsHolder = {
	context: new Map(),
	identifierPrefix: '',
	idPath: [],
	nextChildId: 0,
	scheduleRender() {},
	seenChildKeys: new WeakMap(),
	ssrTags: null,
}

/**
 * @param {SsrRootRecord} rootRecord
 * @returns {SsrTags}
 */
function createSsrTags(rootRecord) {
	return {
		html(strings, ...values) {
			const compiled = compileComponentTemplate(strings)
			if (!compiled) return baseHtml(strings, ...values)
			const ownerRuntime = getCurrentOwnerRuntime()
			const loweredValues = lowerComponentValues(compiled, values, (entry, sourceValues) => (
				createSsrComponentValue(rootRecord, ownerRuntime, entry, sourceValues)
			))
			return baseHtml(compiled.strings, ...loweredValues)
		},
		mathml: baseMathml,
		svg: baseSvg,
	}
}

/**
 * @param {SsrRootRecord} rootRecord
 * @param {ComponentRuntime | null} ownerRuntime
 * @param {ComponentDescriptor} descriptor
 * @param {unknown[]} values
 * @returns {() => unknown}
 */
function createSsrComponentValue(rootRecord, ownerRuntime, descriptor, values) {
	return function renderComponentValue() {
		const componentType = /** @type {PepperComponent} */ (values[descriptor.componentIndex])
		const { key, props } = resolveComponentProps(descriptor.bindings, values)
		const owner = ownerRuntime || rootRecord
		if (key != null) {
			const pass = ownerRuntime?.renderPassId || 0
			let seen = rootRecord.seenChildKeys.get(owner)
			if (!seen || seen.pass !== pass)
				rootRecord.seenChildKeys.set(owner, (seen = {pass, sites: new Map()}))
			let keys = seen.sites.get(descriptor)
			if (!keys) seen.sites.set(descriptor, (keys = new Set()))
			if (keys.has(key)) throw new Error(`Duplicate key at component site: ${String(key)}`)
			keys.add(key)
		}
		const childTemplate = descriptor.childrenTemplate
		const idPath = createChildIdPath(owner)
		/** @type {ComponentRuntime | undefined} */
		let runtime
		if (childTemplate) {
			props.children = () => runWithOwnerRuntime(
				/** @type {ComponentRuntime} */ (runtime),
				() => /** @type {SsrTags} */ (rootRecord.ssrTags).html(
					childTemplate.strings,
					...childTemplate.indices.map(index => values[index]),
				),
			)
		}
		try {
			runtime = createComponentRuntime(componentType, props, rootRecord, ownerRuntime, idPath)
		} catch (error) {
			if (!ownerRuntime) throw error
			throwBoundaryError(ownerRuntime, error, true)
		}
		return unsafeHTML(renderRuntimeToString(runtime, /** @type {SsrTags} */ (rootRecord.ssrTags)))
	}
}

/**
 * @param {ComponentRuntime} runtime
 * @param {SsrTags} tags
 * @returns {string}
 */
function renderRuntimeToString(runtime, tags) {
	let renderable = renderComponentRuntime(runtime, tags)
	let serialized
	try {
		serialized = baseRenderToString(renderable)
	} catch (error) {
		if (!isErrorBoundarySignal(error) || error.boundary !== runtime) throw error
		captureBoundaryError(runtime, error.error)
		renderable = renderComponentRuntime(runtime, tags)
		serialized = baseRenderToString(renderable)
	}
	finalizeComponentRuntime(runtime)
	return serialized
}

/**
 * A Pepper `html` template tag function for component-aware server-side rendering.
 *
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {ReturnType<typeof baseHtml>}
 */
function html(strings, ...values) {
	return /** @type {SsrTags} */ (publicSsrTagsHolder.ssrTags).html(strings, ...values)
}

/**
 * Render a Pepper function component to an HTML string.
 *
 * @param {PepperComponent} Component
 * @param {Record<string, unknown>} [props={}]
 * @param {{ context?: import('./component-runtime.js').ContextInput, identifierPrefix?: string }} [options={}]
 * @returns {string}
 */
function renderComponentToString(Component, props = {}, options = {}) {
	/** @type {SsrRootRecord} */
	const rootRecord = {
		context: createContextValues(options.context),
		identifierPrefix: options.identifierPrefix || '',
		idPath: [],
		nextChildId: 0,
		scheduleRender() {},
		seenChildKeys: new WeakMap(),
		ssrTags: null,
	}
	rootRecord.ssrTags = createSsrTags(rootRecord)
	const runtime = createComponentRuntime(Component, props, rootRecord, null)
	return renderRuntimeToString(runtime, /** @type {SsrTags} */ (rootRecord.ssrTags))
}

/**
 * Serialize a low-level Pepper SSR template value to a string.
 *
 * @param {Parameters<typeof baseRenderToString>[0]} value
 * @returns {string}
 */
function renderToString(value) {
	publicSsrTagsHolder.nextChildId = 0
	publicSsrTagsHolder.seenChildKeys = new WeakMap()
	return baseRenderToString(value)
}

/**
 * Server rendering omits portal output.
 *
 * @returns {() => []}
 */
function portal() {
	return () => []
}

publicSsrTagsHolder.ssrTags = createSsrTags(publicSsrTagsHolder)
/** @type {typeof baseSvg} */
const svg = baseSvg
/** @type {typeof baseMathml} */
const mathml = baseMathml

export {
	clearTemplateCache,
	component,
	force,
	html,
	mathml,
	portal,
	rawText,
	ref,
	renderComponentToString,
	renderToString,
	state,
	svg,
	unsafeHTML,
	unsafeMathML,
	unsafeSVG,
	stableId,
}
