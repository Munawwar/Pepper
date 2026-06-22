// src/html-ssr.js
var FORCE_SYMBOL = /* @__PURE__ */ Symbol("force");
var TEMPLATE_RESULT_SYMBOL = /* @__PURE__ */ Symbol("template-result");
var UNSAFE_HTML_SYMBOL = /* @__PURE__ */ Symbol("unsafe-html");
var UNSAFE_SVG_SYMBOL = /* @__PURE__ */ Symbol("unsafe-svg");
var UNSAFE_MATHML_SYMBOL = /* @__PURE__ */ Symbol("unsafe-mathml");
var RAW_TEXT_SYMBOL = /* @__PURE__ */ Symbol("raw-text");
var INTERPOLATION_MARKER = "\u29D9\u29D8";
var INTERPOLATION_PARTS_REGEXP = new RegExp(`${INTERPOLATION_MARKER}(\\d+)${INTERPOLATION_MARKER}`);
var SPREAD_SITE_REGEXP = new RegExp(`^\\.\\.\\.${INTERPOLATION_MARKER}(\\d+)${INTERPOLATION_MARKER}$`);
var VOID_ELEMENTS = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
var ATTRIBUTE_SITE_ERROR = "Nested templates and DOM elements are not allowed in attributes. Use text content interpolation instead.";
var TRUSTED_TEXT_INPUT_ERROR = "unsafeHTML(), unsafeSVG(), unsafeMathML(), and rawText() expect a string.";
var TRUSTED_TEXT_CONTEXT_ERROR = "unsafeHTML(), unsafeSVG(), unsafeMathML(), and rawText() are only allowed in text content interpolation.";
var RAW_TEXT_REPLACEMENTS = [
  [/<\/script(?=[\t\n\f\r />])/gi, (match) => `\\x3C${match.slice(1)}`],
  [/<script(?=[\t\n\f\r />])/gi, (match) => `\\x3C${match.slice(1)}`],
  [/<!--/g, "\\x3C!--"],
  [/<\/style(?=[\t\n\f\r />])/gi, (match) => `\\x3C${match.slice(1)}`],
  [/<style(?=[\t\n\f\r />])/gi, (match) => `\\x3C${match.slice(1)}`],
  [/<\/textarea(?=[\t\n\f\r />])/gi, (match) => `\\x3C${match.slice(1)}`],
  [/<\/title(?=[\t\n\f\r />])/gi, (match) => `\\x3C${match.slice(1)}`],
  [/<\/template(?=[\t\n\f\r />])/gi, (match) => `\\x3C${match.slice(1)}`]
];
var ssrTemplateCache = /* @__PURE__ */ new WeakMap();
function html(strings, ...values) {
  return handleTemplateTag("html", strings, ...values);
}
function svg(strings, ...values) {
  return handleTemplateTag("svg", strings, ...values);
}
function mathml(strings, ...values) {
  return handleTemplateTag("mathml", strings, ...values);
}
function force(value) {
  return { [FORCE_SYMBOL]: value };
}
function wrapTrustedTextValue(symbol, value) {
  if (typeof value !== "string") throw new TypeError(TRUSTED_TEXT_INPUT_ERROR);
  return { [symbol]: value };
}
function unsafeHTML(value) {
  return wrapTrustedTextValue(UNSAFE_HTML_SYMBOL, value);
}
function unsafeSVG(value) {
  return wrapTrustedTextValue(UNSAFE_SVG_SYMBOL, value);
}
function unsafeMathML(value) {
  return wrapTrustedTextValue(UNSAFE_MATHML_SYMBOL, value);
}
function rawText(value) {
  return wrapTrustedTextValue(RAW_TEXT_SYMBOL, value);
}
function renderToString(value) {
  return serializeChildValue(value);
}
function clearTemplateCache() {
  ssrTemplateCache = /* @__PURE__ */ new WeakMap();
}
function unwrapForce(value) {
  return typeof value === "object" && value !== null && FORCE_SYMBOL in value ? value[FORCE_SYMBOL] : value;
}
function handleTemplateTag(mode, strings, ...values) {
  const render = function() {
    return { [TEMPLATE_RESULT_SYMBOL]: true, mode, strings, values };
  };
  render.template = { mode, strings };
  return render;
}
function serializeChildValue(value) {
  value = unwrapForce(value);
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.map(serializeChildValue).join("");
  if (typeof value === "function") return serializeChildValue(value());
  if (looksTrustedTextValue(value)) return serializeTrustedTextValue(value);
  if (looksTemplateValue(value))
    return serializeCompiledTemplate(
      getCompiledTemplate(
        /** @type {TemplateResult} */
        value.strings
      ),
      /** @type {TemplateResult} */
      value.values
    );
  if (looksLikeNode(value)) throw new Error("DOM nodes are not supported by pepper/ssr");
  return escapeHtml(String(value));
}
function getCompiledTemplate(strings) {
  let compiled = ssrTemplateCache.get(strings);
  if (compiled) return compiled;
  const source = strings.reduce(
    /**
     * @param {string} htmlString
     * @param {string} string
     * @param {number} index
     */
    (htmlString, string, index) => htmlString + string + (index < strings.length - 1 ? `${INTERPOLATION_MARKER}${index}${INTERPOLATION_MARKER}` : ""),
    ""
  );
  compiled = { ops: [] };
  let cursor = 0;
  let depth = 0;
  while (cursor < source.length) {
    if (source.startsWith("<!--", cursor)) {
      const commentEnd = source.indexOf("-->", cursor + 4);
      const end2 = commentEnd === -1 ? source.length : commentEnd + 3;
      compiled.ops.push({ type: "static", value: source.slice(cursor, end2) });
      cursor = end2;
      continue;
    }
    if (source.startsWith("<![CDATA[", cursor)) {
      const cdataEnd = source.indexOf("]]>", cursor + 9);
      const end2 = cdataEnd === -1 ? source.length : cdataEnd + 3;
      compiled.ops.push({ type: "static", value: source.slice(cursor, end2) });
      cursor = end2;
      continue;
    }
    if (source[cursor] === "<") {
      const tag = compileTag(source, cursor);
      compiled.ops.push(tag.op);
      cursor = tag.end;
      depth += tag.depthDelta;
      continue;
    }
    const nextTag = source.indexOf("<", cursor);
    const end = nextTag === -1 ? source.length : nextTag;
    const parts = parseInterpolationParts(source.slice(cursor, end));
    const filteredParts = depth === 0 ? parts.filter((part) => typeof part === "number" || typeof part === "string" && part.trim() !== "") : parts;
    if (filteredParts.length) compiled.ops.push({ type: "text", parts: filteredParts });
    cursor = end;
  }
  ssrTemplateCache.set(strings, compiled);
  return compiled;
}
function compileTag(source, start) {
  if (source.startsWith("</", start)) {
    const end2 = source.indexOf(">", start + 2);
    const safeEnd = end2 === -1 ? source.length : end2 + 1;
    return { op: { type: "static", value: source.slice(start, safeEnd) }, end: safeEnd, depthDelta: -1 };
  }
  if (source[start + 1] === "!" || source[start + 1] === "?") {
    const end2 = source.indexOf(">", start + 2);
    const safeEnd = end2 === -1 ? source.length : end2 + 1;
    return { op: { type: "static", value: source.slice(start, safeEnd) }, end: safeEnd, depthDelta: 0 };
  }
  let cursor = start + 1;
  let quote = "";
  while (cursor < source.length) {
    const char = source[cursor];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === ">") break;
    cursor++;
  }
  const end = Math.min(cursor + 1, source.length);
  const raw = source.slice(start, end);
  const op = compileStartTag(raw);
  return { op, end, depthDelta: op.selfClosing || op.voidElement ? 0 : 1 };
}
function compileStartTag(raw) {
  let cursor = 1;
  let tagName = "";
  while (cursor < raw.length && !/[\s/>]/.test(raw[cursor])) tagName += raw[cursor++];
  const lowerTagName = tagName.toLowerCase();
  let isSelfClosing = false;
  const bindings = [];
  while (cursor < raw.length - 1) {
    while (cursor < raw.length - 1 && /\s/.test(raw[cursor])) cursor++;
    if (cursor >= raw.length - 1) break;
    if (raw[cursor] === "/") {
      isSelfClosing = true;
      cursor++;
      continue;
    }
    const nameStart = cursor;
    while (cursor < raw.length - 1 && !/[\s=/>]/.test(raw[cursor])) cursor++;
    const name = raw.slice(nameStart, cursor);
    while (cursor < raw.length - 1 && /\s/.test(raw[cursor])) cursor++;
    let value = null;
    if (raw[cursor] === "=") {
      cursor++;
      while (cursor < raw.length - 1 && /\s/.test(raw[cursor])) cursor++;
      if (raw[cursor] === '"' || raw[cursor] === "'") {
        const quote = raw[cursor++];
        const valueStart = cursor;
        while (cursor < raw.length - 1 && raw[cursor] !== quote) cursor++;
        value = raw.slice(valueStart, cursor);
        cursor++;
      } else {
        const valueStart = cursor;
        while (cursor < raw.length - 1 && !/[\s/>]/.test(raw[cursor])) cursor++;
        value = raw.slice(valueStart, cursor);
      }
    }
    const spreadMatch = name.match(SPREAD_SITE_REGEXP);
    if (spreadMatch) {
      bindings.push({ type: "spread", index: Number(spreadMatch[1]) });
      continue;
    }
    if (name.startsWith("?") || name.startsWith("!?")) {
      bindings.push({
        type: "boolean-attribute",
        name: name.slice(name[1] === "?" ? 2 : 1),
        parts: value == null ? null : parseInterpolationParts(value)
      });
      continue;
    }
    if (name.startsWith(".") || name.startsWith("!.") || name.startsWith("@") || name.startsWith("!@")) continue;
    bindings.push({
      type: "attribute",
      name: name.startsWith("!") ? name.slice(1) : name,
      parts: value == null ? [""] : parseInterpolationParts(value)
    });
  }
  return { type: "start-tag", tagName, selfClosing: isSelfClosing, voidElement: VOID_ELEMENTS.has(lowerTagName), bindings };
}
function serializeCompiledTemplate(compiled, values) {
  let output = "";
  for (const op of compiled.ops) {
    if (op.type === "static") output += op.value;
    else if (op.type === "text") {
      for (const part of op.parts) output += typeof part === "number" ? serializeChildValue(values[part]) : part;
    } else {
      const bindings = /* @__PURE__ */ new Map();
      for (const binding of op.bindings) {
        if (binding.type === "spread") {
          applySpreadBindings(bindings, values[binding.index]);
          continue;
        }
        if (binding.type === "boolean-attribute") {
          let value2 = false;
          if (binding.parts) {
            if (binding.parts.length === 3 && binding.parts[0] === "" && binding.parts[2] === "" && typeof binding.parts[1] === "number")
              value2 = !!unwrapForce(values[binding.parts[1]]);
            else if (binding.parts.length === 1 && typeof binding.parts[0] === "string")
              value2 = binding.parts[0].trim() !== "";
            else value2 = true;
          }
          bindings.set(`?${binding.name}`, { type: binding.type, name: binding.name, value: value2 });
          continue;
        }
        let value = "";
        for (const part of binding.parts) {
          if (typeof part === "number") value += escapeHtml(resolveAttributeInput(values[part]), true);
          else value += part.replaceAll('"', "&quot;");
        }
        bindings.set(binding.name, { type: binding.type, name: binding.name, value });
      }
      output += `<${op.tagName}`;
      for (const binding of bindings.values()) {
        if (binding.type === "attribute") output += ` ${binding.name}="${binding.value}"`;
        else if (binding.type === "boolean-attribute" && binding.value) output += ` ${binding.name}=""`;
      }
      output += op.selfClosing ? "/>" : ">";
    }
  }
  return output;
}
function applySpreadBindings(bindings, spreadValue) {
  spreadValue = unwrapForce(spreadValue);
  if (spreadValue == null || spreadValue === false || typeof spreadValue !== "object" || Array.isArray(spreadValue) || looksLikeNode(spreadValue))
    return;
  for (const [name, value] of Object.entries(spreadValue)) {
    if (name.startsWith("?")) {
      bindings.set(name, { type: "boolean-attribute", name: name.slice(1), value: !!unwrapForce(value) });
      continue;
    }
    if (name.startsWith(".") || name.startsWith("@")) continue;
    bindings.set(name, {
      type: "attribute",
      name,
      value: escapeHtml(resolveAttributeInput(value), true)
    });
  }
}
function resolveAttributeInput(value) {
  value = unwrapForce(value);
  if (value == null) return "";
  if (looksTrustedTextValue(value)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR);
  if (typeof value === "function" || Array.isArray(value) || looksTemplateValue(value) || looksLikeNode(value))
    throw new Error(ATTRIBUTE_SITE_ERROR);
  return String(value);
}
function parseInterpolationParts(value) {
  if (!value.includes(INTERPOLATION_MARKER)) return [value];
  return value.split(INTERPOLATION_PARTS_REGEXP).map((part, index) => index % 2 === 1 ? Number(part) : part);
}
function escapeHtml(value, attribute = false) {
  value = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return attribute ? value.replaceAll('"', "&quot;") : value;
}
function looksTemplateValue(value) {
  return typeof value === "object" && value !== null && TEMPLATE_RESULT_SYMBOL in value;
}
function looksLikeNode(value) {
  return typeof value === "object" && value !== null && "nodeType" in value;
}
function looksTrustedTextValue(value) {
  return typeof value === "object" && value !== null && (UNSAFE_HTML_SYMBOL in value || UNSAFE_SVG_SYMBOL in value || UNSAFE_MATHML_SYMBOL in value || RAW_TEXT_SYMBOL in value);
}
function serializeTrustedTextValue(value) {
  if (UNSAFE_HTML_SYMBOL in value || UNSAFE_SVG_SYMBOL in value || UNSAFE_MATHML_SYMBOL in value)
    return value[UNSAFE_HTML_SYMBOL] || value[UNSAFE_SVG_SYMBOL] || value[UNSAFE_MATHML_SYMBOL] || "";
  if (!(RAW_TEXT_SYMBOL in value)) return "";
  let text = value[RAW_TEXT_SYMBOL] || "";
  for (const [pattern, replacement] of RAW_TEXT_REPLACEMENTS) {
    if (typeof replacement === "string") text = text.replace(pattern, replacement);
    else text = text.replace(pattern, replacement);
  }
  return text;
}

