import { isEqual } from './utils.js'

const COMPONENT_SYMBOL = Symbol('pepper-component')
const defaultComponentOptions = {
	autoEffectEvent: true,
	memo: true,
	propsComparator: null,
}
let currentSetupRuntime = null
let currentOwnerRuntime = null

/**
 * Wrap a function component with explicit Pepper runtime options.
 *
 * @template {Record<string, unknown>} [Props=Record<string, unknown>]
 * @param {(api: {
 *   getProps(): Props,
 *   onMount(handler: () => void | (() => void)): void,
 *   onProps(handler: (changedProps: string[], oldProps: Props) => void): void,
 *   update(callback?: (() => void)): void,
 * }) => { render(html: import('./html.js').html): unknown } | ((html: import('./html.js').html) => unknown)} factory
 * @param {{
 *   autoEffectEvent?: boolean,
 *   memo?: boolean,
 *   propsComparator?: ((previousProps: Props, nextProps: Props) => boolean) | null,
 * }} [options]
 * @returns {typeof factory}
 */
function component(factory, options = {}) {
	if (typeof factory !== 'function') throw new TypeError('Pepper component() expects a function.')
	const wrapped = function PepperConfiguredComponent(api) {
		return factory(api)
	}
	wrapped[COMPONENT_SYMBOL] = {
		factory,
		options: {
			...defaultComponentOptions,
			...options,
		},
	}
	return wrapped
}

function getComponentDefinition(componentType) {
	if (typeof componentType !== 'function') throw new TypeError('Pepper component tags expect a function component.')
	const metadata = componentType[COMPONENT_SYMBOL]
	return metadata || {
		factory: componentType,
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
			const nextValue = typeof valueOrSetter === 'function' ? valueOrSetter(value) : valueOrSetter
			if (comparator(nextValue, value)) return
			value = nextValue
			if (callback === false) return
			markRuntimeDirty(runtime, callback)
		},
	]
}

/**
 * Create a mutable object ref populated with a DOM node after render.
 *
 * @template [T=Node]
 * @returns {{ current: T | null }}
 */
function ref() {
	const runtime = currentSetupRuntime
	if (!runtime) throw new Error('ref() can only be used while creating a Pepper component.')
	const refObject = { current: null }
	runtime.refs.push(refObject)
	return refObject
}

function markRuntimeDirty(runtime, callback) {
	if (callback && runtime.rootRecord.pendingCallbacks) runtime.rootRecord.pendingCallbacks.push(callback)
	runtime.dirty = true
	for (let parent = runtime.parentRuntime; parent; parent = parent.parentRuntime) parent.hasDirtyDescendant = true
	runtime.rootRecord.scheduleRender()
}

function shouldIgnorePropForMemo(runtime, key, value) {
	return (
		runtime.options.autoEffectEvent !== false &&
		typeof value === 'function' &&
		/^on[A-Z]/.test(key)
	)
}

function syncComponentProps(runtime, nextProps = {}, forceAll = false) {
	const oldProps = runtime.props
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

function createComponentRuntime(componentType, props, rootRecord, parentRuntime = null) {
	const definition = getComponentDefinition(componentType)
	const runtime = {
		childStores: new Map(),
		componentType,
		currentRenderable: null,
		destroyed: false,
		dirty: true,
		factory: definition.factory,
		hasDirtyDescendant: false,
		lastSeen: 0,
		model: null,
		mountCleanups: [],
		mountHandlers: [],
		needsMount: true,
		options: definition.options,
		parentRuntime,
		pendingChangedProps: [],
		pendingOldProps: {},
		propHandlers: [],
		props: {},
		refs: [],
		renderPassId: 0,
		rootRecord,
		viewKey: Symbol('pepper-view'),
	}
	syncComponentProps(runtime, props, true)

	const api = {
		getProps: () => runtime.props,
		onMount: handler => {
			runtime.mountHandlers.push(handler)
		},
		onProps: handler => {
			runtime.propHandlers.push(handler)
		},
		update: callback => {
			markRuntimeDirty(runtime, callback)
		},
	}

	const previousRuntime = currentSetupRuntime
	currentSetupRuntime = runtime
	try {
		const model = definition.factory(api)
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

	runtime.renderPassId++
	const previousOwnerRuntime = currentOwnerRuntime
	currentOwnerRuntime = runtime
	try {
		runtime.currentRenderable = runtime.model.render.call(runtime.model, tags.html)
	} finally {
		currentOwnerRuntime = previousOwnerRuntime
	}
	return runtime.currentRenderable
}

function finalizeComponentRuntime(runtime) {
	cleanupComponentChildren(runtime)
	runtime.dirty = false
	runtime.hasDirtyDescendant = false
	runtime.pendingChangedProps = []
	runtime.pendingOldProps = runtime.props
}

function cleanupComponentChildren(runtime) {
	for (const store of runtime.childStores.values()) {
		for (const [key, childRuntime] of store) {
			if (childRuntime.lastSeen === runtime.renderPassId) continue
			destroyComponentRuntime(childRuntime)
			store.delete(key)
		}
	}
}

function destroyComponentRuntime(runtime) {
	if (!runtime || runtime.destroyed) return
	runtime.destroyed = true
	for (const store of runtime.childStores.values()) {
		for (const childRuntime of store.values()) destroyComponentRuntime(childRuntime)
		store.clear()
	}
	runtime.childStores.clear()
	for (const cleanup of runtime.mountCleanups.splice(0)) cleanup()
	for (const runtimeRef of runtime.refs) runtimeRef.current = null
}

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

function getCurrentOwnerRuntime() {
	return currentOwnerRuntime
}

function getOrCreateChildStore(ownerRuntime, descriptor) {
	let store = ownerRuntime.childStores.get(descriptor)
	if (!store) ownerRuntime.childStores.set(descriptor, (store = new Map()))
	return store
}

export {
	component,
	createComponentRuntime,
	destroyComponentRuntime,
	finalizeComponentRuntime,
	flushMounts,
	getComponentDefinition,
	getCurrentOwnerRuntime,
	getOrCreateChildStore,
	markRuntimeDirty,
	ref,
	renderComponentRuntime,
	state,
	syncComponentProps,
}
