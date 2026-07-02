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
	captureBoundaryError,
	createChildIdPath,
	createContextValues,
	createComponentRuntime,
	destroyComponentRuntime,
	finalizeComponentRuntime,
	flushMounts,
	getCurrentOwnerRuntime,
	getOrCreateChildStore,
	isErrorBoundarySignal,
	ref,
	renderComponentRuntime,
	runWithOwnerRuntime,
	state,
	syncComponentProps,
	throwBoundaryError,
	stableId,
} from './component-runtime.js'
import {
	compileComponentTemplate,
	lowerComponentTemplate,
	renderSourceTemplate,
	resolveComponentProps,
} from './component-syntax.js'
import { renderComponentToString } from './pepper-ssr.js'
import { Store } from './store.js'

/**
 * @typedef {string[] & { raw: string[] }} MutableTemplateStringsArray
 * @typedef {{
 *   context?: import('./component-runtime.js').ContextInput,
 *   debugKeys?: boolean,
 *   identifierPrefix?: string,
 * }} RenderOptions
 * @typedef {string | Element} PortalTarget
 * @typedef {import('./component-runtime.js').ComponentRuntime} ComponentRuntime
 * @typedef {import('./component-runtime.js').ComponentModel} ComponentModel
 * @typedef {import('./component-runtime.js').PepperComponent} PepperComponent
 * @typedef {import('./component-runtime.js').RuntimeTags} RuntimeTags
 * @typedef {import('./component-syntax.js').ComponentDescriptor} ComponentDescriptor
 * @typedef {{
 *   Component: PepperComponent,
 *   container: Element,
 *   context: Map<string, unknown>,
 *   dirtyRuntimes: Set<ComponentRuntime>,
 *   domTags: DomTags,
 *   flushScheduled: boolean,
 *   identifierPrefix: string,
 *   mounted: boolean,
 *   options: RenderOptions,
 *   pendingCallbacks: Array<() => void>,
 *   pendingMounts: ComponentRuntime[],
 *   scheduleRender(): void,
 *   topRuntime: ComponentRuntime | null,
 * }} RootRecord
 * @typedef {{
 *   html(strings: TemplateStringsArray, ...values: unknown[]): ReturnType<typeof baseHtml>,
  *   mathml: typeof baseMathml,
  *   svg: typeof baseSvg,
 * }} DomTags
 */

/** @type {WeakMap<Element, RootRecord>} */
const rootMap = new WeakMap()

// Feature flags
const ENABLE_COMPONENT_NODE_CACHE = true

/** @type {TemplateStringsArray} */
const singleValueStrings = /** @type {TemplateStringsArray} */ (
	Object.assign(/** @type {MutableTemplateStringsArray} */ (['', '']), {raw: ['', '']})
)

/**
 * @param {unknown} renderable
 * @param {ComponentRuntime} runtime
 * @param {ChildNode[] | null} [liveNodes=null]
 * @returns {Node[]}
 */
function realizeDomRenderable(renderable, runtime, liveNodes = null) {
	const view = /** @type {(key?: symbol, liveNodes?: ChildNode[]) => Node[]} */ (
		typeof renderable === 'function'
			? renderable
			: /** @type {DomTags} */ (runtime.rootRecord.domTags).html(singleValueStrings, renderable)
	)
	const nodes = liveNodes ? view(runtime.viewKey, liveNodes) : view(runtime.viewKey)
	runtime.currentNodes = nodes
	return nodes
}

/**
 * @returns {DomTags}
 */
