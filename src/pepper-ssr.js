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
} from './component-runtime.js'
import {
	compileComponentTemplate,
	lowerComponentTemplate,
	renderSourceTemplate,
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
 *   pendingCallbacks: Array<() => void>,
 *   pendingMounts: ComponentRuntime[],
 *   scheduleRender(): void,
 *   ssrTags: SsrTags | null,
 * }} SsrRootRecord
*/

/** @type {SsrRootRecord} */
const publicSsrTagsHolder = {
	context: new Map(),
	pendingCallbacks: [],
	pendingMounts: [],
	scheduleRender() {},
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
			const lowered = lowerComponentTemplate(compiled, values, entry => (
				createSsrComponentValue(rootRecord, ownerRuntime, entry, values)
			))
			if (!lowered) return baseHtml(strings, ...values)
			return baseHtml(lowered.strings, ...lowered.values)
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
		const { props } = resolveComponentProps(descriptor.bindings, values)
		const childrenSource = descriptor.childrenSource
		/** @type {ComponentRuntime | undefined} */
		let runtime
		if (childrenSource != null) {
			props.children = () => runWithOwnerRuntime(
				/** @type {ComponentRuntime} */ (runtime),
				() => renderSourceTemplate(/** @type {SsrTags} */ (rootRecord.ssrTags).html, childrenSource, values),
			)
		}
		try {
			runtime = createComponentRuntime(componentType, props, rootRecord, ownerRuntime)
		} catch (error) {
			if (!ownerRuntime) throw error
			throwBoundaryError(ownerRuntime, error, true)
		}
		let renderable = renderComponentRuntime(runtime, /** @type {SsrTags} */ (rootRecord.ssrTags))
		let serialized
		try {
			serialized = baseRenderToString(renderable)
		} catch (error) {
			if (!isErrorBoundarySignal(error) || error.boundary !== runtime) throw error
			captureBoundaryError(runtime, error.error)
			renderable = renderComponentRuntime(runtime, /** @type {SsrTags} */ (rootRecord.ssrTags))
			serialized = baseRenderToString(renderable)
		}
		finalizeComponentRuntime(runtime)
		return unsafeHTML(serialized)
	}
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
 * @param {{ context?: import('./component-runtime.js').ContextInput }} [options={}]
 * @returns {string}
 */
function renderComponentToString(Component, props = {}, options = {}) {
	/** @type {SsrRootRecord} */
	const rootRecord = {
		context: createContextValues(options.context),
		pendingCallbacks: [],
		pendingMounts: [],
		scheduleRender() {},
		ssrTags: null,
	}
	rootRecord.ssrTags = createSsrTags(rootRecord)
	const runtime = createComponentRuntime(Component, props, rootRecord, null)
	let renderable = renderComponentRuntime(runtime, /** @type {SsrTags} */ (rootRecord.ssrTags))
	let htmlString
	try {
		htmlString = baseRenderToString(renderable)
	} catch (error) {
		if (!isErrorBoundarySignal(error) || error.boundary !== runtime) throw error
		captureBoundaryError(runtime, error.error)
		renderable = renderComponentRuntime(runtime, /** @type {SsrTags} */ (rootRecord.ssrTags))
		htmlString = baseRenderToString(renderable)
	}
	finalizeComponentRuntime(runtime)
	return htmlString
}

/**
 * Serialize a low-level Pepper SSR template value to a string.
 *
 * @param {Parameters<typeof baseRenderToString>[0]} value
 * @returns {string}
 */
function renderToString(value) {
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
}
