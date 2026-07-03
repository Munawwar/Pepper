import { isEqual } from './utils.js'

const COMPONENT_SYMBOL = Symbol('pepper-component')
const ERROR_BOUNDARY_SIGNAL = Symbol('pepper-error-boundary-signal')
const NO_ERROR = Symbol('pepper-no-error')
const defaultComponentOptions = {
	autoEffectEvent: true,
	errorBoundary: false,
	memo: true,
	propsComparator: null,
}
/** @type {ComponentRuntime | null} */
let currentSetupRuntime = null
/** @type {ComponentRuntime | null} */
let currentOwnerRuntime = null

/**
 * @typedef {() => void} RenderCallback
 * @typedef {{ current: Node | null }} RuntimeRef
 * @typedef {(strings: TemplateStringsArray, ...values: readonly unknown[]) => unknown} TemplateTag
 * @typedef {{ html: TemplateTag }} RuntimeTags
 * @typedef {Record<string, unknown> | Map<string, unknown>} ContextInput
 * @typedef {{
 *   getProps(): Record<string, unknown>,
 *   getContext(key: string): unknown,
 *   getError(): unknown | null,
 *   hasContext(key: string): boolean,
 *   onMount(handler: () => void | (() => void)): void,
 *   onProps(handler: (changedProps: string[], oldProps: Record<string, unknown>) => void): void,
 *   resetError(): void,
 *   setContext(key: string, value: unknown): unknown,
 *   update(callback?: RenderCallback): void,
 * }} ComponentSetupApi
 * @typedef {{ render(html: TemplateTag): unknown, [key: string]: unknown }} ComponentModel
 * @typedef {(api: ComponentSetupApi) => ComponentModel | ((html: TemplateTag) => unknown)} PepperComponent
 * @typedef {{
 *   autoEffectEvent: boolean,
 *   errorBoundary: boolean,
 *   memo: boolean,
 *   propsComparator: ((previousProps: Record<string, unknown>, nextProps: Record<string, unknown>) => boolean) | null,
 * }} ComponentOptions
 * @typedef {PepperComponent & { [COMPONENT_SYMBOL]?: ComponentDefinition }} ConfigurableComponent
 * @typedef {{ factory: PepperComponent, options: ComponentOptions }} ComponentDefinition
 * @typedef {{
 *   context?: Map<string, unknown>,
 *   pendingCallbacks: RenderCallback[],
 *   dirtyRuntimes?: Set<ComponentRuntime>,
 *   pendingMounts: ComponentRuntime[],
 *   identifierPrefix?: string,
 *   scheduleRender(): void,
 *   domTags?: RuntimeTags,
 *   options?: { debugKeys?: boolean },
 *   [key: string]: unknown,
 * }} RootRecord
 * @typedef {{
 *   childStores: Map<unknown, Map<unknown, ComponentRuntime>>,
 *   capturedError: unknown,
 *   componentType: PepperComponent,
 *   contextValues: Map<string, unknown> | null,
 *   currentNodes: Node[] | null,
 *   currentRenderable: unknown,
 *   childrenValues?: unknown[],
 *   debugKeyNodes?: Element[],
 *   destroyed: boolean,
 *   dirty: boolean,
 *   hasDirtyDescendant: boolean,
 *   idBase: string | null,
 *   idChildCounters: Map<string, number>,
 *   idLocalCounter: number,
 *   idPath: string[],
 *   lastSeen: number,
 *   model: ComponentModel | null,
 *   mountCleanups: Array<() => void>,
 *   mountHandlers: Array<() => void | (() => void)>,
 *   needsMount: boolean,
 *   options: ComponentOptions,
 *   parentRuntime: ComponentRuntime | null,
 *   pendingChangedProps: string[],
 *   pendingOldProps: Record<string, unknown>,
 *   portals: Map<unknown, { currentNodes: ChildNode[], currentTarget: Element | null, destroy(): void, lastSeen: number, viewKey: symbol }>,
 *   propHandlers: Array<(changedProps: string[], oldProps: Record<string, unknown>) => void>,
 *   props: Record<string, unknown>,
 *   refs: RuntimeRef[],
 *   renderPassId: number,
 *   rootRecord: RootRecord,
 *   viewKey: symbol,
 * }} ComponentRuntime
 * @typedef {{
 *   [ERROR_BOUNDARY_SIGNAL]: true,
 *   boundary: ComponentRuntime,
 *   error: unknown,
 * }} ErrorBoundarySignal
 */

