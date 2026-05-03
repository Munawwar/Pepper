import {
	from,
	each,
	isCustomElement,
	isEqual,
	keys,
} from './utils.js';
import { patchDom } from './dom-diff.js';
import { Store } from './store.js';
import { createHtml, html } from './html.js';

const rootMap = new WeakMap();
const handlerMap = new WeakMap();
const scheduleMicrotask = typeof queueMicrotask === 'function'
	? queueMicrotask
	: (callback) => Promise.resolve().then(callback);
let currentSetupRuntime = null;

/**
 * Converts html string to a document fragment.
 * @param {String} htmlString
 * @return {DocumentFragment}
 */
function parseAsFragment(htmlString) {
	const templateTag = document.createElement('template');
	templateTag.innerHTML = htmlString;
	return templateTag.content;
}

/**
 * Traverse elements of a tree in order of visibility (pre-order traversal).
 * @param {Node} parentNode
 * @param {(node: Element) => void} onNextNode
 */
function traverseElements(parentNode, onNextNode) {
	const treeWalker = document.createTreeWalker(parentNode, NodeFilter.SHOW_ELEMENT);
	let node = treeWalker.nextNode();
	while (node) {
		if (isCustomElement(node)) {
			node = treeWalker.nextSibling();
			continue;
		}
		onNextNode(/** @type {Element} */ (node));
		node = treeWalker.nextNode();
	}
}

function state(initialValue, comparator = isEqual) {
	const runtime = currentSetupRuntime;
	if (!runtime) {
		throw new Error('state() can only be used while creating a Pepper component.');
	}
	let value = initialValue;
	return [
		() => value,
		(valueOrSetter, callback) => {
			const nextValue = typeof valueOrSetter === 'function'
				? valueOrSetter(value)
				: valueOrSetter;
			if (comparator(nextValue, value)) {
				return;
			}
			value = nextValue;
			if (callback !== false) {
				scheduleRender(runtime, callback);
			}
		},
	];
}

function ref() {
	const runtime = currentSetupRuntime;
	if (!runtime) {
		throw new Error('ref() can only be used while creating a Pepper component.');
	}
	const refObject = { current: null };
	runtime.refObjects.push(refObject);
	return refObject;
}

function scheduleRenderFlush(runtime) {
	if (runtime.flushScheduled) {
		return;
	}
	runtime.flushScheduled = true;
	scheduleMicrotask(() => {
		runtime.flushScheduled = false;
		if (
			!runtime.pendingRender
			|| runtime.isInitializing
			|| runtime.isRendering
			|| runtime.isRunningMountHandlers
		) {
			return;
		}
		runtime.pendingRender = false;
		runComponent(runtime);
	});
}

function scheduleRender(runtime, callback) {
	if (typeof callback === 'function') {
		runtime.pendingCallbacks.push(callback);
	}
	runtime.pendingRender = true;
	if (runtime.isServerRender) {
		return;
	}
	scheduleRenderFlush(runtime);
}

function syncProps(runtime, nextProps) {
	const oldProps = runtime.props;
	const normalizedProps = {};
	const changedProps = [];
	const allKeys = new Set(keys(oldProps).concat(keys(nextProps)));
	allKeys.forEach((key) => {
		if (!(key in nextProps)) {
			changedProps.push(key);
			return;
		}
		const nextValue = nextProps[key];
		if (key in oldProps && isEqual(oldProps[key], nextValue)) {
			normalizedProps[key] = oldProps[key];
			return;
		}
		normalizedProps[key] = nextValue;
		changedProps.push(key);
	});
	runtime.props = normalizedProps;
	return { changedProps, oldProps };
}

function clearDomBindings(runtime) {
	runtime.refObjects.forEach((refObject) => {
		refObject.current = null;
	});
	if (!runtime.container) {
		return;
	}
	traverseElements(runtime.container, (node) => {
		const handlers = handlerMap.get(node);
		if (!handlers) {
			return;
		}
		keys(handlers).forEach((eventName) => {
			node.removeEventListener(eventName, runtime);
		});
		handlerMap.delete(node);
	});
}

function bindDomRuntime(runtime) {
	runtime.container.pepperComponent = runtime.model;
	traverseElements(runtime.container, (node) => {
		each(node.attributes, (attr) => {
			if (attr.name === 'ref') {
				const refObject = runtime.renderRefs && runtime.renderRefs[attr.value];
				if (refObject) {
					refObject.current = node;
				}
				return;
			}
			if (!attr.name.startsWith('on-')) {
				return;
			}
			const func = runtime.renderHandlers && runtime.renderHandlers[attr.value];
			if (!func) {
				return;
			}
			const eventName = attr.name.slice(3);
			const nodeHandlers = handlerMap.get(node) || {};
			nodeHandlers[eventName] = func;
			handlerMap.set(node, nodeHandlers);
			node.addEventListener(eventName, runtime);
		});
	});
}

function runMountHandlers(runtime) {
	runtime.isRunningMountHandlers = true;
	try {
		runtime.mountHandlers.forEach((handler) => {
			const cleanup = handler();
			if (typeof cleanup === 'function') {
				runtime.mountCleanups.push(cleanup);
			}
		});
	} finally {
		runtime.isRunningMountHandlers = false;
	}
	if (runtime.pendingRender) {
		scheduleRenderFlush(runtime);
	}
}

