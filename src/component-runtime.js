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
 * @typedef {<Dependencies extends readonly unknown[] = readonly []>(handler: (dependencies: Dependencies, previousDependencies: Dependencies | undefined) => void | (() => void), getDependencies?: () => Dependencies) => void} EffectRegistrar
 * @typedef {{
 *   effect: EffectRegistrar,
 *   getProps(): Record<string, unknown>,
 *   getContext(key: string): unknown,
 *   getError(): unknown | null,
 *   hasContext(key: string): boolean,
 *   resetError(): void,
 *   setContext(key: string, value: unknown): unknown,
 *   update(callback?: RenderCallback): void,
 * }} ComponentSetupApi
 * @typedef {{ render(html: TemplateTag): unknown, [key: string]: unknown }} ComponentModel
 * @typedef {(api: any) => ComponentModel | ((html: TemplateTag) => unknown)} PepperComponent
 * @typedef {{
 *   autoEffectEvent: boolean,
 *   errorBoundary: boolean,
 *   memo: boolean,
 *   propsComparator: ((previousProps: Record<string, unknown>, nextProps: Record<string, unknown>) => true | readonly string[]) | null,
 * }} ComponentOptions
 * @typedef {PepperComponent & { [COMPONENT_SYMBOL]?: ComponentDefinition }} ConfigurableComponent
 * @typedef {{ factory: PepperComponent, options: ComponentOptions }} ComponentDefinition
 * @typedef {{
 *   context?: Map<string, unknown>,
 *   contextConsumers?: Map<string, Set<ComponentRuntime>>,
 *   pendingCallbacks: RenderCallback[],
 *   dirtyRuntimes?: Set<ComponentRuntime>,
 *   pendingEffects?: Set<ComponentRuntime>,
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
 *   contextDependencies: Set<string>,
 *   currentNodes: Node[] | null,
 *   currentRenderable: unknown,
 *   currentTemplateInstance: { activate(): void, deactivate(): void } | null,
 *   domBoundary?: Text,
 *   childrenValues?: unknown[],
 *   debugKeyNodes?: Element[],
 *   destroyed: boolean,
 *   dirty: boolean,
 *   idBase: string | null,
 *   nextChildId: number,
 *   idLocalCounter: number,
 *   idPath: string[],
 *   lastSeen: number,
 *   model: ComponentModel | null,
 *   effects: Array<{
 *     cleanup: (() => void) | null,
 *     dependencies: readonly unknown[] | null,
 *     getDependencies: (() => readonly unknown[]) | null,
 *     handler: (dependencies: readonly unknown[], previousDependencies: readonly unknown[] | undefined) => void | (() => void),
 *   }>,
 *   options: ComponentOptions,
 *   parentRuntime: ComponentRuntime | null,
 *   nextContextDependencies: Set<string> | null,
 *   portals: Map<unknown, { currentNodes: ChildNode[], currentTarget: Element | null, destroy(): void, lastSeen: number, viewKey: symbol }>,
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
 *   effect(handler: (dependencies: readonly unknown[], previousDependencies: readonly unknown[] | undefined) => void | (() => void), getDependencies?: () => readonly unknown[]): void,
 *   resetError(): void,
 *   update(callback?: (() => void)): void,
 * }) => { render(html: import('./html.js').html): unknown } | ((html: import('./html.js').html) => unknown)} factory
 * @param {{
 *   autoEffectEvent?: boolean,
 *   errorBoundary?: boolean,
 *   memo?: boolean,
 *   propsComparator?: ((previousProps: Props, nextProps: Props) => true | readonly string[]) | null,
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
	while (boundary && (boundary.destroyed || !boundary.options.errorBoundary)) boundary = boundary.parentRuntime
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
	runtime.nextContextDependencies?.add(key)
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
	runtime.nextContextDependencies?.add(key)
	return runtime.rootRecord.context?.has(key) === true
}

/**
 * @param {ComponentRuntime} runtime
 * @param {Set<string>} nextDependencies
 * @returns {void}
 */
function syncContextDependencies(runtime, nextDependencies) {
	const consumersByKey = runtime.rootRecord.contextConsumers
	for (const key of runtime.contextDependencies) {
		if (nextDependencies.has(key)) continue
		const consumers = consumersByKey?.get(key)
		consumers?.delete(runtime)
		if (!consumers?.size) consumersByKey?.delete(key)
	}
	for (const key of nextDependencies) {
		let consumers = consumersByKey?.get(key)
		if (!consumers) consumersByKey?.set(key, (consumers = new Set()))
		consumers?.add(runtime)
	}
	runtime.contextDependencies = nextDependencies
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
 * @param {{ idPath: string[], nextChildId: number }} ownerRuntime
 * @returns {string[]}
 */
function createChildIdPath(ownerRuntime) {
	return [...ownerRuntime.idPath, `c${ownerRuntime.nextChildId++}`]
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
 * @param {Record<string, unknown>} [nextProps={}]
 * @returns {void}
 */
function syncComponentProps(runtime, nextProps = {}) {
	const oldProps = runtime.props
	const normalizedProps = {...nextProps}
	let changed = false
	if (typeof runtime.options.propsComparator === 'function') {
		const result = runtime.options.propsComparator(oldProps, normalizedProps)
		if (result !== true && (!Array.isArray(result) || result.some(key => typeof key !== 'string')))
			throw new TypeError('Pepper propsComparator must return true or an array of changed prop names.')
		changed = result !== true && result.length > 0
	} else {
		for (const key of new Set([...Object.keys(oldProps), ...Object.keys(normalizedProps)])) {
			if (!Object.hasOwn(normalizedProps, key)) {
				changed = true
				continue
			}
			if (runtime.options.autoEffectEvent !== false && typeof normalizedProps[key] === 'function' && /^on[A-Z]/.test(key)) continue
			const previousValue = oldProps[key]
			const nextValue = normalizedProps[key]
			const isSame = runtime.options.memo === false ? Object.is(previousValue, nextValue) : isEqual(previousValue, nextValue)
			if (!Object.hasOwn(oldProps, key) || !isSame) changed = true
		}
	}

	runtime.props = normalizedProps
	if (changed) runtime.dirty = true
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
		contextDependencies: new Set(),
		contextValues: null,
		currentNodes: null,
		currentRenderable: null,
		currentTemplateInstance: null,
		destroyed: false,
		dirty: true,
		idBase: null,
		nextChildId: 0,
		idLocalCounter: 0,
		idPath,
		lastSeen: 0,
		model: null,
		effects: [],
		options: definition.options,
		parentRuntime,
		nextContextDependencies: null,
		portals: new Map(),
		props: {...props},
		refs: [],
		renderPassId: 0,
		rootRecord,
		viewKey: Symbol('pepper-view'),
	}
	/** @type {ComponentSetupApi} */
	const setupApi = {
		effect: (handler, getDependencies) => {
			if (currentSetupRuntime !== runtime) throw new Error('Pepper effect() can only be registered while creating a component.')
			if (typeof handler !== 'function' || (getDependencies != null && typeof getDependencies !== 'function'))
				throw new TypeError('Pepper effect() expects a function and an optional dependency function.')
			runtime.effects.push({cleanup: null, dependencies: null, getDependencies: getDependencies || null, handler: /** @type {any} */ (handler)})
		},
		getProps: () => runtime.props,
		getContext: key => getContextValue(runtime, key),
		getError: () => runtime.capturedError === NO_ERROR ? null : runtime.capturedError,
		hasContext: key => hasContextValue(runtime, key),
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

	return runtime
}

/**
 * @param {ComponentRuntime} runtime
 * @param {RuntimeTags} tags
 * @returns {unknown}
 */
function renderComponentRuntime(runtime, tags) {
	if (
		runtime.renderPassId > 0 &&
		!runtime.dirty
	) {
		runtime.renderPassId++
		return runtime.currentRenderable
	}

	if (!runtime.model) throw new Error('Pepper component runtime is missing its model.')
	const model = runtime.model

	while (true) {
		runtime.renderPassId++
		runtime.nextContextDependencies = runtime.rootRecord.pendingEffects ? new Set() : null
		try {
			runtime.currentRenderable = runWithOwnerRuntime(runtime, () => model.render.call(model, tags.html))
			runtime.rootRecord.pendingEffects?.add(runtime)
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
}

/**
 * @param {ComponentRuntime | null | undefined} runtime
 * @returns {void}
 */
function destroyComponentRuntime(runtime) {
	if (!runtime || runtime.destroyed) return
	runtime.destroyed = true
	/** @type {unknown} */
	let cleanupError = NO_ERROR
	for (const store of runtime.childStores.values()) {
		for (const childRuntime of store.values()) {
			try {
				destroyComponentRuntime(childRuntime)
			} catch (error) {
				cleanupError = error
			}
		}
		store.clear()
	}
	runtime.childStores.clear()
	for (const portalRuntime of runtime.portals.values()) portalRuntime.destroy()
	runtime.portals.clear()
	runtime.currentTemplateInstance?.deactivate()
	runtime.currentTemplateInstance = null
	runtime.currentNodes = null
	runtime.rootRecord.pendingEffects?.delete(runtime)
	syncContextDependencies(runtime, new Set())
	for (const effect of runtime.effects) {
		const cleanup = effect.cleanup
		effect.cleanup = null
		if (!cleanup) continue
		try {
			cleanup()
		} catch (error) {
			cleanupError = error
		}
	}
	for (const runtimeRef of runtime.refs) runtimeRef.current = null
	if (cleanupError !== NO_ERROR) {
		if (isErrorBoundarySignal(cleanupError)) throw cleanupError
		throwBoundaryError(runtime, cleanupError)
	}
}

/**
 * @param {RootRecord} rootRecord
 * @returns {void}
 */
function flushEffects(rootRecord) {
	const pendingEffects = [...(rootRecord.pendingEffects || [])]
	rootRecord.pendingEffects?.clear()
	for (let index = 0; index < pendingEffects.length; index++) {
		const runtime = pendingEffects[index]
		if (runtime.destroyed) continue
		try {
			const nextContextDependencies = runtime.nextContextDependencies || new Set()
			/** @type {Array<{ effect: ComponentRuntime['effects'][number], dependencies: readonly unknown[], previousDependencies: readonly unknown[] | undefined }>} */
			const changedEffects = []
			for (const effect of runtime.effects) {
				const dependencies = effect.getDependencies ? effect.getDependencies() : []
				if (!Array.isArray(dependencies)) throw new TypeError('Pepper effect() dependencies must be an array.')
				const previousDependencies = effect.dependencies || undefined
				if (!effect.getDependencies || !previousDependencies || dependencies.length !== previousDependencies.length || dependencies.some((value, dependencyIndex) => !Object.is(value, previousDependencies[dependencyIndex])))
					changedEffects.push({effect, dependencies, previousDependencies})
			}
			syncContextDependencies(runtime, nextContextDependencies)
			runtime.nextContextDependencies = null
			/** @type {unknown} */
			let cleanupError = NO_ERROR
			for (const {effect, dependencies} of changedEffects) {
				const cleanup = effect.cleanup
				effect.cleanup = null
				effect.dependencies = dependencies
				try {
					cleanup?.()
				} catch (error) {
					cleanupError = error
				}
			}
			if (cleanupError !== NO_ERROR) throw cleanupError
			for (const {effect, dependencies, previousDependencies} of changedEffects) {
				const cleanup = effect.handler(dependencies, previousDependencies)
				if (typeof cleanup === 'function') effect.cleanup = cleanup
			}
		} catch (error) {
			for (const pendingRuntime of pendingEffects.slice(index + 1)) rootRecord.pendingEffects?.add(pendingRuntime)
			throwBoundaryError(runtime, error)
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
	flushEffects,
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
