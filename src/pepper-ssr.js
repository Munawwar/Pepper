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
} from './ssr.js'
import {
	component,
	createComponentRuntime,
	finalizeComponentRuntime,
	ref,
	renderComponentRuntime,
	state,
} from './component-runtime.js'
import {
	compileComponentTemplate,
	lowerComponentTemplate,
	renderSourceTemplate,
	resolveComponentProps,
} from './component-syntax.js'

const publicSsrTagsHolder = {
	pendingCallbacks: [],
	pendingMounts: [],
	scheduleRender() {},
	ssrTags: null,
}

function createSsrTags(rootRecord) {
	return {
		html(strings, ...values) {
			const compiled = compileComponentTemplate(strings)
			if (!compiled) return baseHtml(strings, ...values)
			const lowered = lowerComponentTemplate(compiled, values, entry => (
				createSsrComponentValue(rootRecord, entry, values)
			))
			return baseHtml(lowered.strings, ...lowered.values)
		},
		mathml: baseMathml,
		svg: baseSvg,
	}
}

function createSsrComponentValue(rootRecord, entry, values) {
	return function renderComponentValue() {
		const componentType = values[entry.componentIndex]
		const { props } = resolveComponentProps(entry.bindings, values)
		if (entry.childrenSource != null) props.children = () => renderSourceTemplate(rootRecord.ssrTags.html, entry.childrenSource, values)
		const runtime = createComponentRuntime(componentType, props, rootRecord, null)
		const renderable = renderComponentRuntime(runtime, rootRecord.ssrTags)
		const serialized = typeof renderable === 'function' ? renderable() : renderable
		finalizeComponentRuntime(runtime)
		return serialized
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
	return publicSsrTagsHolder.ssrTags.html(strings, ...values)
}

/**
 * Render a Pepper function component to an HTML string.
 *
 * @template {Record<string, unknown>} [Props=Record<string, unknown>]
 * @param {(api: {
 *   getProps(): Props,
 *   onMount(handler: () => void | (() => void)): void,
 *   onProps(handler: (changedProps: string[], oldProps: Props) => void): void,
 *   update(callback?: (() => void)): void,
 * }) => { render(html: typeof html): unknown } | ((html: typeof html) => unknown)} Component
 * @param {Props} [props={}]
 * @returns {string}
 */
function renderComponentToString(Component, props = {}) {
	const rootRecord = {
		pendingCallbacks: [],
		pendingMounts: [],
		scheduleRender() {},
		ssrTags: null,
	}
	rootRecord.ssrTags = createSsrTags(rootRecord)
	const runtime = createComponentRuntime(Component, props, rootRecord, null)
	const renderable = renderComponentRuntime(runtime, rootRecord.ssrTags)
	const htmlString = baseRenderToString(renderable)
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
