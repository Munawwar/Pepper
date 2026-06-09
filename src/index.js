import {
	force,
	html as baseHtml,
	mathml as baseMathml,
	rawText,
	svg as baseSvg,
	unsafeHTML,
	unsafeMathML,
	unsafeSVG,
} from './html.js'
import {
	component,
	createComponentRuntime,
	destroyComponentRuntime,
	finalizeComponentRuntime,
	flushMounts,
	getCurrentOwnerRuntime,
	getOrCreateChildStore,
	ref,
	renderComponentRuntime,
	state,
	syncComponentProps,
} from './component-runtime.js'
import {
	compileComponentTemplate,
	lowerComponentTemplate,
	renderSourceTemplate,
	resolveComponentProps,
} from './component-syntax.js'
import { renderComponentToString } from './pepper-ssr.js'
import { Store } from './store.js'

const rootMap = new WeakMap()
const singleValueStrings = ['', '']
singleValueStrings.raw = singleValueStrings
const publicTagsHolder = { domTags: null }

/**
 * @typedef {{ debugKeys?: boolean }} RenderOptions
 */

function asTemplateView(tag, value) {
	return tag(singleValueStrings, value)
}

function realizeDomRenderable(renderable, runtime, liveNodes = null) {
	const view = typeof renderable === 'function' ? renderable : asTemplateView(runtime.rootRecord.domTags.html, renderable)
	return liveNodes ? view(runtime.viewKey, liveNodes) : view(runtime.viewKey)
}

function flushCallbacks(rootRecord) {
	const callbacks = rootRecord.pendingCallbacks.splice(0)
	for (const callback of callbacks) callback()
}

function createDomTags() {
	return {
		html(strings, ...values) {
			const compiled = compileComponentTemplate(strings)
			if (!compiled) return baseHtml(strings, ...values)
			const ownerRuntime = getCurrentOwnerRuntime()
			if (!ownerRuntime) {
				throw new Error('Pepper component tags can only be used while rendering a Pepper component.')
			}
			const lowered = lowerComponentTemplate(compiled, values, entry => (
				createDomComponentValue(ownerRuntime, entry, values)
			))
			if (compiled.strings.every(string => string === '')) {
				const keyedInstanceIds = new Map()
				return function renderComponentOnlyTemplate(key = Symbol()) {
					let instanceIds = keyedInstanceIds.get(key)
					if (!instanceIds) keyedInstanceIds.set(key, (instanceIds = []))
					return lowered.values.flatMap((value, index) => {
						if (typeof value === 'function') {
							let instanceId = instanceIds[index]
							if (!instanceId) instanceIds[index] = instanceId = Symbol(`pepper-component-hole-${index}`)
							return value(instanceId)
						}
						return Array.isArray(value) ? value.flat(Infinity) : value == null ? [] : [value]
					})
				}
			}
			return baseHtml(lowered.strings, ...lowered.values)
		},
		mathml: baseMathml,
		svg: baseSvg,
	}
}

function createDomComponentValue(ownerRuntime, entry, values) {
	return function renderComponentValue(instanceKey = Symbol()) {
		const store = getOrCreateChildStore(ownerRuntime, entry)
		const componentType = values[entry.componentIndex]
		const { key, props } = resolveComponentProps(entry.bindings, values)
		if (entry.childrenSource != null) {
			props.children = () => renderSourceTemplate(ownerRuntime.rootRecord.domTags.html, entry.childrenSource, values)
		}
		const childKey = key ?? instanceKey
		let runtime = store.get(childKey)
		if (!runtime || runtime.componentType !== componentType) {
			if (runtime) destroyComponentRuntime(runtime)
			runtime = createComponentRuntime(componentType, props, ownerRuntime.rootRecord, ownerRuntime)
			store.set(childKey, runtime)
		} else {
			syncComponentProps(runtime, props)
		}

		runtime.lastSeen = ownerRuntime.renderPassId
		const renderable = renderComponentRuntime(runtime, ownerRuntime.rootRecord.domTags)
		const nodes = realizeDomRenderable(renderable, runtime)
		const debugKeyValue = ownerRuntime.rootRecord.options.debugKeys === true && key != null ? String(key) : ''
		if (runtime.debugKeyNodes)
			for (const node of runtime.debugKeyNodes)
				if (node instanceof Element && (!debugKeyValue || !nodes.includes(node))) node.removeAttribute('x-key')
		runtime.debugKeyNodes = []
		if (debugKeyValue)
			for (const node of nodes)
				if (node instanceof Element) {
					node.setAttribute('x-key', debugKeyValue)
					runtime.debugKeyNodes.push(node)
				}
		finalizeComponentRuntime(runtime)
		return nodes
	}
}

function resolveContainer(container) {
	return typeof container === 'string' ? document.querySelector(container) : container
}

function createRootRecord(Component, container, props, options) {
	const rootRecord = {
		Component,
		container,
		domTags: null,
		flushScheduled: false,
		hydrating: false,
		mounted: false,
		pendingCallbacks: [],
		pendingMounts: [],
		rootKey: Symbol('pepper-root'),
		options,
		topRuntime: null,
	}
	rootRecord.scheduleRender = () => scheduleRootRender(rootRecord)
	rootRecord.domTags = createDomTags()
	rootRecord.topRuntime = createComponentRuntime(Component, props, rootRecord, null)
	return rootRecord
}