function flushCallbacks(runtime) {
	const callbacks = runtime.pendingCallbacks.splice(0);
	callbacks.forEach((callback) => {
		callback();
	});
}

function runComponent(runtime, hydrateOnly = false, isServerRender = typeof window === 'undefined' || typeof document === 'undefined', changedProps = runtime.pendingChangedProps, oldProps = runtime.pendingOldProps) {
	runtime.isServerRender = isServerRender;
	runtime.pendingChangedProps = [];
	runtime.pendingOldProps = runtime.props;
	runtime.isRendering = true;
	const renderContext = {
		handlerIndex: 0,
		handlers: isServerRender ? null : [],
		refIndex: 0,
		refs: isServerRender ? null : [],
	};
	let htmlString;
	try {
		if (changedProps.length) {
			runtime.propHandlers.forEach((handler) => {
				handler(changedProps, oldProps);
			});
		}
		runtime.renderHandlers = renderContext.handlers;
		runtime.renderRefs = renderContext.refs;
		htmlString = runtime.model.render.call(runtime.model, createHtml(renderContext));
	} finally {
		runtime.isRendering = false;
	}
	if (isServerRender) {
		flushCallbacks(runtime);
		return runtime.pendingRender
			? (runtime.pendingRender = false, runComponent(runtime, false, true, [], runtime.props))
			: htmlString;
	}

	const firstMount = !runtime.mounted;
	const focusId = document.activeElement && document.activeElement.id;
	clearDomBindings(runtime);
	if (!hydrateOnly) {
		patchDom(runtime.container, from(parseAsFragment(htmlString).childNodes));
		if (focusId) {
			const focusEl = document.getElementById(focusId);
			if (focusEl) {
				focusEl.focus();
			}
		}
	}
	bindDomRuntime(runtime);
	runtime.mounted = true;
	if (firstMount) {
		runMountHandlers(runtime);
	}
	flushCallbacks(runtime);
	if (runtime.pendingRender) {
		scheduleRenderFlush(runtime);
	}
	return runtime.model;
}

function createRuntime(Component, props = {}) {
	const runtime = {
		Component,
		container: null,
		flushScheduled: false,
		isInitializing: true,
		isRendering: false,
		isRunningMountHandlers: false,
		isServerRender: false,
		mounted: false,
		mountCleanups: [],
		mountHandlers: [],
		model: null,
		pendingCallbacks: [],
		pendingChangedProps: [],
		pendingOldProps: {},
		pendingRender: false,
		propHandlers: [],
		props: {},
		refObjects: [],
		renderHandlers: null,
		renderRefs: null,
		getProps() {
			return runtime.props;
		},
		handleEvent(event) {
			const func = (handlerMap.get(event.currentTarget) || {})[event.type];
			if (func) {
				func(event);
			}
		},
		onMount(handler) {
			runtime.mountHandlers.push(handler);
		},
		onProps(handler) {
			runtime.propHandlers.push(handler);
		},
		update(callback) {
			scheduleRender(runtime, callback);
		},
	};
	const initialProps = syncProps(runtime, props);
	runtime.pendingChangedProps = initialProps.changedProps;
	runtime.pendingOldProps = initialProps.oldProps;
	const prevRuntime = currentSetupRuntime;
	currentSetupRuntime = runtime;
	try {
		const model = Component({
			getProps: runtime.getProps,
			onMount: runtime.onMount,
			onProps: runtime.onProps,
			update: runtime.update,
		});
		runtime.model = typeof model === 'function' ? { render: model } : model;
		if (!runtime.model || typeof runtime.model.render !== 'function') {
			throw new Error('Pepper components must return a render function or an object with a render(html) method.');
		}
	} finally {
		runtime.isInitializing = false;
		currentSetupRuntime = prevRuntime;
	}
	return runtime;
}

function destroyRuntime(runtime) {
	clearDomBindings(runtime);
	runtime.mountCleanups.splice(0).forEach((cleanup) => {
		cleanup();
	});
	if (runtime.container) {
		delete runtime.container.pepperComponent;
		rootMap.delete(runtime.container);
	}
}

function resolveContainer(container) {
	return typeof container === 'string' ? document.querySelector(container) : container;
}

function mountRoot(Component, container, props = {}, hydrateOnly = false) {
	const target = resolveContainer(container);
	if (!(target instanceof Element)) {
		throw new Error('Pepper render/hydrate target must be a DOM element or selector.');
	}
	let runtime = rootMap.get(target);
	if (!runtime || runtime.Component !== Component) {
		if (runtime) {
			destroyRuntime(runtime);
		}
		runtime = createRuntime(Component, props);
		runtime.container = target;
		rootMap.set(target, runtime);
		return runComponent(runtime, hydrateOnly);
	}
	const propChanges = syncProps(runtime, props);
	runtime.pendingChangedProps = propChanges.changedProps;
	runtime.pendingOldProps = propChanges.oldProps;
	if (hydrateOnly && !runtime.mounted) {
		return runComponent(runtime, true);
	}
	if (!propChanges.changedProps.length) {
		return runtime.model;
	}
	return runComponent(runtime);
}

function render(Component, container, props = {}) {
	return mountRoot(Component, container, props, false);
}

function hydrate(Component, container, props = {}) {
	return mountRoot(Component, container, props, true);
}

function renderToString(Component, props = {}) {
	return runComponent(createRuntime(Component, props), false, true);
}

export { Store, html, hydrate, ref, render, renderToString, state };
