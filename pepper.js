/*global window, $*/

(function (factory) {
	if (typeof module === 'object' && module.exports) {
		// Node cjs
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
	function assign(target) {
		from(arguments, 1).forEach(function (obj) {
			Object.keys(obj).forEach(function (key) {
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
			var keys = Object.keys(obj);
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

	// Sync patch DOM from source element to target element.
	function patchDom(newNode, targetNode) {
		if (newNode.nodeType !== targetNode.nodeType || (newNode.nodeType === 1 && newNode.nodeName !== targetNode.nodeName)) {
			return targetNode.parentNode.replaceChild(newNode, targetNode);
		}
		// Should only reach here if both nodes are of same type.
		if (newNode.nodeType === 1) { // HTMLElements
			// Sync attributes
			// Remove any attributes not in source
			each(targetNode.attributes, function (attr) {
				if (!newNode.attributes.getNamedItem(attr.name)) {
					targetNode.attributes.removeNamedItem(attr.name);
				}
			});

			// update the rest
			each(newNode.attributes, function (attr) {
				if (targetNode.getAttribute(attr.name) !== attr.value) {
					targetNode.setAttribute(attr.name, attr.value);
				}
			});
	
			// Remove extra nodes
			while (targetNode.childNodes.length > newNode.childNodes.length) {
				targetNode.removeChild(targetNode.lastChild);
			}

			// recursively sync childNodes and their attributes
			each(newNode.childNodes, function (newChildNode, i) {
				var oldChildNode = targetNode.childNodes[i];
				if (!oldChildNode) {
					targetNode.appendChild(newChildNode)
				} else if (newChildNode !== oldChildNode) {
					// recursively patch child nodes
					patchDom(newChildNode, oldChildNode);
				}
			});
		} else if (newNode.nodeType === 3 || newNode.nodeType === 8) { // text and comment nodes
			if (targetNode.nodeValue !== newNode.nodeValue) {
				targetNode.nodeValue = newNode.nodeValue;
			}
		}
	};

	/**
	 * @template DataType
	 * @param {Object} config 
	 * @param {HTMLElement} config.target
	 * @param {DataType} config.data
	 * @param {(data: DataType) => String} config.getHtml
	 * @param {Boolean} [config.mount=false]
	 * @param {Boolean} [config.hydrate=false]
	 * @param {String[]} config.connect
	 */
	var Pepper = function (config) {
		this.id = Pepper.generateUId();
		this._data = {};
		var data = config.data;
		if (data && typeof data === 'object') {
			this._data = data;
		}
		var mount = config.mount;
		var hydrate = config.hydrate;
		
		delete config.data;
		delete config.mount;
		delete config.hydrate;
		assign(this, config);

		Object.defineProperty(this, 'data', {
			configurable: false,
			set: function (data) {
				this._data = data;
				this.render();
			},
			get: function () {
				return this._data;
			}
		});
		if (hydrate) {
			this.hydrate()
		} else if (mount) {
			this.mount();
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
	assign(Pepper, {
		uid: 1,
		generateUId: function () {
			var id = 'view-' + Pepper.uid;
			Pepper.uid += 1;
			return id;
		},

		getHtml: function () { return ''; },

		// a global store for Pepper views (it's like a singleton global redux store)
		// it only does a shallow (i.e level 1) equality check of the store data properties
		// for notifying relevant connected views to re-render
		store: {
			_data: {},
			subscribers: [],
			subscribe: function (func, propsToListenFor, context) {
				if (typeof func !== 'function' || !Array.isArray(propsToListenFor)) {
					return;
				}
				var alreadyAdded = this.subscribers.some(function (subscriber) {
					return (subscriber.callback === func && (context === undefined || context === subscriber.context));
				});
				if (!alreadyAdded) {
					this.subscribers.push({
						callback: func,
						props: propsToListenFor,
						context: context
					});
				}
			},
			unsubscribe: function (func, context) {
				this.subscribers = this.subscribers.filter(function (subscriber) {
					return !(subscriber.callback === func && (context === undefined || context === subscriber.context));
				});
			},
			assign: function (newData) {
				if (typeof newData !== 'object') {
					return;
				}
				var currentData = this._data;
				var changedProps = Object.keys(newData).filter(function (prop) {
					return currentData[prop] !== newData[prop];
				});
				assign(this._data, newData);
				this.notify(changedProps);
			},
			notify: function (changedProps) {
				var changedPropsLookup = changedProps.reduce(function (acc, prop) {
					acc[prop] = 1;
					return acc;
				}, {});
				this.subscribers.forEach(function (subscriber) {
					var matches = subscriber.props.some(function (prop) {
						if (typeof prop !== 'string') {
							return false;
						}
						return changedPropsLookup[prop];
					});
					if (matches) {
						subscriber.callback.call(subscriber.context);
					}
				});
			}
		}
	});

	Object.defineProperty(Pepper.store, 'data', {
		configurable: false,
		set: function (data) {
			if (typeof data !== 'object') {
				return;
			}
			var currentData = this._data;
			var changedProps = Object.keys(data).filter(function (prop) {
				return currentData[prop] !== data[prop];
			});
			this._data = data;
			this.notify(changedProps);
		},
		get: function () {
			return this._data;
		}
	});


	// Methods and properties
	assign(Pepper.prototype, {
		/**
		 * The data object.
		 * This is a private variable accessed through this.data
		 * setter/getter.
		 */
		_data: null,

		/**
		 * (Optional) The elment to replace (on first render).
		 */
		target: null,

		/**
		 * (Optional) An array of props to listen to from Pepper.store (it's a global state store)
		 * This instance will re-render (when mounted) when the specified props change in the global store
		 * Example: ['cart', 'wishlist']
		 */
		connect: null,
		
		/**
		 * Set data on this.data (using Object.assign), and re-render.
		 */
		assign: function () {
			var args = from(arguments);
			assign.apply(null, [this.data].concat(args));
			this.render();
		},

		/**
		 * Deep merge data with this.data, and re-render.
		 */
		merge: function (data) {
			merge(this.data, data);
			this.render();
		},

		handleEvent: function handleEvent(event) {
			callHandler(this, event);
		},

		/**
		 * Render view.
		 * If this.target or node paramter is specified, then replaces that node and attaches the
		 * rendered DOM to document (or document fragment).
		 *
		 * @private
		 */
		render: function render() {
			// Step 1: Remove event listeners
			// Step 2: Note the currently focused element
			// Step 3: Render/Update UI.
			// Step 4: Resolve references
			// Step 5: Re-focus
			// Step 6: Re-attach listeners

			var target = this.el;

			// Step 1: Find input field focus, remember it's id attribute, so that it
			// can be refocused later.
			var focusId = document.activeElement.id;

			// Step 2: Remove event listeners before patch.
			if (target) {
				[target].concat(from(target.querySelectorAll('*')))
					.forEach(function (node) {
						if (node.nodeType === 1) {
							removeAllHandlers(node, this);
						}
					}, this);
			}

			// Step 3: Render/Update UI
			var storeData = Pepper.store._data;
			var storeDataSubset = (this.connect || []).reduce(function (acc, prop) {
				acc[prop] = storeData[prop];
				return acc;
			}, {});
			var data = assign(storeDataSubset, this.data);
			var frag = parseAsFragment(this.getHtml(data));
			var el = frag.firstElementChild;

			// Update existing DOM.
			if (target) {
				var parent = target.parentNode,
						childIndex = from(parent.childNodes).indexOf(target);
				patchDom(el, target);
				this.el = parent.childNodes[childIndex];
			} else {
				this.el = el;
			}

			// Step 4: Re-focus
			if (focusId) {
				var focusEl = document.getElementById(focusId);
				if (focusEl) {
					focusEl.focus();
				}
			}

			this.domHydrate();
		},

		/**
		 * @private
		 */
		domHydrate: function domHydrate() {
			// Doing step 5 and 6 from render() function
			// Step 5: Resolve references
			// Step 6: Attach listeners
			var self = this;

			// TODO: only set this on debug mode
			self.el.pepperInstance = self;

			// Step 5. Resolve element ref and refs.
			// Note:
			// ref creates a reference to the node as property on the view.
			// refs creates an array property on the view, into which the node is pushed.
			each(self.el.querySelectorAll('[ref]'), function (node) {
				self[node.getAttribute('ref')] = node;
			});

			var refs = from(self.el.querySelectorAll('[refs]'));
			// Reset references first
			refs.forEach(function (node) {
				self[node.getAttribute('ref')] = [];
			});
			// Create reference.
			refs.forEach(function (node) {
				self[node.getAttribute('ref')].push(node);
			});

			// Step 6: Attach event listeners.
			[self.el].concat(from(self.el.querySelectorAll('*')))
				.forEach(function (node) {
					if (node.nodeType === 1) {
						each(node.attributes, function (attr) {
							if (attr.name.startsWith('on-')) {
								var eventName = attr.name.replace(/on-/, '');
								attachHandler(node, self, eventName, self[attr.value]);
							}
						});
					}
				});
		},

		/**
		 * @param {Boolean} [hydrateOnly=false] does a full render by default. 'Hydration' only
		 * attaches event listeners and resolves refs.
		 * @returns 
		 */
		mount: function mount(hydrateOnly = false) {
			if (this.connect) {
				Pepper.store.subscribe(this.render, this.connect, this);
			}

			var node = this.target;
			if (typeof node === 'string') {
				node = document.querySelector(node);
			}

			// Return if already mounted.
			if (this.el && node === this.el) {
				return;
			}

			if (node && node.parentNode) {
				this.el = node;
				if (hydrateOnly) {
					this.domHydrate();
				} else { // full render
					this.render();
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
			if (this.connect) {
				Pepper.store.subscribe(this.render, this.connect, this);
			}

			if (!this.el) {
				this.render();
			}
			node.appendChild(this.el);
		},

		unmount: function unmount() {
			Pepper.store.unsubscribe(this.render, this.connect);
			this.el.parentNode.removeChild(this.el);
		}
	});

	return Pepper;
});