function performRootRender(rootRecord, hydrateOnly = false) {
	const liveNodes = hydrateOnly ? Array.from(rootRecord.container.childNodes) : null
	const renderable = renderComponentRuntime(rootRecord.topRuntime, rootRecord.domTags)
	const nodes = realizeDomRenderable(renderable, rootRecord.topRuntime, liveNodes && liveNodes.length ? liveNodes : null)
	finalizeComponentRuntime(rootRecord.topRuntime)
	if (!rootRecord.mounted && !hydrateOnly) rootRecord.container.replaceChildren(...nodes)
	rootRecord.mounted = true
	flushMounts(rootRecord)
	flushCallbacks(rootRecord)
}

function scheduleRootRender(rootRecord) {
	if (rootRecord.flushScheduled) return
	rootRecord.flushScheduled = true
	queueMicrotask(() => {
		rootRecord.flushScheduled = false
		performRootRender(rootRecord)
	})
}

function destroyRootRecord(rootRecord) {
	destroyComponentRuntime(rootRecord.topRuntime)
	rootMap.delete(rootRecord.container)
}

function mountRoot(Component, container, props = {}, options = {}, hydrateOnly = false) {
	const target = resolveContainer(container)
	if (!(target instanceof Element)) {
		throw new Error('Pepper render/hydrate target must be a DOM element or selector.')
	}

	let rootRecord = rootMap.get(target)
	if (!rootRecord || rootRecord.Component !== Component) {
		if (rootRecord) destroyRootRecord(rootRecord)
		rootRecord = createRootRecord(Component, target, props, options)
		rootMap.set(target, rootRecord)
		performRootRender(rootRecord, hydrateOnly)
		return rootRecord.topRuntime.model
	}

	rootRecord.options = options
	syncComponentProps(rootRecord.topRuntime, props)
	performRootRender(rootRecord, hydrateOnly && !rootRecord.mounted)
	return rootRecord.topRuntime.model
}

/**
 * Hydrate a Pepper component tree into existing server-rendered DOM.
 *
 * @template {Record<string, unknown>} [Props=Record<string, unknown>]
 * @param {(api: {
 *   getProps(): Props,
 *   onMount(handler: () => void | (() => void)): void,
 *   onProps(handler: (changedProps: string[], oldProps: Props) => void): void,
 *   update(callback?: (() => void)): void,
 * }) => { render(html: typeof baseHtml): unknown } | ((html: typeof baseHtml) => unknown)} Component
 * @param {string | Element} container
 * @param {Props} [props={}]
 * @param {RenderOptions} [options={}]
 * @returns {{ render?: (html: typeof baseHtml) => unknown, [key: string]: unknown }}
 */
function hydrate(Component, container, props = {}, options = {}) {
	return mountRoot(Component, container, props, options, true)
}

/**
 * Render a Pepper component tree into a DOM container.
 *
 * @template {Record<string, unknown>} [Props=Record<string, unknown>]
 * @param {(api: {
 *   getProps(): Props,
 *   onMount(handler: () => void | (() => void)): void,
 *   onProps(handler: (changedProps: string[], oldProps: Props) => void): void,
 *   update(callback?: (() => void)): void,
 * }) => { render(html: typeof baseHtml): unknown } | ((html: typeof baseHtml) => unknown)} Component
 * @param {string | Element} container
 * @param {Props} [props={}]
 * @param {RenderOptions} [options={}]
 * @returns {{ render?: (html: typeof baseHtml) => unknown, [key: string]: unknown }}
 */
function render(Component, container, props = {}, options = {}) {
	return mountRoot(Component, container, props, options, false)
}

/**
 * Render a Pepper component to an HTML string using the SSR backend.
 *
 * @template {Record<string, unknown>} [Props=Record<string, unknown>]
 * @param {(api: {
 *   getProps(): Props,
 *   onMount(handler: () => void | (() => void)): void,
 *   onProps(handler: (changedProps: string[], oldProps: Props) => void): void,
 *   update(callback?: (() => void)): void,
 * }) => { render(html: import('./ssr.js').html): unknown } | ((html: import('./ssr.js').html) => unknown)} Component
 * @param {Props} [props={}]
 * @returns {string}
 */
function renderToString(Component, props = {}) {
	return renderComponentToString(Component, props)
}

publicTagsHolder.domTags = createDomTags()
/**
 * A Pepper `html` template tag function for component-aware DOM rendering and hydration.
 *
 * @type {typeof baseHtml}
 */
const html = publicTagsHolder.domTags.html
/**
 * A Pepper `svg` template tag function for DOM rendering and hydration.
 *
 * @type {typeof baseSvg}
 */
const svg = baseSvg
/**
 * A Pepper `mathml` template tag function for DOM rendering and hydration.
 *
 * @type {typeof baseMathml}
 */
const mathml = baseMathml

export {
	component,
	force,
	html,
	hydrate,
	mathml,
	rawText,
	ref,
	render,
	renderToString,
	state,
	Store,
	svg,
	unsafeHTML,
	unsafeMathML,
	unsafeSVG,
}