// src/utils.js
function keys(obj) {
  if (!obj) return [];
  return Object.keys(obj).filter((key) => key !== "constructor");
}
function isEqual(value1, value2) {
  if (Object.is(value1, value2)) return true;
  if (value1 === null || value2 === null || typeof value1 !== "object" || typeof value2 !== "object") {
    return value1 === value2;
  }
  const prototype = Object.getPrototypeOf(value1);
  if (prototype !== Object.getPrototypeOf(value2)) {
    return false;
  }
  if (Array.isArray(value1)) {
    const array2 = (
      /** @type {unknown[]} */
      value2
    );
    return value1.length === array2.length && value1.every((item, index) => isEqual(item, array2[index]));
  }
  if (value1 instanceof Date) {
    return value1.getTime() === /** @type {Date} */
    value2.getTime();
  }
  if (value1 instanceof RegExp) {
    return value1.toString() === value2.toString();
  }
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  const objectKeys = keys(value1);
  return objectKeys.length === keys(value2).length && objectKeys.every((key) => key in /** @type {Record<string, unknown>} */
  value2 && isEqual(
    /** @type {Record<string, unknown>} */
    value1[key],
    /** @type {Record<string, unknown>} */
    value2[key]
  ));
}

// src/component-runtime.js
var COMPONENT_SYMBOL = /* @__PURE__ */ Symbol("pepper-component");
var defaultComponentOptions = {
  autoEffectEvent: true,
  memo: true,
  propsComparator: null
};
var currentSetupRuntime = null;
var currentOwnerRuntime = null;
function component(factory, options = {}) {
  if (typeof factory !== "function") throw new TypeError("Pepper component() expects a function.");
  const wrapped = (
    /** @type {ConfigurableComponent} */
    (function PepperConfiguredComponent(api) {
      return factory(
        /** @type {any} */
        api
      );
    })
  );
  wrapped[COMPONENT_SYMBOL] = {
    factory: (
      /** @type {PepperComponent} */
      factory
    ),
    options: {
      ...defaultComponentOptions,
      .../** @type {ComponentOptions} */
      options
    }
  };
  return wrapped;
}
function getComponentDefinition(componentType) {
  if (typeof componentType !== "function") throw new TypeError("Pepper component tags expect a function component.");
  const metadata = (
    /** @type {ConfigurableComponent} */
    componentType[COMPONENT_SYMBOL]
  );
  return metadata || {
    factory: (
      /** @type {PepperComponent} */
      componentType
    ),
    options: defaultComponentOptions
  };
}
function state(initialValue, comparator = isEqual) {
  const runtime = currentSetupRuntime;
  if (!runtime) throw new Error("state() can only be used while creating a Pepper component.");
  let value = initialValue;
  return [
    () => value,
    (valueOrSetter, callback) => {
      const nextValue = typeof valueOrSetter === "function" ? (
        /** @type {(value: T) => T} */
        valueOrSetter(value)
      ) : valueOrSetter;
      if (comparator(nextValue, value)) return;
      value = nextValue;
      if (callback === false) return;
      markRuntimeDirty(runtime, callback);
    }
  ];
}
function ref() {
  const runtime = currentSetupRuntime;
  if (!runtime) throw new Error("ref() can only be used while creating a Pepper component.");
  const refObject = { current: null };
  runtime.refs.push(refObject);
  return refObject;
}
function markRuntimeDirty(runtime, callback) {
  if (callback && runtime.rootRecord.pendingCallbacks) runtime.rootRecord.pendingCallbacks.push(callback);
  runtime.dirty = true;
  for (let parent = runtime.parentRuntime; parent; parent = parent.parentRuntime) parent.hasDirtyDescendant = true;
  runtime.rootRecord.scheduleRender();
}
function shouldIgnorePropForMemo(runtime, key, value) {
  return runtime.options.autoEffectEvent !== false && typeof value === "function" && /^on[A-Z]/.test(key);
}
function syncComponentProps(runtime, nextProps = {}, forceAll = false) {
  const oldProps = runtime.props;
  const normalizedProps = {};
  const keys2 = /* @__PURE__ */ new Set([...Object.keys(oldProps), ...Object.keys(nextProps)]);
  const changedProps = [];
  for (const key of keys2) {
    if (!(key in nextProps)) {
      if (forceAll || key in oldProps) changedProps.push(key);
      continue;
    }
    normalizedProps[key] = nextProps[key];
  }
  if (!forceAll) {
    if (typeof runtime.options.propsComparator === "function") {
      if (!runtime.options.propsComparator(oldProps, normalizedProps)) {
        changedProps.push(...Object.keys(normalizedProps).filter((key) => !(key in oldProps)));
        for (const key of keys2) {
          if (!(key in nextProps) || shouldIgnorePropForMemo(runtime, key, nextProps[key])) continue;
          if (!(key in oldProps) || !Object.is(oldProps[key], nextProps[key])) changedProps.push(key);
        }
      }
    } else {
      for (const key of keys2) {
        if (!(key in nextProps) || shouldIgnorePropForMemo(runtime, key, nextProps[key])) continue;
        const previousValue = oldProps[key];
        const nextValue = nextProps[key];
        const isSame = runtime.options.memo === false ? Object.is(previousValue, nextValue) : isEqual(previousValue, nextValue);
        if (!(key in oldProps) || !isSame) changedProps.push(key);
      }
    }
  } else {
    changedProps.push(...keys2);
  }
  runtime.props = normalizedProps;
  runtime.pendingChangedProps = changedProps;
  runtime.pendingOldProps = oldProps;
  return changedProps.length > 0;
}
function createComponentRuntime(componentType, props, rootRecord, parentRuntime = null) {
  const definition = getComponentDefinition(componentType);
  const runtime = {
    childStores: /* @__PURE__ */ new Map(),
    componentType,
    currentRenderable: null,
    destroyed: false,
    dirty: true,
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
    viewKey: /* @__PURE__ */ Symbol("pepper-view")
  };
  syncComponentProps(runtime, props, true);
  const api = {
    getProps: () => runtime.props,
    onMount: (handler) => {
      runtime.mountHandlers.push(handler);
    },
    onProps: (handler) => {
      runtime.propHandlers.push(handler);
    },
    update: (callback) => {
      markRuntimeDirty(runtime, callback);
    }
  };
  const previousRuntime = currentSetupRuntime;
  currentSetupRuntime = runtime;
  try {
    const model = definition.factory(api);
    runtime.model = typeof model === "function" ? { render: model } : model;
    if (!runtime.model || typeof runtime.model.render !== "function") {
      throw new Error("Pepper components must return a render function or an object with a render(html) method.");
    }
  } finally {
    currentSetupRuntime = previousRuntime;
  }
  if (rootRecord.pendingMounts) rootRecord.pendingMounts.push(runtime);
  return runtime;
}
function renderComponentRuntime(runtime, tags) {
  if (runtime.currentRenderable && !runtime.dirty && !runtime.hasDirtyDescendant && !runtime.pendingChangedProps.length) return runtime.currentRenderable;
  if (runtime.pendingChangedProps.length) {
    for (const handler of runtime.propHandlers) handler(runtime.pendingChangedProps, runtime.pendingOldProps);
  }
  if (!runtime.model) throw new Error("Pepper component runtime is missing its model.");
  runtime.renderPassId++;
  const previousOwnerRuntime = currentOwnerRuntime;
  currentOwnerRuntime = runtime;
  try {
    runtime.currentRenderable = runtime.model.render.call(runtime.model, tags.html);
  } finally {
    currentOwnerRuntime = previousOwnerRuntime;
  }
  return runtime.currentRenderable;
}
function finalizeComponentRuntime(runtime) {
  for (const store of runtime.childStores.values()) {
    for (const [key, childRuntime] of store) {
      if (childRuntime.lastSeen === runtime.renderPassId) continue;
      destroyComponentRuntime(childRuntime);
      store.delete(key);
    }
  }
  runtime.dirty = false;
  runtime.hasDirtyDescendant = false;
  runtime.pendingChangedProps = [];
  runtime.pendingOldProps = runtime.props;
}
function destroyComponentRuntime(runtime) {
  if (!runtime || runtime.destroyed) return;
  runtime.destroyed = true;
  for (const store of runtime.childStores.values()) {
    for (const childRuntime of store.values()) destroyComponentRuntime(childRuntime);
    store.clear();
  }
  runtime.childStores.clear();
  for (const cleanup of runtime.mountCleanups.splice(0)) cleanup();
  for (const runtimeRef of runtime.refs) runtimeRef.current = null;
}

