/*global jQuery*/
// jQuery is optional

(function (factory) {
	// eslint-disable-next-line no-undef
	if (typeof module === 'object' && module.exports) {
		// Node cjs
		// eslint-disable-next-line no-undef
		module.exports = factory();
	} else {
		window.Pepper = factory();
	}
})(function () {
	var arrayProto = Array.prototype;
	// utils
	function from(arrayLike, fromIndex) {
		return arrayProto.slice.call(arrayLike, fromIndex);
	}
	function each(arrayLike, fn, context) {
		return arrayProto.forEach.call(arrayLike, fn, context);
	}
	function keys(obj) {
		return Object.keys(obj).filter(function (key) {
			return key !== 'constructor';
		});
	}
	function assign(target) {
		from(arguments, 1).forEach(function (obj) {
			keys(obj).forEach(function (key) {
				target[key] = obj[key];
			});
		});
		return target;
	}
	// Deep merge helper
	function merge(out) {
		out = out || {};
		for (var argIndex = 1; argIndex < arguments.length; argIndex += 1) {
			var obj = arguments[argIndex];
			if (!obj || typeof val !== 'object') {
				continue;
			}
			var keys = keys(obj);
			for (var keyIndex = 1; keyIndex < keys.length; keyIndex += 1) {
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
		var supportsTemplate = 'content' in document.createElement('template');
		var frag;
		if (supportsTemplate) {
			var templateTag = document.createElement('template');
			templateTag.innerHTML = html;
			frag = templateTag.content;
		} else if (window.jQuery) { // IE 11 (jquery fallback)
			frag = document.createDocumentFragment();
			var nodes = jQuery.parseHTML(html);
			nodes.forEach(function (node) {
				frag.appendChild(node);
			});
		} else { // fallback to our parseHTML function which we extracted out from jquery
			frag = window.parseHTML(html);
		}
		// remove script tags
		var toRemove = frag.querySelectorAll('script');
		for (var i = 0; i < toRemove.length; i += 1) {
			frag.removeChild(toRemove[i])
		}
		return frag;
	}

	function isCustomElement(element) {
		if (element.tagName.indexOf('-') > 0) return true;
		var attr = element.getAttribute('is');
		return (attr && attr.indexOf('-') > 0);
	}
	/**
	 * Traverse elements of a tree in order of visibility (pre-order traversal)
	 * @param {Node} parentNode
	 * @param {(Node) => void} onNextNode
	 */
	function traverseElements(parentNode, onNextNode) {
		var treeWalker = document.createTreeWalker(parentNode, NodeFilter.SHOW_ELEMENT),
				node = treeWalker.currentNode;
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

	// -- dom-sync logic --
	/**
	 * @param {Element} newNode
	 * @param {Element} liveNode
	 */
	function syncAttributes(newNode, liveNode) {
		// Remove any attributes from live node that is not in new node
		each(liveNode.attributes, function (attr) {
			if (!newNode.attributes.getNamedItem(attr.name)) {
				liveNode.attributes.removeNamedItem(attr.name);
			}
		});

		// update the rest
		each(newNode.attributes, function (attr) {
			if (liveNode.getAttribute(attr.name) !== attr.value) {
				liveNode.setAttribute(attr.name, attr.value);
			}
		});
	}

	function getCustomElementOuterHtml(el) {
		return el.outerHTML.slice(0, -(el.innerHTML.length + el.tagName.length + 4)) + '/>';
	}
	/**
	 * 
	 * @param {Node} node 
	 * @param {WeakMap<Node, string>} cache 
	 * @returns {string}
	 */
	function hashNode(node, cache) {
		var hash = cache.get(node);
		if (!hash) {
			hash = node.nodeType + ':' + (
				(node.nodeType === 1 ?
					(
						isCustomElement(node) ?
						getCustomElementOuterHtml(node) :
						/** @type {Element} */ (node).outerHTML
					) :
					// comment, text, cdata node
					node.nodeValue
				)
			);
			cache.set(node, hash);
		}
		return hash;
	}

	/**
	 * Assumptions:
	 * 1. liveNodes are child nodes of parentNode
	 * 2. no duplicates allowed within newNodes
	 * 3. no duplicates allowed within liveNodes
	 * 4. neither list should contain `after` node or any node before `after` node
	 * @param {Node[]} newNodes
	 * @param {Node[]} liveNodes
	 * @param {Node} parentNode
	 * @param {Node} [after] sync nodes after a specified node, so that the nodes before it doesn't get touched
	 */
	function patchDom(newNodes, liveNodes, parentNode, after) {

		// fast path: case if newNodes.length is zero. means remove all
		if (!newNodes.length) {
			liveNodes.forEach(node => parentNode.removeChild(node));
			return;
		}

		/** @type {WeakMap<Node, string>} */
		var nodeHashCache = new WeakMap();

		/**
		 * @typedef DomInfo
		 * @property {Node[]} u unmatched
		 * @property {Map<Node, Node>} n2l new node to live lookup
		 * @property {Map<Node, Node>} l2n live node to new lookup
		 */
		/**
		 * Map from new nodes to old and back if available
		 * @type {Record<string, DomInfo>}
		 */
		var domLookup = {};
		newNodes.forEach(function (newNode) {
			var hash = hashNode(newNode, nodeHashCache);
			domLookup[hash] = domLookup[hash] || {
				u: [],
				n2l: new Map(),
				l2n: new Map(),
			};
			domLookup[hash].u.push(newNode);
		});
		var numberOfMatches = 0;
		/**
		 * we later want to re-use elements that don't have exact match if we can
		 * @type {Record<string, Element[]>}
		 */
		var salvagableElements = {};
		liveNodes.forEach(function (liveNode) {
			var hash = hashNode(liveNode, nodeHashCache);
			var entry = domLookup[hash];
			var matched = false;
			if (entry) {
				var newNode = entry.u.shift(); // pick first match
				if (newNode) {
					entry.n2l.set(newNode, liveNode);
					entry.l2n.set(liveNode, newNode);
					matched = true;
					numberOfMatches++;
				}
			}
			if (!matched && liveNode.nodeType === 1) {
				salvagableElements[liveNode.nodeName] = salvagableElements[liveNode.nodeName] || [];
				salvagableElements[liveNode.nodeName].push(/** @type {Element} */ (liveNode));
			}
		});

		// optimization for removals
		// if all new nodes have matching live nodes, then we can safely
		// remove remaining (non-matching) live nodes before re-ordering
		// so if live nodes are already in order (as in the case of many
		// conditional rendering), re-ordering will be a no-op.
		if (numberOfMatches === newNodes.length && liveNodes.length > newNodes.length) {
			// remove from end so that it doesn't affect iteration
			for (var i = liveNodes.length - 1; i>= 0; i--) {
				var liveNode = liveNodes[i];
				var hash = hashNode(liveNode, nodeHashCache);
				if (!domLookup[hash] || !domLookup[hash].l2n.has(liveNode)) {
					// remove from live DOM and from liveNodes list
					parentNode.removeChild(liveNode);
					liveNodes.splice(i, 1);
				}
			}
		}

		// figure out where to start syncing from
		var insertAt = from(parentNode.childNodes).indexOf(after) + 1;
		var newLiveNodes = new Set();

		// re-ordering
		// we now look at new nodes top-to-bottom and order them exactly at it's final index
		newNodes.forEach(function (newNode, index) {
			// check for exact match live node
			var hash = hashNode(newNode, nodeHashCache);
			var existingLiveNode = domLookup[hash].n2l.get(newNode);
			var nodeAtPosition = parentNode.childNodes[insertAt + index];
			if (existingLiveNode) {
				newLiveNodes.add(existingLiveNode);
				// put it at the position. If nodeAtPosition is undefined, then inserts to end
				if (nodeAtPosition !== existingLiveNode) {
					parentNode.insertBefore(existingLiveNode, nodeAtPosition);
				}
				// else nothing to do if exact match is already at the right position
				return;
			}
			
			// at this point we don't have an exact match node.
			// So for text, comment nodes just use the new nodes.
			// But for elements we can potentially re-use an existing element
			//
			// why? because there is a likely hood the node to be updated is a
			// "similar looking" element.
			// e.g. if the only update was an attribute update, and that node
			// happens to be a input element, it is worth keeping it so that
			// user doesn't potentially lose focus

			var newNodeName = newNode.nodeName;
			if (
				newNode.nodeType !== 1
				|| !salvagableElements[newNodeName]
				|| !salvagableElements[newNodeName].length
			) {
				newLiveNodes.add(newNode);
				parentNode.insertBefore(newNode, nodeAtPosition);
				return;
			}
			
			// at this point we have an element that doesn't have an exact matching node.
			// but we do have an existing element of same nodeType that can be re-used
			var newEl = /** @type {Element} */ (newNode); // gah, typescript!
			var aLiveNode = salvagableElements[newNode.nodeName].shift(); // pick first one
			newLiveNodes.add(aLiveNode);
			// place it at where the new node should be
			if (nodeAtPosition !== aLiveNode) {
				parentNode.insertBefore(aLiveNode, nodeAtPosition);
			}
			syncAttributes(newEl, aLiveNode);
			// recursively sync children, except for custom elements (because encapsulation
			// - reactivity with CE is via attributes only)
			if (!isCustomElement(newEl)) {
				patchDom(
					from(newEl.childNodes),
					from(aLiveNode.childNodes),
					aLiveNode,
				);
			}
		});

		// now remove any element not in newLiveNodes
		liveNodes.forEach(function (node) {
			if (!newLiveNodes.has(node)) {
				parentNode.removeChild(node);
			}
		});
	}
	// -- end of dom-sync logic --

	/**
	 * @template DataType
	 * @param {Object} config 
	 * @param {HTMLElement} config.target
	 * @param {DataType} config.data
	 * @param {(data: DataType) => String} config.getHtml
	 * @param {Boolean} [config.mount=false]
	 * @param {Boolean} [config.hydrate=false]
	 * @param {{ store: Pepper.Store, props: String[] }} [config.connect]
	 */
	var Pepper = function (config) {
		var self = this;
		self._data = (typeof config.data === 'object' && config.data) || {};
		var mount = config.mount;
		var hydrate = config.hydrate;
		
		delete config.data;
		delete config.mount;
		delete config.hydrate;
		assign(self, config);
		Object.defineProperty(self, 'data', {
			configurable: false,
			set: function (data) {
				self._data = data;
				// TODO: only render if there is a change
				self.render();
			},
			get: function () {
				return self._data;
			}
		});
		if (hydrate) {
			self.hydrate()
		} else if (mount) {
			self.mount();
		}
	};

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
		Object.keys(handlerMap.get(node) || {}).forEach(function (eventName) {
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

	// Static methods and properties
	// a global store for Pepper views (it's like a singleton global redux store)
	// it only does a shallow (i.e level 1) equality check of the store data properties
	// for notifying relevant connected views to re-render
	/**
	 * @constructor
	 * @param {Object} initialData
	 */
	Pepper.Store = function (initialData) {
		var self = this;
		/** @private */
		self._data = initialData || {};
		/** @private */
		self._subscribers = [];

		Object.defineProperty(this, 'data', {
			configurable: false,
			set: function (newData) {
				if (typeof newData !== 'object') {
					return;
				}
				var changedProps = [].concat(
					// find props that were changed
					keys(newData).filter(function (prop) {
						return self._data[prop] !== newData[prop];
					}),
					// find props that got removed (i.e. not in new data)
					keys(self._data).filter(function (prop) {
						return !(prop in newData);
					})
				);
				self._data = newData;
				self.notify(changedProps);
			},
			get: function () {
				return self._data;
			}
		});
	}
	
	Pepper.Store.prototype = {
		/**
		 * Reactive data - Getter/Setter
		 */
		data: {},
		/**
		 * @private
		 */
		notify: function (changedProps) {
			var changedPropsLookup = changedProps.reduce(function (acc, prop) {
				acc[prop] = 1;
				return acc;
			}, {});
			this._subscribers.forEach(function (subscriber) {
				var changesPropsSubset = subscriber.props.filter(function (prop) {
					return changedPropsLookup[prop];
				});
				if (changesPropsSubset.length) {
					subscriber.callback.call(subscriber.context, changesPropsSubset);
				}
			});
		},
		/**
		 * Subscribe to changes in global store properties
		 * @param {string[]} propsToListenFor
		 * @param {() => undefined} func
		 * @param {any} [context]
		 * @returns 
		 */
		subscribe: function (propsToListenFor, func, context) {
			if (typeof func !== 'function' || !Array.isArray(propsToListenFor)) {
				return;
			}
			var self = this;
			var alreadyAdded = self._subscribers.some(function (subscriber) {
				return (subscriber.callback === func && (context === undefined || context === subscriber.context));
			});
			if (!alreadyAdded) {
				self._subscribers.push({
					props: propsToListenFor,
					callback: func,
					context: context
				});
			}
		},
		unsubscribe: function (func, context) {
			this._subscribers = this._subscribers.filter(function (subscriber) {
				return !(subscriber.callback === func && (context === undefined || context === subscriber.context));
			});
		},
		assign: function (newData) {
			var self = this;
			if (typeof newData !== 'object') {
				return;
			}
			var changedProps = keys(newData).filter(function (prop) {
				return self._data[prop] !== newData[prop];
			});
			assign(self._data, newData);
			self.notify(changedProps);
		}
	};

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
		 * (Optional) A Pepper store and array of props to listen to. The properties will be mixed with
		 * `data` passed to this.getHtml() function (in case of collision local data takes precedence
		 * over store data). This instance will re-render (when mounted) when the specified props change
		 * in the global store
		 * Example: ['cart', 'wishlist']
		 * @type {{
		 * 	store: Pepper.Store,
		 *  props: string[]
		 * }}
		 */
		connect: {},

		/**
		 * Function that returns component's html to be rendered
		 * @param {any} data combined data from this.data and connected pepper store data
		 * @returns {string}
		 */
		getHtml: function () { return ''; },
		
		/**
		 * Set data on this.data (using Object.assign), and re-render.
		 */
		assign: function () {
			var args = from(arguments);
			assign.apply(null, [this.data].concat(args));
			// TODO: only render if there is a change
			this.render();
		},

		/**
		 * Deep merge data with this.data, and re-render.
		 */
		merge: function (data) {
			merge(this.data, data);
			// TODO: only render if there is a change
			this.render();
		},

		handleEvent: function handleEvent(event) {
			callHandler(this, event);
		},

		toString: function renderToString() {
			var self = this;
			var connect = self.connect;
			var storeData = (connect && connect.store && connect.store._data) || {};
			var storeDataSubset = ((connect && connect.props) || []).reduce(function (acc, prop) {
				acc[prop] = storeData[prop];
				return acc;
			}, {});
			var data = assign(storeDataSubset, self.data);
			return self.getHtml(data);
		},

		/**
		 * Render view.
		 * If this.target or node parameter is specified, then replaces that node and attaches the
		 * rendered DOM to document (or document fragment).
		 *
		 * @private
		 */
		render: function render() {
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
				traverseElements(target, function (node) {
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
			var el = frag.firstElementChild;

			// Update existing DOM.
			if (target) {
				var parent = target.parentNode,
						childIndex = from(parent.childNodes).indexOf(target);
				patchDom([el], [target], parent, target.previousSibling);
				self.el = parent.childNodes[childIndex];
			} else {
				self.el = el;
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
		domHydrate: function domHydrate() {
			// Doing step 5 and 6 from render() function
			// Step 5: Resolve refs
			// Step 6: Attach event listeners

			var self = this;
			// TODO: only set this on debug mode
			self.el.pepperInstance = self;

			// Note: ref creates a reference to the node as property on the view.
			traverseElements(self.el, function (node) {
				var refVal = node.getAttribute('ref');
				if (refVal) {
					self[refVal] = node;
				}
				each(node.attributes, function (attr) {
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
		mount: function mount(hydrateOnly = false) {
			var self = this;
			var connect = self.connect;
			if (connect && connect.store) {
				connect.store.subscribe(connect.props, self.render, self);
			}

			var node = self.target;
			if (typeof node === 'string') {
				node = document.querySelector(node);
			}

			// Return if already mounted.
			if (self.el && node === self.el) {
				return;
			}

			if (node && node.parentNode) {
				self.el = node;
				if (hydrateOnly) {
					self.domHydrate();
				} else { // full render
					self.render();
				}
			}
		},

		hydrate: function hydrate(data) {
			if (arguments.length > 0 && data && typeof data === 'object') {
				this._data = data;
			}
			this.mount(true);
		},

		append: function append(node) {
			var self = this;
			var connect = self.connect;
			if (connect && connect.store) {
				connect.store.subscribe(connect.props, self.render, self);
			}

			if (!self.el) {
				self.render();
			}
			node.appendChild(self.el);
		},

		unmount: function unmount() {
			var self = this;
			var connect = self.connect;
			if (connect && connect.store) {
				connect.store.unsubscribe(self.render, self);
			}
			self.el.parentNode.removeChild(self.el);
		}
	};

	return Pepper;
});