/**
 * Wrap a function component with explicit Pepper runtime options.
 *
 * @template {Record<string, unknown>} [Props=Record<string, unknown>]
 * @param {(api: {
 *   getProps(): Props,
 *   getError(): unknown | null,
 *   onMount(handler: () => void | (() => void)): void,
 *   onProps(handler: (changedProps: string[], oldProps: Props) => void): void,
 *   resetError(): void,
 *   update(callback?: (() => void)): void,
 * }) => { render(html: import('./html.js').html): unknown } | ((html: import('./html.js').html) => unknown)} factory
 * @param {{
 *   autoEffectEvent?: boolean,
 *   errorBoundary?: boolean,
 *   memo?: boolean,
 *   propsComparator?: ((previousProps: Props, nextProps: Props) => boolean) | null,
 * }} [options]
 * @returns {PepperComponent}
 */
function component(factory, options = {}) {
	if (typeof factory !== 'function') throw new TypeError('Pepper component() expects a function.')
	const wrapped = /** @type {ConfigurableComponent} */ (function PepperConfiguredComponent(api) {
		return factory(/** @type {any} */ (api))
	})
	wrapped[COMPONENT_SYMBOL] = {
		factory: /** @type {PepperComponent} */ (factory),
		options: {
			...defaultComponentOptions,
			.../** @type {ComponentOptions} */ (options),
		},
	}
	return wrapped
}

/**
 * @param {unknown} value
 * @returns {value is ErrorBoundarySignal}
 */
function isErrorBoundarySignal(value) {
	return !!value && typeof value === 'object' && ERROR_BOUNDARY_SIGNAL in value
}

/**
 * @param {ComponentRuntime} runtime
 * @param {unknown} error
 * @param {boolean} [includeSelf=false]
 * @returns {never}
 */
function throwBoundaryError(runtime, error, includeSelf = false) {
	let boundary = includeSelf ? runtime : runtime.parentRuntime
	while (boundary && !boundary.options.errorBoundary) boundary = boundary.parentRuntime
	if (!boundary) throw error
	throw {[ERROR_BOUNDARY_SIGNAL]: true, boundary, error}
}

/**
 * @param {ComponentRuntime} runtime
 * @param {unknown} error
 * @returns {void}
 */
function captureBoundaryError(runtime, error) {
	runtime.capturedError = error
	runtime.dirty = true
}

/**
 * @template T
 * @param {ComponentRuntime} runtime
 * @param {() => T} callback
 * @returns {T}
 */
function runWithOwnerRuntime(runtime, callback) {
	const previousOwnerRuntime = currentOwnerRuntime
	currentOwnerRuntime = runtime
	try {
		return callback()
	} finally {
		currentOwnerRuntime = previousOwnerRuntime
	}
}

/**
 * @param {unknown} componentType
 * @returns {ComponentDefinition}
 */
function getComponentDefinition(componentType) {
	if (typeof componentType !== 'function') throw new TypeError('Pepper component tags expect a function component.')
	const metadata = /** @type {ConfigurableComponent} */ (componentType)[COMPONENT_SYMBOL]
	return metadata || {
		factory: /** @type {PepperComponent} */ (componentType),
		options: defaultComponentOptions,
	}
}

/**
 * Create component-local state.
 *
 * @template T
 * @param {T} initialValue
 * @param {(nextValue: T, previousValue: T) => boolean} [comparator=isEqual]
 * @returns {[() => T, (valueOrSetter: T | ((value: T) => T), callback?: false | (() => void)) => void]}
 */
function state(initialValue, comparator = isEqual) {
	const runtime = currentSetupRuntime
	if (!runtime) throw new Error('state() can only be used while creating a Pepper component.')
	let value = initialValue
	return [
		() => value,
		(valueOrSetter, callback) => {
			const nextValue = typeof valueOrSetter === 'function'
				? /** @type {(value: T) => T} */ (valueOrSetter)(value)
				: valueOrSetter
			if (comparator(nextValue, value)) return
			value = nextValue
			if (callback === false) return
			markRuntimeDirty(runtime, callback)
		},
	]
}

