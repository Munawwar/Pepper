// utils
import {
	from,
	objectAssign,
	each,
	isCustomElement,
	keys
} from './utils.js';
import { patchDom } from './dom-diff.js';
import { Store } from './store.js';
import { html } from './html.js';

// Deep merge helper
function merge(out) {
	out = out || {};
	for (var argIndex = 1; argIndex < arguments.length; argIndex++) {
		var obj = arguments[argIndex];
		if (!obj || typeof val !== 'object') {
			continue;
		}
		var keys = keys(obj);
		for (var keyIndex = 1; keyIndex < keys.length; keyIndex++) {
			var key = keys[keyIndex];
			var val = obj[key];
			out[key] = (typeof val === 'object' && val !== null)
				? merge(out[key], val)
				: val;
		}
	}
	return out;
}
/**
 * Converts html string to a document fragment.
 * @param {String} html
 * @return {DocumentFragment}
 * @method dom
 */
function parseAsFragment(html) {
	var templateTag = document.createElement('template');
	templateTag.innerHTML = html;
	return templateTag.content;
}

/**
 * Traverse elements of a tree in order of visibility (pre-order traversal)
 * @param {Node} parentNode
 * @param {(Node) => void} onNextNode
 */
function traverseElements(parentNode, onNextNode) {
	var treeWalker = document.createTreeWalker(parentNode, NodeFilter.SHOW_ELEMENT),
			node = treeWalker.nextNode();
	while (node) {
		// dont touch the inner nodes of custom elements
		if (isCustomElement(node)) {
			node = treeWalker.nextSibling();
			continue;
		}
		onNextNode(node);
		node = treeWalker.nextNode();
	}
}

/**
 * @template DataType
 * @param {Object} config 
 * @param {HTMLElement} config.target
 * @param {DataType} config.data
 * @param {(data: DataType) => String} config.getHtml
 * @param {Boolean} [config.mount=false]
 * @param {Boolean} [config.hydrate=false]
 * @param {{ [storeKey: string]: { store: Store, props: String[] } }|null} [config.stores]
 */
function Pepper(config) {
	var self = this;
	self._data = (typeof config.data === 'object' && config.data) || {};
	var mount = config.mount;
	var hydrate = config.hydrate;
	
	delete config.data;
	delete config.mount;
	delete config.hydrate;
	objectAssign(self, config);
	Object.defineProperty(self, 'data', {
		configurable: false,
		set(data) {
			self._data = data;
			// TODO: only render if there is a change
			self.render();
		},
		get() {
			return self._data;
		}
	});
	if (hydrate) {
		self.hydrate()
	} else if (mount) {
		self.mount();
	}
}

// private
var handlerMap = new WeakMap();
/**
 * Helper to attach handleEvent object event listener to element.
 * @param {HTMLElement} node
 * @param {Object} context
 * @param {String} eventName
 * @param {Function} func
 */
function attachHandler(node, context, eventName, func) {
	if (!func) return;
	var newMap = handlerMap.get(node) || {};
	newMap[eventName] = func;
	handlerMap.set(node, newMap);
	node.addEventListener(eventName, context);
}
/**
 * Removes all event handlers on node. Ensure same context is passed as it
 * was for attachHandler() function, else the event listeners wont get removed.
 */
function removeAllHandlers(node, context) {
	Object.keys(handlerMap.get(node) || {}).forEach((eventName) => {
		node.removeEventListener(eventName, context);
	});
	handlerMap.delete(node);
}
/**
 * Invokes an event handler that was registered via attachHandler
 * @param {Pepper} context 
 * @param {Event} event 
 */
function callHandler(context, event) {
	var node = event.currentTarget;
	var func = (handlerMap.get(node) || {})[event.type];
	if (func) {
		func.call(context, event);
	}
}

