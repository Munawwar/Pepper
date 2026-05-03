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
  Store: () => Store,
  html: () => html,
  hydrate: () => hydrate,
  ref: () => ref,
  render: () => render,
  renderToString: () => renderToString,
  state: () => state
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
function isEqual(value1, value2) {
  if (Object.is(value1, value2)) return true;
  if (value1 === null || value2 === null || typeof value1 !== "object" || typeof value2 !== "object") {
    return value1 === value2;
  }
  var prototype = Object.getPrototypeOf(value1);
  if (prototype !== Object.getPrototypeOf(value2)) {
    return false;
  }
  if (Array.isArray(value1)) {
    return value1.length === value2.length && value1.every((item, index) => isEqual(item, value2[index]));
  }
  if (value1 instanceof Date) {
    return value1.getTime() === value2.getTime();
  }
  if (value1 instanceof RegExp) {
    return value1.toString() === value2.toString();
  }
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  var objectKeys = keys(value1);
  return objectKeys.length === keys(value2).length && objectKeys.every((key) => key in value2 && isEqual(value1[key], value2[key]));
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
var refAttrRegex = /ref=["']?$/;
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
          throw new Error("Pepper event handlers require the render-bound html passed to render(html).");
        }
        acc += renderContext.handlerIndex++;
        if (renderContext.handlers) {
          renderContext.handlers.push(value);
        }
        acc += strings[index];
        continue;
      }
      if (refAttrRegex.test(prevString)) {
        if (!value || typeof value !== "object" || !("current" in value)) {
          throw new Error("Pepper refs only support ref() values, e.g. ref=${buttonRef}.");
        }
        if (!renderContext) {
          throw new Error("Pepper refs require the render-bound html passed to render(html).");
        }
        acc += renderContext.refIndex++;
        if (renderContext.refs) {
          renderContext.refs.push(value);
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
var rootMap = /* @__PURE__ */ new WeakMap();
var handlerMap = /* @__PURE__ */ new WeakMap();
var scheduleMicrotask = typeof queueMicrotask === "function" ? queueMicrotask : (callback) => Promise.resolve().then(callback);
var currentSetupRuntime = null;
function parseAsFragment(htmlString) {
  const templateTag = document.createElement("template");
  templateTag.innerHTML = htmlString;
  return templateTag.content;
}
function traverseElements(parentNode, onNextNode) {
  const treeWalker = document.createTreeWalker(parentNode, NodeFilter.SHOW_ELEMENT);
  let node = treeWalker.nextNode();
  while (node) {
    if (isCustomElement(node)) {
      node = treeWalker.nextSibling();
      continue;
    }
    onNextNode(
      /** @type {Element} */
      node
    );
    node = treeWalker.nextNode();
  }
}
function state(initialValue, comparator = isEqual) {
  const runtime = currentSetupRuntime;
  if (!runtime) {
    throw new Error("state() can only be used while creating a Pepper component.");
  }
  let value = initialValue;
  return [
    () => value,
    (valueOrSetter, callback) => {
      const nextValue = typeof valueOrSetter === "function" ? valueOrSetter(value) : valueOrSetter;
      if (comparator(nextValue, value)) {
        return;
      }
      value = nextValue;
      if (callback !== false) {
        scheduleRender(runtime, callback);
      }
    }
  ];
}
function ref() {
  const runtime = currentSetupRuntime;
  if (!runtime) {
    throw new Error("ref() can only be used while creating a Pepper component.");
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
    if (!runtime.pendingRender || runtime.isInitializing || runtime.isRendering || runtime.isRunningMountHandlers) {
      return;
    }
    runtime.pendingRender = false;
    runComponent(runtime);
  });
}
function scheduleRender(runtime, callback) {
  if (typeof callback === "function") {
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
      if (attr.name === "ref") {
        const refObject = runtime.renderRefs && runtime.renderRefs[attr.value];
        if (refObject) {
          refObject.current = node;
        }
        return;
      }
      if (!attr.name.startsWith("on-")) {
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
      if (typeof cleanup === "function") {
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
function runComponent(runtime, hydrateOnly = false, isServerRender = typeof window === "undefined" || typeof document === "undefined", changedProps = runtime.pendingChangedProps, oldProps = runtime.pendingOldProps) {
  runtime.isServerRender = isServerRender;
  runtime.pendingChangedProps = [];
  runtime.pendingOldProps = runtime.props;
  runtime.isRendering = true;
  const renderContext = {
    handlerIndex: 0,
    handlers: isServerRender ? null : [],
    refIndex: 0,
    refs: isServerRender ? null : []
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
    return runtime.pendingRender ? (runtime.pendingRender = false, runComponent(runtime, false, true, [], runtime.props)) : htmlString;
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
    }
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
      update: runtime.update
    });
    runtime.model = typeof model === "function" ? { render: model } : model;
    if (!runtime.model || typeof runtime.model.render !== "function") {
      throw new Error("Pepper components must return a render function or an object with a render(html) method.");
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
  return typeof container === "string" ? document.querySelector(container) : container;
}
function mountRoot(Component, container, props = {}, hydrateOnly = false) {
  const target = resolveContainer(container);
  if (!(target instanceof Element)) {
    throw new Error("Pepper render/hydrate target must be a DOM element or selector.");
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
//# sourceMappingURL=index.cjs.map