// src/component-syntax.js
var INTERPOLATION_MARKER2 = "\u29D9\u29D8";
var componentTemplateCache = /* @__PURE__ */ new WeakMap();
var sourceTemplateCache = /* @__PURE__ */ new Map();
function readInterpolationMarker(source, start) {
  if (!source.startsWith(INTERPOLATION_MARKER2, start)) return null;
  const valueStart = start + INTERPOLATION_MARKER2.length;
  const valueEnd = source.indexOf(INTERPOLATION_MARKER2, valueStart);
  if (valueEnd === -1) return null;
  return {
    index: parseInt(source.slice(valueStart, valueEnd)),
    end: valueEnd + INTERPOLATION_MARKER2.length
  };
}
function parseInterpolationParts2(source) {
  const parts = [];
  let cursor = 0;
  while (cursor < source.length) {
    const marker = readInterpolationMarker(source, cursor);
    if (marker) {
      parts.push(marker.index);
      cursor = marker.end;
      continue;
    }
    const nextMarker = source.indexOf(INTERPOLATION_MARKER2, cursor);
    if (nextMarker === -1) {
      parts.push(source.slice(cursor));
      break;
    }
    parts.push(source.slice(cursor, nextMarker));
    cursor = nextMarker;
  }
  return parts;
}
function resolveParts(parts, values) {
  if (!parts) return true;
  if (parts.length === 1 && typeof parts[0] === "number") return values[parts[0]];
  return parts.map((part) => typeof part === "number" ? String(values[part] ?? "") : part).join("");
}
function readDynamicComponentOpen(source, start) {
  if (source[start] !== "<") return null;
  const marker = readInterpolationMarker(source, start + 1);
  if (!marker) return null;
  let cursor = marker.end;
  let quote = "";
  while (cursor < source.length) {
    const character = source[cursor];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ">") break;
    cursor++;
  }
  if (cursor >= source.length) return null;
  const rawAttributes = source.slice(marker.end, cursor);
  return {
    componentIndex: marker.index,
    attributesSource: rawAttributes.replace(/\/\s*$/, ""),
    selfClosing: /\/\s*$/.test(rawAttributes),
    end: cursor + 1
  };
}
function readDynamicComponentClose(source, start) {
  if (!source.startsWith("</", start)) return null;
  const marker = readInterpolationMarker(source, start + 2);
  if (!marker) return null;
  let cursor = marker.end;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
  if (source[cursor] !== ">") return null;
  return {
    componentIndex: marker.index,
    start,
    end: cursor + 1
  };
}
function findMatchingComponentClose(source, start) {
  let depth = 1;
  let cursor = start;
  while (cursor < source.length) {
    if (source.startsWith("<!--", cursor)) {
      const commentEnd = source.indexOf("-->", cursor + 4);
      cursor = commentEnd === -1 ? source.length : commentEnd + 3;
      continue;
    }
    const close = readDynamicComponentClose(source, cursor);
    if (close) {
      depth--;
      if (!depth) return close;
      cursor = close.end;
      continue;
    }
    const open = readDynamicComponentOpen(source, cursor);
    if (open) {
      if (!open.selfClosing) depth++;
      cursor = open.end;
      continue;
    }
    cursor++;
  }
  return null;
}
function parseComponentBindings(attributesSource) {
  const bindings = [];
  let cursor = 0;
  while (cursor < attributesSource.length) {
    while (cursor < attributesSource.length && /\s/.test(attributesSource[cursor])) cursor++;
    if (cursor >= attributesSource.length) break;
    if (attributesSource.startsWith("...", cursor)) {
      const marker = readInterpolationMarker(attributesSource, cursor + 3);
      if (marker) {
        bindings.push(
          /** @type {ComponentBinding} */
          { type: "spread", index: marker.index }
        );
        cursor = marker.end;
        continue;
      }
    }
    const nameStart = cursor;
    while (cursor < attributesSource.length && !/[\s=>]/.test(attributesSource[cursor])) cursor++;
    const name = attributesSource.slice(nameStart, cursor);
    if (!name) break;
    while (cursor < attributesSource.length && /\s/.test(attributesSource[cursor])) cursor++;
    if (attributesSource[cursor] !== "=") {
      bindings.push(
        /** @type {ComponentBinding} */
        { type: "prop", name, parts: null }
      );
      continue;
    }
    cursor++;
    while (cursor < attributesSource.length && /\s/.test(attributesSource[cursor])) cursor++;
    let rawValue = "";
    if (attributesSource[cursor] === '"' || attributesSource[cursor] === "'") {
      const quote = attributesSource[cursor++];
      const valueStart = cursor;
      while (cursor < attributesSource.length && attributesSource[cursor] !== quote) cursor++;
      rawValue = attributesSource.slice(valueStart, cursor);
      cursor++;
    } else {
      const valueStart = cursor;
      while (cursor < attributesSource.length && !/\s/.test(attributesSource[cursor])) cursor++;
      rawValue = attributesSource.slice(valueStart, cursor);
    }
    bindings.push(
      /** @type {ComponentBinding} */
      { type: "prop", name, parts: parseInterpolationParts2(rawValue) }
    );
  }
  return bindings;
}
function compileComponentTemplate(strings) {
  let compiled = componentTemplateCache.get(strings);
  if (compiled) return compiled;
  const source = strings.reduce(
    (htmlString, string, index) => htmlString + string + (index < strings.length - 1 ? `${INTERPOLATION_MARKER2}${index}${INTERPOLATION_MARKER2}` : ""),
    ""
  );
  const outputStrings = Object.assign([""], { raw: [""] });
  const outputValues = [];
  let cursor = 0;
  let foundComponentSyntax = false;
  while (cursor < source.length) {
    const open = readDynamicComponentOpen(source, cursor);
    if (open) {
      foundComponentSyntax = true;
      let childrenSource = null;
      let end = open.end;
      if (!open.selfClosing) {
        const close = findMatchingComponentClose(source, open.end);
        if (!close) throw new Error("Pepper component tag is missing a matching closing tag.");
        childrenSource = source.slice(open.end, close.start);
        end = close.end;
      }
      outputValues.push({
        type: "component",
        componentIndex: open.componentIndex,
        bindings: parseComponentBindings(open.attributesSource),
        childrenSource
      });
      outputStrings.push("");
      outputStrings.raw.push("");
      cursor = end;
      continue;
    }
    const marker = readInterpolationMarker(source, cursor);
    if (marker) {
      outputValues.push({ type: "value", index: marker.index });
      outputStrings.push("");
      outputStrings.raw.push("");
      cursor = marker.end;
      continue;
    }
    outputStrings[outputStrings.length - 1] += source[cursor++];
  }
  compiled = foundComponentSyntax ? { strings: (
    /** @type {TemplateStringsArray} */
    outputStrings
  ), values: outputValues } : null;
  componentTemplateCache.set(strings, compiled);
  return compiled;
}
function getSourceTemplate(source) {
  let compiled = sourceTemplateCache.get(source);
  if (compiled) return compiled;
  const strings = Object.assign([""], { raw: [""] });
  const indices = [];
  let cursor = 0;
  while (cursor < source.length) {
    const marker = readInterpolationMarker(source, cursor);
    if (marker) {
      indices.push(marker.index);
      strings.push("");
      strings.raw.push("");
      cursor = marker.end;
      continue;
    }
    strings[strings.length - 1] += source[cursor++];
  }
  compiled = { indices, strings: (
    /** @type {TemplateStringsArray} */
    strings
  ) };
  sourceTemplateCache.set(source, compiled);
  return compiled;
}
function renderSourceTemplate(tag, source, values) {
  const compiled = getSourceTemplate(source);
  return tag(compiled.strings, ...compiled.indices.map((index) => values[index]));
}
function lowerComponentTemplate(compiled, values, createComponentValue) {
  if (!compiled) return null;
  return {
    strings: compiled.strings,
    values: compiled.values.map((entry, index) => entry.type === "value" ? values[entry.index] : createComponentValue(entry, values, index))
  };
}
function resolveComponentProps(bindings, values) {
  const props = {};
  let key;
  for (const binding of bindings) {
    if (binding.type === "spread") {
      const spreadValue = values[binding.index];
      if (spreadValue == null || spreadValue === false || typeof spreadValue !== "object" || Array.isArray(spreadValue)) continue;
      for (const [name, value2] of Object.entries(spreadValue)) {
        if (name === "key") key = value2;
        else props[name] = value2;
      }
      continue;
    }
    const value = resolveParts(binding.parts, values);
    if (binding.name === "key") key = value;
    else props[binding.name] = value;
  }
  return { props, key };
}