// Methods and properties
Pepper.prototype = {
	/**
	 * The data object.
	 * This is a private variable accessed through this.data
	 * setter/getter.
	 */
	_data: null,

	/**
	 * (Optional) The element to replace (on first render).
	 */
	target: null,

	/**
	 * (Optional) A Pepper store and array of props to listen to. The properties will be added to
	 * `data.stores` passed to this.getHtml() function.
	 * This instance will re-render (when mounted) when the specified props change in the store
	 * Example: ['cart', 'wishlist']
	 * @type {{
	 * 	[storeKey: string]: {
	 * 	  store: Store,
	 *    props: string[]
	 *  }
	 * }|null}
	 */
	stores: null,

	/**
	 * Function that returns component's html to be rendered
	 * @param {any} data combined data from this.data and subscribed stores
	 * @returns {string}
	 */
	getHtml() { return ''; },
	
	/**
	 * Set data on this.data (using Object.assign), and re-render.
	 */
	assign() {
		var args = from(arguments);
		objectAssign.apply(null, [this.data].concat(args));
		// TODO: only render if there is a change
		this.render();
	},

	/**
	 * Deep merge data with this.data, and re-render.
	 */
	merge(data) {
		merge(this.data, data);
		// TODO: only render if there is a change
		this.render();
	},

	handleEvent(event) {
		callHandler(this, event);
	},

	toString: function renderToString() {
		var self = this;
		var stores = self.stores;
		const storeData = keys(stores).reduce((acc, storeKey) => {
			var { store, props } = stores[storeKey];
			var storeData = (store && store._data) || {};
			acc[storeKey] = (props || []).reduce((acc2, prop) => {
				acc2[prop] = storeData[prop];
				return acc2;
			}, {});
			return acc;
		}, {});
		var data = objectAssign({ stores: storeData }, self.data);
		return self.getHtml(data);
	},

	/**
	 * Render view.
	 * If this.target or node parameter is specified, then replaces that node and attaches the
	 * rendered DOM to document (or document fragment).
	 *
	 * @private
	 */
	render() {
		// Step 1: Remove event listeners and refs
		// Step 2: Note the currently focused element
		// Step 3: Render/Update UI.
		// Step 4: Resolve references
		// Step 5: Re-focus
		// Step 6: Re-attach listeners
		
		var self = this;
		var target = self.el;

		// Step 1: Find input field focus, remember it's id attribute, so that it
		// can be refocused later.
		var focusId = document.activeElement.id;

		// Step 2: Remove event listeners and refs before patch.
		if (target) {
			traverseElements(target, (node) => {
				var refVal = node.getAttribute('ref');
				if (refVal && self[refVal] instanceof Node) {
					delete self[refVal];
				}
				if (handlerMap.has(node)) {
					removeAllHandlers(node, self);
				}
			});
		}

		// Step 3: Render/Update UI
		var frag = parseAsFragment(self.toString());
		var els = from(frag.childNodes)
		// var el = frag.firstElementChild;

		// Update existing DOM.
		if (target) {
			patchDom(target, els);
		}

		// Step 4: Re-focus
		if (focusId) {
			var focusEl = document.getElementById(focusId);
			if (focusEl) {
				focusEl.focus();
			}
		}

		self.domHydrate();
	},

	/**
	 * @private
	 */
	domHydrate() {
		// Doing step 5 and 6 from render() function
		// Step 5: Resolve refs
		// Step 6: Attach event listeners

		var self = this;
		// TODO: only set this on debug mode
		self.el.pepperInstance = self;

		// Note: ref creates a reference to the node as property on the view.
		traverseElements(self.el, (node) => {
			var refVal = node.getAttribute('ref');
			if (refVal) {
				self[refVal] = node;
			}
			each(node.attributes, (attr) => {
				if (attr.name.startsWith('on-')) {
					var eventName = attr.name.replace(/on-/, '');
					attachHandler(node, self, eventName, self[attr.value]);
				}
			});
		});
	},

	/**
	 * @param {Boolean} [hydrateOnly=false] does a full render by default. 'Hydration' only
	 * attaches event listeners and resolves refs.
	 * @returns 
	 */
	mount(hydrateOnly = false) {
		var self = this;
		var stores = self.stores;
		if (stores) {
			keys(stores).forEach((storeKey) => {
				const { store, props } = stores[storeKey];
				store.subscribe(props, self.render, self);
			});
		}

		var node = self.target;
		if (typeof node === 'string') {
			node = document.querySelector(node);
		}

		// Return if already mounted.
		if (self.el && node === self.el) {
			return false;
		}

		if (node) {
			self.el = node;
			if (hydrateOnly) {
				self.domHydrate();
			} else { // full render
				self.render();
			}
			return true;
		}
		return false;
	},

	hydrate(data) {
		if (arguments.length > 0 && data && typeof data === 'object') {
			this._data = data;
		}
		this.mount(true);
	},

	unmount() {
		var self = this;
		var stores = self.stores;
		if (stores) {
			keys(stores).forEach((storeKey) => {
				stores[storeKey].store.unsubscribe(self.render, self);
			});
		}
		self.el.replaceChildren(); // empty replaceChildren removes all child elements
	}
};

export { Pepper, Store, html };
