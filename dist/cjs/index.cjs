var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from2, except, desc) => {
  if (from2 && typeof from2 === "object" || typeof from2 === "function") {
    for (let key of __getOwnPropNames(from2))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from2[key], enumerable: !(desc = __getOwnPropDesc(from2, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.js
var src_exports = {};
__export(src_exports, {
  Pepper: () => Pepper,
  Store: () => Store,
  html: () => html
});
module.exports = __toCommonJS(src_exports);

// src/utils.js
var from = Array.from;
function each(arrayLike, fn) {
  return Array.prototype.forEach.call(arrayLike, fn);
}
function isCustomElement(element) {
  if (element.tagName.indexOf("-") > 0)
    return true;
  var attr = element.getAttribute("is");
  return attr && attr.indexOf("-") > 0;
}
function keys(obj) {
  return Object.keys(obj).filter((key) => key !== "constructor");
}
function objectAssign(target) {
  from(arguments).forEach((obj, index) => {
    if (!index)
      return;
    keys(obj).forEach((key) => {
      target[key] = obj[key];
    });
  });
  return target;
}

// src/dom-diff.js
function syncAttributes(newNode, liveNode) {
  each(liveNode.attributes, (attr) => {
    if (!newNode.attributes.getNamedItem(attr.name)) {
      liveNode.attributes.removeNamedItem(attr.name);
    }
  });
  each(newNode.attributes, (attr) => {
    if (liveNode.getAttribute(attr.name) !== attr.value) {
      liveNode.setAttribute(attr.name, attr.value);
    }
  });
}
function getCustomElementOuterHtml(el) {
  return el.outerHTML.slice(0, -(el.innerHTML.length + el.tagName.length + 4)) + "/>";
}
function hashNode(node, cache) {
  var hash = cache.get(node);
  if (!hash) {
    hash = node.nodeType + ":" + (node.nodeType === 1 ? isCustomElement(node) ? getCustomElementOuterHtml(node) : (
      /** @type {Element} */
      node.outerHTML
    ) : (
      // comment, text, cdata node
      node.nodeValue
    ));
    cache.set(node, hash);
  }
  return hash;
}
function patchDom(newNodes, liveNodes, parentNode, after) {
  if (!newNodes.length) {
    liveNodes.forEach((node) => parentNode.removeChild(node));
    return;
  }
  var nodeHashCache = /* @__PURE__ */ new Map();
  var domLookup = {};
  newNodes.forEach((newNode) => {
    var hash = hashNode(newNode, nodeHashCache);
    domLookup[hash] = domLookup[hash] || {
      u: [],
      n2l: /* @__PURE__ */ new Map()
    };
    domLookup[hash].u.push(newNode);
  });
  var salvagableElements = {};
  liveNodes.forEach((liveNode) => {
    var hash = hashNode(liveNode, nodeHashCache);
    var entry = domLookup[hash];
    var matched = false;
    if (entry) {
      var newNode = entry.u.shift();
      if (newNode) {
        entry.n2l.set(newNode, liveNode);
        matched = true;
      }
    }
    if (!matched && liveNode.nodeType === 1) {
      salvagableElements[liveNode.nodeName] = salvagableElements[liveNode.nodeName] || [];
      salvagableElements[liveNode.nodeName].push(
        /** @type {Element} */
        liveNode
      );
    }
  });
  var insertAt = from(parentNode.childNodes).indexOf(after) + 1;
  var newLiveNodes = /* @__PURE__ */ new Set();
  newNodes.forEach((newNode, index) => {
    var hash = hashNode(newNode, nodeHashCache);
    var existingLiveNode = domLookup[hash].n2l.get(newNode);
    var nodeAtPosition = parentNode.childNodes[insertAt + index];
    if (existingLiveNode) {
      newLiveNodes.add(existingLiveNode);
      if (nodeAtPosition !== existingLiveNode) {
        parentNode.insertBefore(existingLiveNode, nodeAtPosition);
      }
      return;
    }
    var newNodeName = newNode.nodeName;
    if (newNode.nodeType === 1 && (salvagableElements[newNodeName] && salvagableElements[newNodeName].length)) {
      var newEl = (
        /** @type {Element} */
        newNode
      );
      var aLiveNode = salvagableElements[newNode.nodeName].shift();
      newLiveNodes.add(aLiveNode);
      if (nodeAtPosition !== aLiveNode) {
        parentNode.insertBefore(aLiveNode, nodeAtPosition);
      }
      syncAttributes(newEl, aLiveNode);
      if (!isCustomElement(newEl) && newEl.innerHTML != aLiveNode.innerHTML) {
        patchDom(
          from(newEl.childNodes),
          from(aLiveNode.childNodes),
          aLiveNode
        );
      }
      return;
    }
    newLiveNodes.add(newNode);
    parentNode.insertBefore(newNode, nodeAtPosition);
  });
  liveNodes.forEach((node) => {
    if (!newLiveNodes.has(node)) {
      parentNode.removeChild(node);
    }
  });
}

// src/store.js
function Store(initialData) {
  var self = this;
  self._data = initialData || {};
  self._subscribers = [];
  Object.defineProperty(this, "data", {
    configurable: false,
    set(newData) {
      if (typeof newData !== "object") {
        return;
      }
      var changedProps = [].concat(
        // find props that were changed
        keys(newData).filter((prop) => self._data[prop] !== newData[prop]),
        // find props that got removed (i.e. not in new data)
        keys(self._data).filter((prop) => !(prop in newData))
      );
      self._data = newData;
      self.notify(changedProps);
    },
    get() {
      return self._data;
    }
  });
}
Store.prototype = {
  /**
   * Reactive data - Getter/Setter
   */
  data: {},
  /**
   * @private
   */
  notify(changedProps) {
    var changedPropsLookup = changedProps.reduce((acc, prop) => {
      acc[prop] = 1;
      return acc;
    }, {});
    this._subscribers.forEach((subscriber) => {
      var changesPropsSubset = subscriber.props.filter((prop) => changedPropsLookup[prop]);
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
  subscribe(propsToListenFor, func, context) {
    if (typeof func !== "function" || !Array.isArray(propsToListenFor)) {
      return;
    }
    var self = this;
    var alreadyAdded = self._subscribers.some((subscriber) => subscriber.callback === func && (context === void 0 || context === subscriber.context));
    if (!alreadyAdded) {
      self._subscribers.push({
        props: propsToListenFor,
        callback: func,
        context
      });
    }
  },
  unsubscribe(func, context) {
    this._subscribers = this._subscribers.filter((subscriber) => !(subscriber.callback === func && (context === void 0 || context === subscriber.context)));
  },
  assign(newData) {
    var self = this;
    if (typeof newData !== "object") {
      return;
    }
    var changedProps = keys(newData).filter((prop) => self._data[prop] !== newData[prop]);
    objectAssign(self._data, newData);
    self.notify(changedProps);
  }
};

// src/html.js
var characterEntitiesMapping = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;"
};
function escape(text) {
  if (!text)
    return text;
  return text.replace(/[<>&'"]/g, (character) => characterEntitiesMapping[character]);
}
function html(strings, ...values) {
  return strings.reduce((acc, string, index) => {
    let value = String(values[index - 1]);
    if ((strings[index - 1] || "").endsWith("$")) {
      acc = acc.slice(0, -1);
    } else {
      value = escape(value);
    }
    return acc + value + string;
  });
}

// src/index.js
function merge(out) {
  out = out || {};
  for (var argIndex = 1; argIndex < arguments.length; argIndex++) {
    var obj = arguments[argIndex];
    if (!obj || typeof val !== "object") {
      continue;
    }
    var keys2 = keys2(obj);
    for (var keyIndex = 1; keyIndex < keys2.length; keyIndex++) {
      var key = keys2[keyIndex];
      var val = obj[key];
      out[key] = typeof val === "object" && val !== null ? merge(out[key], val) : val;
    }
  }
  return out;
}
function parseAsFragment(html2) {
  var templateTag = document.createElement("template");
  templateTag.innerHTML = html2;
  return templateTag.content;
}
function traverseElements(parentNode, onNextNode) {
  var treeWalker = document.createTreeWalker(parentNode, NodeFilter.SHOW_ELEMENT), node = treeWalker.nextNode();
  while (node) {
    if (isCustomElement(node)) {
      node = treeWalker.nextSibling();
      continue;
    }
    onNextNode(node);
    node = treeWalker.nextNode();
  }
}
function Pepper(config) {
  var self = this;
  self._data = typeof config.data === "object" && config.data || {};
  var mount = config.mount;
  var hydrate = config.hydrate;
  delete config.data;
  delete config.mount;
  delete config.hydrate;
  objectAssign(self, config);
  Object.defineProperty(self, "data", {
    configurable: false,
    set(data) {
      self._data = data;
      self.render();
    },
    get() {
      return self._data;
    }
  });
  if (hydrate) {
    self.hydrate();
  } else if (mount) {
    self.mount();
  }
}
var handlerMap = /* @__PURE__ */ new WeakMap();
function attachHandler(node, context, eventName, func) {
  if (!func)
    return;
  var newMap = handlerMap.get(node) || {};
  newMap[eventName] = func;
  handlerMap.set(node, newMap);
  node.addEventListener(eventName, context);
}
function removeAllHandlers(node, context) {
  Object.keys(handlerMap.get(node) || {}).forEach(function(eventName) {
    node.removeEventListener(eventName, context);
  });
  handlerMap.delete(node);
}
function callHandler(context, event) {
  var node = event.currentTarget;
  var func = (handlerMap.get(node) || {})[event.type];
  if (func) {
    func.call(context, event);
  }
}
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
  getHtml() {
    return "";
  },
  /**
   * Set data on this.data (using Object.assign), and re-render.
   */
  assign() {
    var args = from(arguments);
    objectAssign.apply(null, [this.data].concat(args));
    this.render();
  },
  /**
   * Deep merge data with this.data, and re-render.
   */
  merge(data) {
    merge(this.data, data);
    this.render();
  },
  handleEvent(event) {
    callHandler(this, event);
  },
  toString: function renderToString() {
    var self = this;
    var connect = self.connect;
    var storeData = connect && connect.store && connect.store._data || {};
    var storeDataSubset = (connect && connect.props || []).reduce((acc, prop) => {
      acc[prop] = storeData[prop];
      return acc;
    }, {});
    var data = objectAssign(storeDataSubset, self.data);
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
    var self = this;
    var target = self.el;
    var focusId = document.activeElement.id;
    if (target) {
      traverseElements(target, (node) => {
        var refVal = node.getAttribute("ref");
        if (refVal && self[refVal] instanceof Node) {
          delete self[refVal];
        }
        if (handlerMap.has(node)) {
          removeAllHandlers(node, self);
        }
      });
    }
    var frag = parseAsFragment(self.toString());
    var els = from(frag.childNodes);
    if (target) {
      var live = from(target.childNodes);
      patchDom(els, live, target);
    }
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
    var self = this;
    self.el.pepperInstance = self;
    traverseElements(self.el, (node) => {
      var refVal = node.getAttribute("ref");
      if (refVal) {
        self[refVal] = node;
      }
      each(node.attributes, (attr) => {
        if (attr.name.startsWith("on-")) {
          var eventName = attr.name.replace(/on-/, "");
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
    var connect = self.connect;
    if (connect && connect.store) {
      connect.store.subscribe(connect.props, self.render, self);
    }
    var node = self.target;
    if (typeof node === "string") {
      node = document.querySelector(node);
    }
    if (self.el && node === self.el) {
      return false;
    }
    if (node) {
      self.el = node;
      if (hydrateOnly) {
        self.domHydrate();
      } else {
        self.render();
      }
      return true;
    }
    return false;
  },
  hydrate(data) {
    if (arguments.length > 0 && data && typeof data === "object") {
      this._data = data;
    }
    this.mount(true);
  },
  unmount() {
    var self = this;
    var connect = self.connect;
    if (connect && connect.store) {
      connect.store.unsubscribe(self.render, self);
    }
    self.el.replaceChildren();
  }
};
//# sourceMappingURL=index.cjs.map