/**
 * @param {ContextInput | undefined} context
 * @returns {Map<string, unknown>}
 */
function createContextValues(context) {
	if (context instanceof Map) return new Map(context)
	return new Map(Object.entries(context || {}))
}

/**
 * @param {ComponentRuntime} runtime
 * @param {string} key
 * @returns {unknown}
 */
function getContextValue(runtime, key) {
	/** @type {ComponentRuntime | null} */
	let current = runtime
	while (current) {
		if (current.contextValues?.has(key)) return current.contextValues.get(key)
		current = current.parentRuntime
	}
	return runtime.rootRecord.context?.get(key)
}

/**
 * @param {ComponentRuntime} runtime
 * @param {string} key
 * @returns {boolean}
 */
function hasContextValue(runtime, key) {
	/** @type {ComponentRuntime | null} */
	let current = runtime
	while (current) {
		if (current.contextValues?.has(key)) return true
		current = current.parentRuntime
	}
	return runtime.rootRecord.context?.has(key) === true
}

/**
 * Create a mutable object ref populated with a DOM node after render.
 *
 * @template [T=Node]
 * @returns {{ current: T | null }}
 */
function ref() {
	/** @type {ComponentRuntime | null} */
	const runtime = currentSetupRuntime
	if (!runtime) throw new Error('ref() can only be used while creating a Pepper component.')
	const refObject = { current: null }
	runtime.refs.push(refObject)
	return refObject
}

/**
 * Create a deterministic DOM id scoped to the current component instance.
 *
 * @returns {string}
 */
function stableId() {
	const runtime = currentSetupRuntime
	if (!runtime) throw new Error('stableId() can only be used while creating a Pepper component.')
	if (runtime.idBase == null) runtime.idBase = hashIdPath(runtime.idPath)
	return `${runtime.rootRecord.identifierPrefix || ''}p-${runtime.idBase}-${runtime.idLocalCounter++}`
}

/**
 * @param {string[]} parts
 * @returns {string}
 */