function createDomTags() {
	return {
		html(strings, ...values) {
			const compiled = compileComponentTemplate(strings)
			if (!compiled) return baseHtml(strings, ...values)
			const ownerRuntime = getCurrentOwnerRuntime()
			if (!ownerRuntime) {
				throw new Error('Pepper component tags can only be used while rendering a Pepper component.')
			}
			const lowered = lowerComponentTemplate(compiled, values, (entry, loweredValues, index) => (
				createDomComponentValue(ownerRuntime, entry, loweredValues, index)
			))
			if (!lowered) return baseHtml(strings, ...values)
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
const domTags = createDomTags()

/**
 * @param {ComponentRuntime} ownerRuntime
 * @param {ComponentDescriptor} descriptor
 * @param {unknown[]} values
 * @param {number} descriptorIndex
 * @returns {(instanceKey?: symbol) => Node[]}
 */
function createDomComponentValue(ownerRuntime, descriptor, values, descriptorIndex) {
	return function renderComponentValue(instanceKey = Symbol()) {
		const store = getOrCreateChildStore(ownerRuntime, descriptor)
		const componentType = /** @type {PepperComponent} */ (values[descriptor.componentIndex])
		const { key, props } = resolveComponentProps(descriptor.bindings, values)
		const childrenSource = descriptor.childrenSource
		const childKey = key ?? instanceKey
		const idPath = createChildIdPath(ownerRuntime, descriptorIndex, key)
		/** @type {ComponentRuntime | undefined} */
		let runtime = store.get(childKey)
		if (childrenSource != null) {
			props.children = () => runWithOwnerRuntime(
				/** @type {ComponentRuntime} */ (runtime),
				() => renderSourceTemplate(/** @type {DomTags} */ (ownerRuntime.rootRecord.domTags).html, childrenSource, values),
			)
		}
		if (!runtime || runtime.componentType !== componentType) {
			if (runtime) destroyComponentRuntime(runtime)
			try {
				runtime = createComponentRuntime(componentType, props, ownerRuntime.rootRecord, ownerRuntime, idPath)
			} catch (error) {
				throwBoundaryError(ownerRuntime, error, true)
			}
			store.set(childKey, runtime)
		} else {
			syncComponentProps(runtime, props)
		}

		runtime.lastSeen = ownerRuntime.renderPassId
		const nodes = (
			ENABLE_COMPONENT_NODE_CACHE &&
			runtime.currentNodes &&
			!runtime.dirty &&
			!runtime.hasDirtyDescendant &&
			!runtime.pendingChangedProps.length
			)
				? runtime.currentNodes
				: realizeDomRenderable(
					renderComponentRuntime(runtime, /** @type {RuntimeTags} */ (ownerRuntime.rootRecord.domTags)),
					runtime,
					runtime.options.errorBoundary ? /** @type {ChildNode[] | null} */ (runtime.currentNodes) : null,
				)
		const debugKeyValue = ownerRuntime.rootRecord.options?.debugKeys === true && key != null ? String(key) : ''
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

/**
 * @template {Record<string, unknown>} [Props=Record<string, unknown>]
 * @param {PepperComponent} Component
 * @param {Element} container
 * @param {Props} props
 * @param {RenderOptions} options
 * @returns {RootRecord}
 */
function createRootRecord(Component, container, props, options) {
	/** @type {RootRecord} */
	const rootRecord = {
		Component,
		container,
		context: createContextValues(options.context),
		dirtyRuntimes: new Set(),
		domTags,
		flushScheduled: false,
		mounted: false,
		pendingCallbacks: [],
		pendingMounts: [],
		options,
		identifierPrefix: options.identifierPrefix || '',
		scheduleRender() {},
		topRuntime: null,
	}
	rootRecord.scheduleRender = () => scheduleRootRender(rootRecord)
	rootRecord.topRuntime = createComponentRuntime(Component, props, rootRecord, null)
	return rootRecord
}

/**
 * @param {Element | null} target
 * @param {ChildNode[]} nodes
 * @returns {void}
 */
function removeOwnedNodes(target, nodes) {
	if (!target) return
	for (const node of nodes) {
		if (node.parentNode === target) node.remove()
	}
}

/**
 * @param {string | Element} container
 * @param {string} errorPrefix
 * @returns {Element}
 */
function resolveElementTarget(container, errorPrefix) {
	const target = typeof container === 'string' ? document.querySelector(container) : container
	if (!(target instanceof Element)) throw new Error(`${errorPrefix} must be a DOM element or selector.`)
	return target
}

/**
 * @param {RootRecord} rootRecord
 * @returns {void}
 */
function flushDirtyRuntimes(rootRecord) {
	const dirtyRuntimes = [...rootRecord.dirtyRuntimes]
		.filter(runtime => runtime.dirty && !runtime.destroyed)
		.filter(runtime => {
			for (let parent = runtime.parentRuntime; parent; parent = parent.parentRuntime) {
				if (rootRecord.dirtyRuntimes.has(parent) && parent.dirty && !parent.destroyed) return false
			}
			return true
		})
	rootRecord.dirtyRuntimes.clear()
	for (const runtime of dirtyRuntimes) {
		try {
			const renderable = renderComponentRuntime(runtime, rootRecord.domTags)
			const nodes = realizeDomRenderable(
				renderable,
				runtime,
				runtime !== rootRecord.topRuntime && runtime.options.errorBoundary
					? /** @type {ChildNode[] | null} */ (runtime.currentNodes)
					: null,
			)
			if (runtime === rootRecord.topRuntime && nodes.some(node => node.parentNode !== rootRecord.container)) {
				rootRecord.container.replaceChildren(...nodes)
			}
			finalizeComponentRuntime(runtime)
		} catch (error) {
			if (!isErrorBoundarySignal(error)) throw error
			captureBoundaryError(error.boundary, error.error)
			let retryRuntime = error.boundary
			for (let parent = error.boundary.parentRuntime; parent; parent = parent.parentRuntime) {
				if (parent !== runtime) continue
				retryRuntime = runtime
				break
			}
			const renderable = renderComponentRuntime(retryRuntime, rootRecord.domTags)
			const nodes = retryRuntime === rootRecord.topRuntime
				? realizeDomRenderable(renderable, retryRuntime)
				: realizeDomRenderable(renderable, retryRuntime, /** @type {ChildNode[] | null} */ (retryRuntime.currentNodes))
			if (retryRuntime === rootRecord.topRuntime) rootRecord.container.replaceChildren(...nodes)
			finalizeComponentRuntime(retryRuntime)
		}
	}
	flushMounts(rootRecord)
	for (const callback of rootRecord.pendingCallbacks.splice(0)) callback()
}

/**
 * @param {RootRecord} rootRecord
 * @param {boolean} [hydrateOnly=false]
 * @returns {void}
 */
function performRootRender(rootRecord, hydrateOnly = false) {
	if (!rootRecord.topRuntime) throw new Error('Pepper root is missing its top runtime.')
	if (
		!hydrateOnly &&
		rootRecord.mounted &&
		!rootRecord.topRuntime.dirty &&
		!rootRecord.topRuntime.hasDirtyDescendant &&
		!rootRecord.topRuntime.pendingChangedProps.length &&
		rootRecord.dirtyRuntimes.size
	) {
		flushDirtyRuntimes(rootRecord)
		return
	}
	rootRecord.dirtyRuntimes.clear()
	const liveNodes = hydrateOnly ? Array.from(rootRecord.container.childNodes) : null
	let renderable = renderComponentRuntime(rootRecord.topRuntime, rootRecord.domTags)
	let nodes
	try {
		nodes = realizeDomRenderable(renderable, rootRecord.topRuntime, liveNodes && liveNodes.length ? liveNodes : null)
	} catch (error) {
		if (!isErrorBoundarySignal(error)) throw error
		captureBoundaryError(error.boundary, error.error)
		renderable = renderComponentRuntime(rootRecord.topRuntime, rootRecord.domTags)
		nodes = realizeDomRenderable(renderable, rootRecord.topRuntime)
		rootRecord.container.replaceChildren(...nodes)
	}
	finalizeComponentRuntime(rootRecord.topRuntime)
	if (!rootRecord.mounted && !hydrateOnly) rootRecord.container.replaceChildren(...nodes)
	rootRecord.mounted = true
	flushMounts(rootRecord)
	for (const callback of rootRecord.pendingCallbacks.splice(0)) callback()
}

/**
 * @param {RootRecord} rootRecord
 * @returns {void}
 */
function scheduleRootRender(rootRecord) {
	if (rootRecord.flushScheduled) return
	rootRecord.flushScheduled = true
	queueMicrotask(() => {
		rootRecord.flushScheduled = false
		if (!rootRecord.topRuntime) throw new Error('Pepper root is missing its top runtime.')
		flushDirtyRuntimes(rootRecord)
	})
}

/**
 * @param {PepperComponent} Component
 * @param {string | Element} container
 * @param {Record<string, unknown>} [props={}]
 * @param {RenderOptions} [options={}]
 * @param {boolean} [hydrateOnly=false]
 * @returns {ComponentModel}
 */
function mountRoot(Component, container, props = {}, options = {}, hydrateOnly = false) {
	const target = resolveElementTarget(container, 'Pepper render/hydrate target')

	let rootRecord = rootMap.get(target)
	if (!rootRecord || rootRecord.Component !== Component) {
		if (rootRecord) {
			destroyComponentRuntime(rootRecord.topRuntime)
			rootMap.delete(rootRecord.container)
		}
		rootRecord = createRootRecord(Component, target, props, options)
		rootMap.set(target, rootRecord)
		performRootRender(rootRecord, hydrateOnly)
		if (!rootRecord.topRuntime?.model) throw new Error('Pepper root did not produce a component model.')
		return rootRecord.topRuntime.model
	}

	rootRecord.options = options
	rootRecord.identifierPrefix = options.identifierPrefix || ''
	syncComponentProps(/** @type {ComponentRuntime} */ (rootRecord.topRuntime), props)
	performRootRender(rootRecord, hydrateOnly && !rootRecord.mounted)
	if (!rootRecord.topRuntime?.model) throw new Error('Pepper root did not produce a component model.')
	return rootRecord.topRuntime.model
}

/**
 * Hydrate a Pepper component tree into existing server-rendered DOM.
 *
 * @param {PepperComponent} Component
 * @param {string | Element} container
 * @param {Record<string, unknown>} [props={}]
 * @param {RenderOptions} [options={}]
 * @returns {ComponentModel}
 */
function hydrate(Component, container, props = {}, options = {}) {
	return mountRoot(Component, container, props, options, true)
}

/**
 * Render a Pepper component tree into a DOM container.
 *
 * @param {PepperComponent} Component
 * @param {string | Element} container
 * @param {Record<string, unknown>} [props={}]
 * @param {RenderOptions} [options={}]
 * @returns {ComponentModel}
 */
function render(Component, container, props = {}, options = {}) {
	return mountRoot(Component, container, props, options, false)
}

/**
 * Render a Pepper component to an HTML string using the SSR backend.
 *
 * @param {PepperComponent} Component
 * @param {Record<string, unknown>} [props={}]
 * @param {RenderOptions} [options={}]
 * @returns {string}
 */
function renderToString(Component, props = {}, options = {}) {
	return renderComponentToString(Component, props, options)
}

/**
 * Render a Pepper subtree into another DOM container while keeping ownership,
 * context, and lifecycle under the current component runtime.
 *
 * Server rendering omits portal output.
 *
 * @param {PortalTarget} target
 * @param {unknown} renderable
 * @returns {(instanceKey?: symbol) => []}
 */
function portal(target, renderable) {
	const ownerRuntime = getCurrentOwnerRuntime()
	if (!ownerRuntime) throw new Error('portal() can only be used while rendering a Pepper component.')
	if (!ownerRuntime.rootRecord.domTags || typeof document === 'undefined') return () => []
	return function renderPortalValue(instanceKey = Symbol()) {
		let portalRuntime = ownerRuntime.portals.get(instanceKey)
		if (!portalRuntime) {
			const createdPortalRuntime = {
				currentNodes: [],
				currentTarget: null,
				viewKey: Symbol(`pepper-portal-${ownerRuntime.renderPassId}`),
				lastSeen: 0,
				destroy() {
					removeOwnedNodes(createdPortalRuntime.currentTarget, createdPortalRuntime.currentNodes)
					createdPortalRuntime.currentNodes = []
					createdPortalRuntime.currentTarget = null
				},
			}
			portalRuntime = createdPortalRuntime
			ownerRuntime.portals.set(instanceKey, portalRuntime)
		}

		const nextTarget = resolveElementTarget(target, 'Pepper portal target')
		const portalState = /** @type {{ currentNodes: ChildNode[], currentTarget: Element | null, viewKey: symbol, lastSeen: number, destroy(): void }} */ (portalRuntime)
		const liveNodes = portalState.currentTarget === nextTarget && portalState.currentNodes.length ? portalState.currentNodes : null
		if (!liveNodes && portalState.currentTarget && portalState.currentTarget !== nextTarget) {
			removeOwnedNodes(portalState.currentTarget, portalState.currentNodes)
			portalState.currentNodes = []
		}
		const view = /** @type {(key?: symbol, liveNodes?: ChildNode[]) => Node[]} */ (
			typeof renderable === 'function'
				? renderable
				: /** @type {DomTags} */ (ownerRuntime.rootRecord.domTags).html(singleValueStrings, renderable)
		)
		const nodes = /** @type {ChildNode[]} */ (liveNodes ? view(portalState.viewKey, portalState.currentNodes) : view(portalState.viewKey))
		if (!liveNodes) for (const node of nodes) nextTarget.append(node)
		portalState.currentNodes = nodes
		portalState.currentTarget = nextTarget
		portalState.lastSeen = ownerRuntime.renderPassId
		return []
	}
}

/**
 * A Pepper `html` template tag function for component-aware DOM rendering and hydration.
 *
 * @type {typeof baseHtml}
 */
const html = domTags.html
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
	portal,
	state,
	Store,
	svg,
	unsafeHTML,
	unsafeMathML,
	unsafeSVG,
	stableId,
}