// src/pepper-ssr.js
var publicSsrTagsHolder = {
  pendingCallbacks: [],
  pendingMounts: [],
  scheduleRender() {
  },
  ssrTags: null
};
function createSsrTags(rootRecord) {
  return {
    html(strings, ...values) {
      const compiled = compileComponentTemplate(strings);
      if (!compiled) return html(strings, ...values);
      const lowered = lowerComponentTemplate(compiled, values, (entry) => createSsrComponentValue(rootRecord, entry, values));
      if (!lowered) return html(strings, ...values);
      return html(lowered.strings, ...lowered.values);
    },
    mathml,
    svg
  };
}
function createSsrComponentValue(rootRecord, descriptor, values) {
  return function renderComponentValue() {
    const componentType = (
      /** @type {PepperComponent} */
      values[descriptor.componentIndex]
    );
    const { props } = resolveComponentProps(descriptor.bindings, values);
    const childrenSource = descriptor.childrenSource;
    if (childrenSource != null) {
      props.children = () => renderSourceTemplate(
        /** @type {SsrTags} */
        rootRecord.ssrTags.html,
        childrenSource,
        values
      );
    }
    const runtime = createComponentRuntime(componentType, props, rootRecord, null);
    const renderable = renderComponentRuntime(
      runtime,
      /** @type {SsrTags} */
      rootRecord.ssrTags
    );
    const serialized = typeof renderable === "function" ? renderable() : renderable;
    finalizeComponentRuntime(runtime);
    return serialized;
  };
}
function html2(strings, ...values) {
  return (
    /** @type {SsrTags} */
    publicSsrTagsHolder.ssrTags.html(strings, ...values)
  );
}
function renderComponentToString(Component, props = {}) {
  const rootRecord = {
    pendingCallbacks: [],
    pendingMounts: [],
    scheduleRender() {
    },
    ssrTags: null
  };
  rootRecord.ssrTags = createSsrTags(rootRecord);
  const runtime = createComponentRuntime(Component, props, rootRecord, null);
  const renderable = renderComponentRuntime(
    runtime,
    /** @type {SsrTags} */
    rootRecord.ssrTags
  );
  const htmlString = renderToString(renderable);
  finalizeComponentRuntime(runtime);
  return htmlString;
}
function renderToString2(value) {
  return renderToString(value);
}
publicSsrTagsHolder.ssrTags = createSsrTags(publicSsrTagsHolder);
var svg2 = svg;
var mathml2 = mathml;
export {
  clearTemplateCache,
  component,
  force,
  html2 as html,
  mathml2 as mathml,
  rawText,
  ref,
  renderComponentToString,
  renderToString2 as renderToString,
  state,
  svg2 as svg,
  unsafeHTML,
  unsafeMathML,
  unsafeSVG
};
//# sourceMappingURL=ssr.js.map
