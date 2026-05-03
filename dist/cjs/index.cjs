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
var index_exports = {};
__export(index_exports, {
  Pepper: () => Pepper,
  Store: () => Store,
  html: () => html
});
module.exports = __toCommonJS(index_exports);

// src/utils.js
var from = Array.from;
function each(arrayLike, fn) {
  return Array.prototype.forEach.call(arrayLike, fn);
}
function isCustomElement(element) {
  if (element.tagName.indexOf("-") > 0) return true;
  var attr = element.getAttribute("is");
  return attr && attr.indexOf("-") > 0;
}
function keys(obj) {
  if (!obj) return [];
  return Object.keys(obj).filter((key) => key !== "constructor");
}
function objectAssign(target, ...args) {
  args.forEach((obj) => {
    keys(obj).forEach((key) => {
      target[key] = obj[key];
    });
  });
  return target;
}

// src/dom-diff.js
function getChildNodes(el) {
  var l = [];
  for (var node = el.firstChild; node; node = node.nextSibling) {
    l.push(node);
  }
  return l;
}
function syncNode(newNode, liveNode) {
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
  if (!isCustomElement(newNode) && newNode.innerHTML != liveNode.innerHTML) {
    patchDom(
      liveNode,
      getChildNodes(newNode)
    );
  }
}
function getCustomElementOuterHtml(el) {
  return el.outerHTML.slice(0, -(el.innerHTML.length + el.tagName.length + 4)) + "/>";
}
function hashNode(node) {
  return node.nodeType + ":" + (node.nodeType === 1 ? isCustomElement(node) ? getCustomElementOuterHtml(node) : (
    /** @type {Element} */
    node.outerHTML
  ) : (
    // comment, text, cdata node
    node.nodeValue
  ));
}
function matchNodes(a, aStart, aEnd, b, bStart, bEnd) {
  var domLookup = {};
  var newNodeToLiveNodeMatch = /* @__PURE__ */ new Map();
  var i, hash;
  for (i = bStart; i < bEnd; i++) {
    hash = hashNode(b[i]);
    if (!domLookup[hash]) domLookup[hash] = [];
    domLookup[hash].push(b[i]);
  }
  var salvagableElements = {};
  var salvagableElementsById = {};
  var newNode;
  for (i = aStart; i < aEnd; i++) {
    var liveNode = a[i];
    hash = hashNode(liveNode);
    var entry = domLookup[hash];
    var matched = false;
    if (entry) {
      newNode = entry.shift();
      if (newNode) {
        newNodeToLiveNodeMatch.set(newNode, liveNode);
        matched = true;
      }
    }
    if (!matched && liveNode.nodeType === 1) {
      if (liveNode.id) salvagableElementsById[liveNode.id] = liveNode;
      if (!salvagableElements[liveNode.nodeName]) salvagableElements[liveNode.nodeName] = [];
      salvagableElements[liveNode.nodeName].push(
        /** @type {Element} */
        liveNode
      );
    }
  }
  var aLiveNode;
  for (i = bStart; i < bEnd; i++) {
    newNode = b[i];
    if (newNodeToLiveNodeMatch.get(newNode)) continue;
    var id = newNode.id;
    aLiveNode = id && salvagableElementsById[id];
    if (aLiveNode) {
      syncNode(newNode, aLiveNode);
      newNodeToLiveNodeMatch.set(newNode, aLiveNode);
      salvagableElements[newNode.nodeName].splice(
        salvagableElements[newNode.nodeName].indexOf(aLiveNode),
        1
      );
      salvagableElementsById[id] = null;
    }
  }
  for (i = bStart; i < bEnd; i++) {
    newNode = b[i];
    if (newNodeToLiveNodeMatch.get(newNode)) continue;
    if (newNode.nodeType === 1 && (aLiveNode = (salvagableElements[newNode.nodeName] || []).shift())) {
      syncNode(newNode, aLiveNode);
      newNodeToLiveNodeMatch.set(newNode, aLiveNode);
    }
  }
  return newNodeToLiveNodeMatch;
}
function patchDom(parentNode, newNodes) {
  var a = getChildNodes(parentNode);
  var aLen = a.length;
  var aStart = 0;
  var aEnd = aLen;
  var b = newNodes;
  var bStart = 0;
  var bEnd = b.length;
  while (aStart < aEnd || bStart < bEnd) {
    if (aEnd === aStart) {
      var insertBefore = a[aEnd];
      while (bStart < bEnd) {
        parentNode.insertBefore(b[bStart++], insertBefore);
      }
    } else if (bEnd === bStart) {
      if (!b.length) {
        parentNode.replaceChildren();
        aEnd = aStart;
      } else {
        while (aStart < aEnd) {
          a[--aEnd].remove();
        }
      }
    } else if (a[aStart].isEqualNode(b[bStart])) {
      aStart++;
      bStart++;
    } else if (a[aEnd - 1].isEqualNode(b[bEnd - 1])) {
      aEnd--;
      bEnd--;
    } else if (aStart < aEnd - 1 && bStart < bEnd - 1 && a[aStart].isEqualNode(b[bEnd - 1]) && b[bStart].isEqualNode(a[aEnd - 1])) {
      --aEnd;
      bStart++;
      --bEnd;
      var oldStartNode = a[aStart++];
      var oldEndNode = a[aEnd];
      var startInsertBefore = oldStartNode.nextSibling;
      parentNode.insertBefore(oldStartNode, oldEndNode.nextSibling);
      if (startInsertBefore !== oldEndNode) {
        parentNode.insertBefore(oldEndNode, startInsertBefore);
      }
    } else {
      var newNodeToLiveNodeMatch = matchNodes(a, aStart, aEnd, b, bStart, bEnd);
      var i, newNode, nodeAtPosition;
      for (i = bStart; i < bEnd; i++) {
        newNode = b[i];
        var existingLiveNode = newNodeToLiveNodeMatch.get(newNode);
        nodeAtPosition = nodeAtPosition ? nodeAtPosition.nextSibling : a[i];
        if (existingLiveNode) {
          if (nodeAtPosition !== existingLiveNode) {
            parentNode.insertBefore(existingLiveNode, nodeAtPosition);
            nodeAtPosition = existingLiveNode;
          }
        } else {
          parentNode.insertBefore(newNode, nodeAtPosition);
          nodeAtPosition = newNode;
          aLen++;
        }
      }
      while (aLen-- > b.length) {
        nodeAtPosition.nextSibling.remove();
      }
      break;
    }
  }
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
  '"': "&quot;",
  // prevent attacks like html`<img src="x" onerror="html\`\${alert(1)}\`" />`
  "`": "&#x60;"
};
var findRegex = /[<>&'"]/g;
var eventAttrRegex = /(on-[^\s"'<>/=]+)=["']?$/;
var replaceFunc = (character) => characterEntitiesMapping[character];
function createHtml(renderContext = null) {
  return function html2(strings, ...values) {
    let acc = strings[0];
    for (let index = 1; index < strings.length; index++) {
      const prevString = strings[index - 1];
      const value = values[index - 1];
      if (prevString.endsWith("$")) {
        acc = acc.slice(0, -1);
        acc += value + strings[index];
        continue;
      }
      if (eventAttrRegex.test(prevString)) {
        if (typeof value !== "function") {
          throw new Error("Pepper event attributes only support function values, e.g. on-click=${handler}.");
        }
        if (!renderContext) {
          throw new Error("Pepper event handlers require the render-bound html passed to getHtml(html, data).");
        }
        acc += renderContext.handlerIndex++;
        if (renderContext.handlers) {
          renderContext.handlers.push(value);
        }
        acc += strings[index];
        continue;
      }
      let safeValue = String(value);
      if (safeValue) {
        safeValue = safeValue.replace(findRegex, replaceFunc);
      }
      acc += safeValue + strings[index];
    }
    return acc;
  };
}
var html = createHtml();

// src/index.js
function merge(out, ...args) {
  out = out || {};
  for (let argIndex = 0; argIndex < args.length; argIndex++) {
    let obj = args[argIndex];
    if (!obj || typeof obj !== "object") {
      continue;
    }
    let objectKeys = keys(obj);
    for (let keyIndex = 0; keyIndex < objectKeys.length; keyIndex++) {
      let key = objectKeys[keyIndex];
      let val = obj[key];
      out[key] = val && typeof val === "object" ? merge(out[key], val) : val;
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
  if (!func) return;
  var newMap = handlerMap.get(node) || {};
  newMap[eventName] = func;
  handlerMap.set(node, newMap);
  node.addEventListener(eventName, context);
}
function removeAllHandlers(node, context) {
  Object.keys(handlerMap.get(node) || {}).forEach((eventName) => {
    node.removeEventListener(eventName, context);
  });
  handlerMap.delete(node);
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
   * @param {typeof import('./html.js').html} html render-bound html template tag
   * @param {any} data combined data from this.data and subscribed stores
   * @returns {string}
   */
  getHtml() {
    return "";
  },
  /**
   * Set data on this.data (using Object.assign), and re-render.
   */
  assign(...args) {
    objectAssign(this.data, ...args);
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
    var func = (handlerMap.get(event.currentTarget) || {})[event.type];
    if (func) {
      func(event);
    }
  },
  toString: function renderToString(isServerRender = typeof window === "undefined" || typeof document === "undefined") {
    var self = this;
    var stores = self.stores;
    const storeData = keys(stores).reduce((acc, storeKey) => {
      var { store, props } = stores[storeKey];
      var storeData2 = store && store._data || {};
      acc[storeKey] = (props || []).reduce((acc2, prop) => {
        acc2[prop] = storeData2[prop];
        return acc2;
      }, {});
      return acc;
    }, {});
    var data = objectAssign({ stores: storeData }, self.data);
    var renderContext = {
      handlerIndex: 0,
      handlers: isServerRender ? null : []
    };
    self._renderHandlers = renderContext.handlers;
    return self.getHtml(createHtml(renderContext), data);
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
    var frag = parseAsFragment(self.toString(false));
    var els = from(frag.childNodes);
    if (target) {
      patchDom(target, els);
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
          var func = (self._renderHandlers || [])[attr.value];
          attachHandler(node, self, eventName, func);
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
    if (typeof node === "string") {
      node = document.querySelector(node);
    }
    if (self.el && node === self.el) {
      return false;
    }
    if (node) {
      self.el = node;
      if (hydrateOnly) {
        self.toString(false);
        self.domHydrate();
      } else {
        self.render();
      }
      return true;
    }
    return false;
  },
  hydrate(data) {
    if (data && typeof data === "object") {
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
    self.el.replaceChildren();
  }
};
//# sourceMappingURL=index.cjs.map
