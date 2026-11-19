import {
  FORCE_SYMBOL,
  RAW_TEXT_SYMBOL,
  UNSAFE_HTML_SYMBOL,
  UNSAFE_MATHML_SYMBOL,
  UNSAFE_SVG_SYMBOL,
  captureBoundaryError,
  commentHolePattern,
  compileComponentTemplate,
  component,
  createChildIdPath,
  createComponentRuntime,
  createContextValues,
  finalizeComponentRuntime,
  getCurrentOwnerRuntime,
  isErrorBoundarySignal,
  lowerComponentValues,
  ref,
  renderComponentRuntime,
  resolveComponentProps,
  runWithOwnerRuntime,
  stableId,
  state,
  throwBoundaryError
} from "./chunks/chunk-CB5VZCVD.js";

// src/html-ssr.js
var TEMPLATE_RESULT_SYMBOL = /* @__PURE__ */ Symbol("template-result");
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
function serializeChildValue(value, rawContent = false) {
  value = unwrapForce(value);
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map((item) => serializeChildValue(item, rawContent)).join("");
  if (typeof value === "function") return serializeChildValue(value(), rawContent);
  if (looksTrustedTextValue(value)) {
    if (RAW_TEXT_SYMBOL in value) return rawContent ? value[RAW_TEXT_SYMBOL] || "" : escapeHtml(value[RAW_TEXT_SYMBOL] || "");
    return value[UNSAFE_HTML_SYMBOL] || value[UNSAFE_SVG_SYMBOL] || value[UNSAFE_MATHML_SYMBOL] || "";
  }
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
      compiled.ops.push({ type: "static", value: source.slice(cursor, end2).replace(commentHolePattern, " ") });
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
      if (tag.op.type === "start-tag" && !tag.op.selfClosing) {
        const name = tag.op.tagName.toLowerCase();
        if (name === "script" || name === "style" || name === "title" || name === "textarea") {
          const close = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, "ig");
          close.lastIndex = cursor;
          const end2 = close.exec(source)?.index ?? source.length;
          const parts2 = parseInterpolationParts(source.slice(cursor, end2));
          compiled.ops.push({ type: "text", parts: parts2, rawTag: name === "script" || name === "style" ? name : void 0 });
          cursor = end2;
        }
      }
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
    if (name.startsWith("!") && !value?.includes(INTERPOLATION_MARKER))
      throw new SyntaxError("Forced bindings require an interpolation.");
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
      let content = "";
      for (const part of op.parts) content += typeof part === "number" ? serializeChildValue(values[part], !!op.rawTag) : part;
      if (op.rawTag && op.parts.some((part) => typeof part === "number")) {
        const unsafe = op.rawTag === "script" ? /<!--|<\/script(?=[\t\n\f\r />])/i : /<\/style(?=[\t\n\f\r />])/i;
        if (unsafe.test(content)) throw new Error(`Cannot serialize dynamic <${op.rawTag}> content containing an HTML parser delimiter.`);
      }
      output += content;
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

// src/pepper-ssr.js
var publicSsrTagsHolder = {
  context: /* @__PURE__ */ new Map(),
  identifierPrefix: "",
  idPath: [],
  nextChildId: 0,
  scheduleRender() {
  },
  seenChildKeys: /* @__PURE__ */ new WeakMap(),
  ssrTags: null
};
function createSsrTags(rootRecord) {
  return {
    html(strings, ...values) {
      const compiled = compileComponentTemplate(strings);
      if (!compiled) return html(strings, ...values);
      const ownerRuntime = getCurrentOwnerRuntime();
      const loweredValues = lowerComponentValues(compiled, values, (entry, sourceValues) => createSsrComponentValue(rootRecord, ownerRuntime, entry, sourceValues));
      return html(compiled.strings, ...loweredValues);
    },
    mathml,
    svg
  };
}
function createSsrComponentValue(rootRecord, ownerRuntime, descriptor, values) {
  return function renderComponentValue() {
    const componentType = (
      /** @type {PepperComponent} */
      values[descriptor.componentIndex]
    );
    const { key, props } = resolveComponentProps(descriptor.bindings, values);
    const owner = ownerRuntime || rootRecord;
    if (key != null) {
      const pass = ownerRuntime?.renderPassId || 0;
      let seen = rootRecord.seenChildKeys.get(owner);
      if (!seen || seen.pass !== pass)
        rootRecord.seenChildKeys.set(owner, seen = { pass, sites: /* @__PURE__ */ new Map() });
      let keys = seen.sites.get(descriptor);
      if (!keys) seen.sites.set(descriptor, keys = /* @__PURE__ */ new Set());
      if (keys.has(key)) throw new Error(`Duplicate key at component site: ${String(key)}`);
      keys.add(key);
    }
    const childTemplate = descriptor.childrenTemplate;
    const idPath = createChildIdPath(owner);
    let runtime;
    if (childTemplate) {
      props.children = () => runWithOwnerRuntime(
        /** @type {ComponentRuntime} */
        runtime,
        () => (
          /** @type {SsrTags} */
          rootRecord.ssrTags.html(
            childTemplate.strings,
            ...childTemplate.indices.map((index) => values[index])
          )
        )
      );
    }
    try {
      runtime = createComponentRuntime(componentType, props, rootRecord, ownerRuntime, idPath);
    } catch (error) {
      if (!ownerRuntime) throw error;
      throwBoundaryError(ownerRuntime, error, true);
    }
    return unsafeHTML(renderRuntimeToString(
      runtime,
      /** @type {SsrTags} */
      rootRecord.ssrTags
    ));
  };
}
function renderRuntimeToString(runtime, tags) {
  let renderable = renderComponentRuntime(runtime, tags);
  let serialized;
  try {
    serialized = renderToString(renderable);
  } catch (error) {
    if (!isErrorBoundarySignal(error) || error.boundary !== runtime) throw error;
    captureBoundaryError(runtime, error.error);
    renderable = renderComponentRuntime(runtime, tags);
    serialized = renderToString(renderable);
  }
  finalizeComponentRuntime(runtime);
  return serialized;
}
function html2(strings, ...values) {
  return (
    /** @type {SsrTags} */
    publicSsrTagsHolder.ssrTags.html(strings, ...values)
  );
}
function renderComponentToString(Component, props = {}, options = {}) {
  const rootRecord = {
    context: createContextValues(options.context),
    identifierPrefix: options.identifierPrefix || "",
    idPath: [],
    nextChildId: 0,
    scheduleRender() {
    },
    seenChildKeys: /* @__PURE__ */ new WeakMap(),
    ssrTags: null
  };
  rootRecord.ssrTags = createSsrTags(rootRecord);
  const runtime = createComponentRuntime(Component, props, rootRecord, null);
  return renderRuntimeToString(
    runtime,
    /** @type {SsrTags} */
    rootRecord.ssrTags
  );
}
function renderToString2(value) {
  publicSsrTagsHolder.nextChildId = 0;
  publicSsrTagsHolder.seenChildKeys = /* @__PURE__ */ new WeakMap();
  return renderToString(value);
}
function portal() {
  return () => [];
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
  portal,
  rawText,
  ref,
  renderComponentToString,
  renderToString2 as renderToString,
  stableId,
  state,
  svg2 as svg,
  unsafeHTML,
  unsafeMathML,
  unsafeSVG
};
//# sourceMappingURL=ssr.js.map