function hashIdPath(parts) {
	let hash = 0x811c9dc5
	for (const part of parts) {
		for (let index = 0; index < part.length; index++) {
			hash ^= part.charCodeAt(index)
			hash = Math.imul(hash, 0x01000193)
		}
		hash ^= 0xff
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(36)
}

/**
 * @param {{ idPath: string[], idChildCounters: Map<string, number> }} ownerRuntime
 * @param {number} descriptorIndex
 * @param {unknown} key
 * @returns {string[]}
 */
function createChildIdPath(ownerRuntime, descriptorIndex, key) {
	const site = `c${descriptorIndex}`
	if (key != null) return [...ownerRuntime.idPath, `${site}:key:${String(key)}`]
	const count = ownerRuntime.idChildCounters.get(site) || 0
	ownerRuntime.idChildCounters.set(site, count + 1)
	return [...ownerRuntime.idPath, `${site}:index:${count}`]
}

/**
 * @param {ComponentRuntime} runtime
 * @param {RenderCallback} [callback]
 * @returns {void}
 */
function markRuntimeDirty(runtime, callback) {
	if (callback && runtime.rootRecord.pendingCallbacks) runtime.rootRecord.pendingCallbacks.push(callback)
	runtime.dirty = true
	runtime.rootRecord.dirtyRuntimes?.add(runtime)
	runtime.rootRecord.scheduleRender()
}

/**
 * @param {ComponentRuntime} runtime
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean}
 */
function shouldIgnorePropForMemo(runtime, key, value) {
	return runtime.options.autoEffectEvent !== false && typeof value === 'function' && /^on[A-Z]/.test(key)
}

/**
 * @param {ComponentRuntime} runtime
 * @param {Record<string, unknown>} [nextProps={}]
 * @param {boolean} [forceAll=false]
 * @returns {boolean}
 */
function syncComponentProps(runtime, nextProps = {}, forceAll = false) {
	const oldProps = runtime.props
	/** @type {Record<string, unknown>} */
	const normalizedProps = {}
	const keys = new Set([...Object.keys(oldProps), ...Object.keys(nextProps)])
	const changedProps = []

	for (const key of keys) {
		if (!(key in nextProps)) {
			if (forceAll || key in oldProps) changedProps.push(key)
			continue
		}
		normalizedProps[key] = nextProps[key]
	}

	if (!forceAll) {
		if (typeof runtime.options.propsComparator === 'function') {
			if (!runtime.options.propsComparator(oldProps, normalizedProps)) {
				changedProps.push(...Object.keys(normalizedProps).filter(key => !(key in oldProps)))
				for (const key of keys) {
					if (!(key in nextProps) || shouldIgnorePropForMemo(runtime, key, nextProps[key])) continue
					if (!(key in oldProps) || !Object.is(oldProps[key], nextProps[key])) changedProps.push(key)
				}
			}
		} else {
			for (const key of keys) {
				if (!(key in nextProps) || shouldIgnorePropForMemo(runtime, key, nextProps[key])) continue
				const previousValue = oldProps[key]
				const nextValue = nextProps[key]
				const isSame = runtime.options.memo === false ? Object.is(previousValue, nextValue) : isEqual(previousValue, nextValue)
				if (!(key in oldProps) || !isSame) changedProps.push(key)
			}
		}
	} else {
		changedProps.push(...keys)
	}

	runtime.props = normalizedProps
	runtime.pendingChangedProps = changedProps
	runtime.pendingOldProps = oldProps
	return changedProps.length > 0
}

/**
 * @template {Record<string, unknown>} [Props=Record<string, unknown>]
 * @param {PepperComponent} componentType
 * @param {Props} props
 * @param {RootRecord} rootRecord
 * @param {ComponentRuntime | null} [parentRuntime=null]
 * @param {string[]} [idPath]
 * @returns {ComponentRuntime}
 */
function createComponentRuntime(componentType, props, rootRecord, parentRuntime = null, idPath = parentRuntime?.idPath || []) {
	const definition = getComponentDefinition(componentType)
	/** @type {ComponentRuntime} */
	const runtime = {
		childStores: new Map(),
		capturedError: NO_ERROR,
		componentType,
		contextValues: null,
		currentNodes: null,
		currentRenderable: null,
		destroyed: false,
		dirty: true,
		hasDirtyDescendant: false,
		idBase: null,
		idChildCounters: new Map(),
		idLocalCounter: 0,
		idPath,
		lastSeen: 0,
		model: null,
		mountCleanups: [],
		mountHandlers: [],
		needsMount: true,
		options: definition.options,
		parentRuntime,
		pendingChangedProps: [],
		pendingOldProps: {},
		portals: new Map(),
		propHandlers: [],
		props: {},
		refs: [],
		renderPassId: 0,
		rootRecord,
		viewKey: Symbol('pepper-view'),
	}
	syncComponentProps(runtime, props, true)
	runtime.pendingChangedProps = []
	runtime.pendingOldProps = runtime.props

	/** @type {ComponentSetupApi} */
	const setupApi = {
		getProps: () => runtime.props,
		getContext: key => getContextValue(runtime, key),
		getError: () => runtime.capturedError === NO_ERROR ? null : runtime.capturedError,
		hasContext: key => hasContextValue(runtime, key),
		onMount: handler => {
			runtime.mountHandlers.push(handler)
		},
		onProps: handler => {
			runtime.propHandlers.push(handler)
		},
		resetError: () => {
			if (runtime.capturedError === NO_ERROR) return
			runtime.capturedError = NO_ERROR
			markRuntimeDirty(runtime)
			if (runtime.parentRuntime) markRuntimeDirty(runtime.parentRuntime)
		},
		setContext: (key, value) => {
			if (!runtime.contextValues) runtime.contextValues = new Map()
			runtime.contextValues.set(key, value)
			return value
		},
		update: callback => {
			markRuntimeDirty(runtime, callback)
		},
	}

	const previousRuntime = currentSetupRuntime
	currentSetupRuntime = runtime
	try {
		const model = definition.factory(setupApi)
		runtime.model = typeof model === 'function' ? { render: model } : model
		if (!runtime.model || typeof runtime.model.render !== 'function') {
			throw new Error('Pepper components must return a render function or an object with a render(html) method.')
		}
	} finally {
		currentSetupRuntime = previousRuntime
	}

	if (rootRecord.pendingMounts) rootRecord.pendingMounts.push(runtime)
	return runtime
}

/**
 * @param {ComponentRuntime} runtime
 * @param {RuntimeTags} tags
 * @returns {unknown}
 */
function renderComponentRuntime(runtime, tags) {
	if (
		runtime.currentRenderable &&
		!runtime.dirty &&
		!runtime.hasDirtyDescendant &&
		!runtime.pendingChangedProps.length
	) return runtime.currentRenderable

	if (runtime.pendingChangedProps.length) {
		for (const handler of runtime.propHandlers) handler(runtime.pendingChangedProps, runtime.pendingOldProps)
	}
	if (!runtime.model) throw new Error('Pepper component runtime is missing its model.')
	const model = runtime.model

	while (true) {
		runtime.renderPassId++
		runtime.idChildCounters.clear()
		try {
			runtime.currentRenderable = runWithOwnerRuntime(runtime, () => model.render.call(model, tags.html))
			return runtime.currentRenderable
		} catch (error) {
			if (isErrorBoundarySignal(error) && error.boundary === runtime && runtime.options.errorBoundary && runtime.capturedError === NO_ERROR) {
				captureBoundaryError(runtime, error.error)
				continue
			}
			throwBoundaryError(runtime, error)
		}
	}
}

/**
 * @param {ComponentRuntime} runtime
 * @returns {void}
 */
function finalizeComponentRuntime(runtime) {
	for (const store of runtime.childStores.values()) {
		for (const [key, childRuntime] of store) {
			if (childRuntime.lastSeen === runtime.renderPassId) continue
			destroyComponentRuntime(childRuntime)
			store.delete(key)
		}
	}
	for (const [key, portalRuntime] of runtime.portals) {
		if (portalRuntime.lastSeen === runtime.renderPassId) continue
		portalRuntime.destroy()
		runtime.portals.delete(key)
	}
	runtime.dirty = false
	runtime.hasDirtyDescendant = false
	runtime.pendingChangedProps = []
	runtime.pendingOldProps = runtime.props
}

/**
 * @param {ComponentRuntime | null | undefined} runtime
 * @returns {void}
 */
function destroyComponentRuntime(runtime) {
	if (!runtime || runtime.destroyed) return
	runtime.destroyed = true
	for (const store of runtime.childStores.values()) {
		for (const childRuntime of store.values()) destroyComponentRuntime(childRuntime)
		store.clear()
	}
	runtime.childStores.clear()
	for (const portalRuntime of runtime.portals.values()) portalRuntime.destroy()
	runtime.portals.clear()
	runtime.currentNodes = null
	for (const cleanup of runtime.mountCleanups.splice(0)) cleanup()
	for (const runtimeRef of runtime.refs) runtimeRef.current = null
}

/**
 * @param {RootRecord} rootRecord
 * @returns {void}
 */
function flushMounts(rootRecord) {
	const pendingMounts = rootRecord.pendingMounts.splice(0)
	for (const runtime of pendingMounts) {
		if (runtime.destroyed || !runtime.needsMount) continue
		runtime.needsMount = false
		for (const handler of runtime.mountHandlers) {
			const cleanup = handler()
			if (typeof cleanup === 'function') runtime.mountCleanups.push(cleanup)
		}
	}
}

/**
 * @returns {ComponentRuntime | null}
 */
function getCurrentOwnerRuntime() {
	return currentOwnerRuntime
}

/**
 * @param {ComponentRuntime} ownerRuntime
 * @param {unknown} descriptor
 * @returns {Map<unknown, ComponentRuntime>}
 */
function getOrCreateChildStore(ownerRuntime, descriptor) {
	let store = ownerRuntime.childStores.get(descriptor)
	if (!store) ownerRuntime.childStores.set(descriptor, (store = new Map()))
	return store
}

export {
	component,
	createChildIdPath,
	createComponentRuntime,
	destroyComponentRuntime,
	finalizeComponentRuntime,
	flushMounts,
	getCurrentOwnerRuntime,
	getOrCreateChildStore,
	captureBoundaryError,
	isErrorBoundarySignal,
	createContextValues,
	ref,
	renderComponentRuntime,
	runWithOwnerRuntime,
	state,
	syncComponentProps,
	throwBoundaryError,
	stableId,
}
