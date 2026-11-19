import {
  FORCE_SYMBOL,
  RAW_TEXT_SYMBOL,
  UNSAFE_HTML_SYMBOL,
  UNSAFE_MATHML_SYMBOL,
  UNSAFE_SVG_SYMBOL,
  __export,
  captureBoundaryError,
  compileComponentTemplate,
  component,
  createChildIdPath,
  createComponentRuntime,
  createContextValues,
  destroyComponentRuntime,
  finalizeComponentRuntime,
  flushEffects,
  getCurrentOwnerRuntime,
  getOrCreateChildStore,
  isErrorBoundarySignal,
  lowerComponentValues,
  ref,
  renderComponentRuntime,
  resolveComponentProps,
  runWithOwnerRuntime,
  stableId,
  state,
  syncComponentProps,
  throwBoundaryError
} from "./chunks/chunk-42WHAVSZ.js";

// src/html.js
var html_exports = {};
__export(html_exports, {
  componentBoundaries: () => componentBoundaries,
  force: () => force,
  html: () => html,
  mathml: () => mathml,
  rawText: () => rawText,
  reconcileDom: () => reconcileDom,
  replaceNodeOwnership: () => replaceNodeOwnership,
  svg: () => svg,
  unsafeHTML: () => unsafeHTML,
  unsafeMathML: () => unsafeMathML,
  unsafeSVG: () => unsafeSVG
});
function html(strings, ...values) {
  return handleTemplateTag("html", strings, ...values);
}
function svg(strings, ...values) {
  return handleTemplateTag("svg", strings, ...values);
}
function mathml(strings, ...values) {
  return handleTemplateTag("mathml", strings, ...values);
}
var TRUSTED_TEXT_INPUT_ERROR = "unsafeHTML(), unsafeSVG(), unsafeMathML(), and rawText() expect a string.";
var TRUSTED_TEXT_CONTEXT_ERROR = "unsafeHTML(), unsafeSVG(), unsafeMathML(), and rawText() are only allowed in text content interpolation.";
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
function isForceWrapped(value) {
  return typeof value === "object" && value !== null && FORCE_SYMBOL in value;
}
function unwrapForce(value) {
  if (isForceWrapped(value)) return (
    /** @type {any} */
    value[FORCE_SYMBOL]
  );
  return value;
}
function isTrustedTextValue(value) {
  return typeof value === "object" && value !== null && (UNSAFE_HTML_SYMBOL in value || UNSAFE_SVG_SYMBOL in value || UNSAFE_MATHML_SYMBOL in value || RAW_TEXT_SYMBOL in value);
}
function resolveTrustedTextValue(value) {
  if (RAW_TEXT_SYMBOL in value) return value[RAW_TEXT_SYMBOL] || "";
  if (!(UNSAFE_HTML_SYMBOL in value || UNSAFE_SVG_SYMBOL in value || UNSAFE_MATHML_SYMBOL in value)) return "";
  const template = document.createElement("template");
  let htmlString = value[UNSAFE_HTML_SYMBOL] || value[UNSAFE_SVG_SYMBOL] || value[UNSAFE_MATHML_SYMBOL] || "";
  const mode = UNSAFE_SVG_SYMBOL in value ? "svg" : UNSAFE_MATHML_SYMBOL in value ? "mathml" : "html";
  if (mode === "svg") htmlString = `<svg>${htmlString}</svg>`;
  else if (mode === "mathml") htmlString = `<math>${htmlString}</math>`;
  template.innerHTML = htmlString;
  if (mode === "svg" || mode === "mathml") {
    const wrapper = (
      /** @type {Element | null} */
      template.content.firstElementChild
    );
    if (wrapper) wrapper.replaceWith(...wrapper.childNodes);
  }
  return Array.from(template.content.childNodes);
}
function handleForceValue(site, value) {
  const isWrapped = isForceWrapped(value);
  if (site.requiresUnwrapping) {
    if (!isWrapped) {
      throw new Error(
        "Value must be wrapped with force() for this interpolation site. Once force() is used at a site, it must always be used."
      );
    }
    return unwrapForce(value);
  } else if (isWrapped) {
    site.skipEqualityCheck = true;
    site.requiresUnwrapping = true;
    return unwrapForce(value);
  }
  return value;
}
function handleTemplateTag(mode, strings, ...values) {
  const template = parseTemplate(strings, mode);
  const renderFn = function(key = /* @__PURE__ */ Symbol(), liveNodes) {
    return liveNodes ? template.hydrateInstance(
      key,
      /** @type {Element | ShadowRoot | DocumentFragment} */
      liveNodes[0]?.parentNode,
      liveNodes,
      values
    ) : template.updateInstance(key, values);
  };
  renderFn.template = template;
  return renderFn;
}
var templateCache = /* @__PURE__ */ new WeakMap();
var INTERPOLATION_MARKER = "\u29D9\u29D8";
var INTERPOLATION_REGEXP = new RegExp(`${INTERPOLATION_MARKER}(\\d+)${INTERPOLATION_MARKER}`);
var SPREAD_INTERPOLATION_REGEXP = new RegExp(`^\\.\\.\\.${INTERPOLATION_MARKER}(\\d+)${INTERPOLATION_MARKER}`);
var SPREAD_PLACEHOLDER_ATTR_PREFIX = `x-${INTERPOLATION_MARKER}spread-`;
var SPREAD_PLACEHOLDER_ATTR_REGEXP = new RegExp(`^${SPREAD_PLACEHOLDER_ATTR_PREFIX}(\\d+)${INTERPOLATION_MARKER}$`);
var START_TAG_REGEXP = /<[a-z][^\s/>]*(?:\s+[^\s/>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^>\s]+))?)*\s*\/?\s*>/gi;
var ATTRIBUTE_END_REGEXP = /[\s=/>]/;
function parseInterpolationParts(parts, isTopLevel = false) {
  let mapped = parts.map((part, i) => i % 2 === 1 ? parseInt(part) : part);
  if (isTopLevel) mapped = mapped.filter((part) => typeof part === "number" || part.trim() !== "");
  return mapped;
}
function joinPartsWithValues(parts, values) {
  return parts.map((part) => typeof part === "number" ? String(values[part] ?? "") : part).join("");
}
function splitTextNodesWithInterpolation(fragment) {
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT, null);
  let textNode = (
    /** @type {Text | null} */
    walker.nextNode()
  );
  while (textNode) {
    const nextNode = (
      /** @type {Text | null} */
      walker.nextNode()
    );
    const textContent = textNode.textContent || "";
    if (textContent.includes(INTERPOLATION_MARKER)) {
      const isTopLevel = textNode.parentNode === fragment;
      const parts = textContent.split(INTERPOLATION_REGEXP);
      const parsedParts = parseInterpolationParts(parts, isTopLevel);
      if (parsedParts.length > 1) {
        const newTextNodes = parsedParts.map(
          (part) => new Text(typeof part === "number" ? `${INTERPOLATION_MARKER}${part}${INTERPOLATION_MARKER}` : part)
        );
        textNode.replaceWith(...newTextNodes);
      }
    }
    textNode = nextNode;
  }
}
var Template = class {
  /** @type {WeakMap<TemplateKey, TemplateInstance>} */
  instances = /* @__PURE__ */ new WeakMap();
  el = document.createElement("template");
  caseMappings = /* @__PURE__ */ new Map();
  /**
   * @param {TemplateMode} mode
   * @param {TemplateStringsArray} strings
   */
  constructor(strings, mode) {
    let htmlString = strings.reduce(
      (acc, str, i) => acc + str + (i < strings.length - 1 ? `${INTERPOLATION_MARKER}${i}${INTERPOLATION_MARKER}` : ""),
      ""
    );
    if (mode === "svg") htmlString = `<svg>${htmlString}</svg>`;
    else if (mode === "mathml") htmlString = `<math>${htmlString}</math>`;
    const { caseMappings, el } = this;
    let counter = 0;
    htmlString = htmlString.replace(START_TAG_REGEXP, (tagMatch) => {
      const parts = [];
      let lastIndex = 0;
      let inQuotes = false;
      let quoteChar = "";
      let i = 0;
      while (i < tagMatch.length) {
        const char = tagMatch[i];
        if (!inQuotes && (char === '"' || char === "'")) {
          inQuotes = true;
          quoteChar = char;
        } else if (inQuotes && char === quoteChar) {
          inQuotes = false;
          quoteChar = "";
        } else if (!inQuotes && i > 0 && /\s/.test(tagMatch[i - 1])) {
          const spreadMatch = tagMatch.slice(i).match(SPREAD_INTERPOLATION_REGEXP);
          if (spreadMatch) {
            parts.push(tagMatch.slice(lastIndex, i));
            parts.push(`${SPREAD_PLACEHOLDER_ATTR_PREFIX}${spreadMatch[1]}${INTERPOLATION_MARKER}=""`);
            lastIndex = i + spreadMatch[0].length;
            i = lastIndex - 1;
            continue;
          }
          let prefix = null;
          if (char === "." || char === "@") {
            prefix = char;
          } else if (char === "!" && i + 1 < tagMatch.length) {
            const nextChar = tagMatch[i + 1];
            if (nextChar === ".") prefix = "!.";
            if (nextChar === "@") prefix = "!@";
            else if (nextChar === "?") prefix = null;
            else if (/[a-zA-Z]/.test(nextChar)) prefix = null;
          }
          if (prefix) {
            const startIndex = i;
            const attrStartIndex = startIndex + prefix.length;
            let attrEnd = attrStartIndex;
            while (attrEnd < tagMatch.length && !ATTRIBUTE_END_REGEXP.test(tagMatch[attrEnd])) attrEnd++;
            if (attrEnd > attrStartIndex) {
              const attrName = tagMatch.slice(attrStartIndex, attrEnd);
              let placeholder;
              placeholder = `${prefix}case-preserved${counter}`;
              const hasForce = prefix.startsWith("!");
              caseMappings.set(placeholder.slice(hasForce ? 2 : 1), attrName);
              counter++;
              parts.push(tagMatch.slice(lastIndex, startIndex));
              parts.push(placeholder);
              lastIndex = attrEnd;
              i = attrEnd - 1;
            }
          }
        }
        i++;
      }
      parts.push(tagMatch.slice(lastIndex));
      return parts.join("");
    });
    el.innerHTML = htmlString;
    if (mode === "svg" || mode === "mathml") {
      const wrapperElement = (
        /** @type {Element} */
        el.content.firstElementChild
      );
      wrapperElement.replaceWith(...wrapperElement.childNodes);
    }
    splitTextNodesWithInterpolation(el.content);
    for (const node of el.content.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      if (!(node.textContent || "").includes(INTERPOLATION_MARKER) && (node.textContent || "").trim() === "")
        node.remove();
    }
  }
  /**
   * @param {TemplateKey} key The key for the template instance
   * @returns {TemplateInstance}
   */
  getInstance(key) {
    let templateInstance = this.instances.get(key);
    if (!templateInstance) {
      const fragment = document.importNode(this.el.content, true);
      const sites = findInterpolationSites(fragment, this.caseMappings);
      const nodes = (
        /** @type {TemplateNodes} */
        Object.freeze(Array.from(fragment.childNodes))
      );
      templateInstance = new TemplateInstance(nodes, sites);
      this.instances.set(key, templateInstance);
    }
    return templateInstance;
  }
  /**
   * Update instance with new values. This gets returned by the `html`
   * function for users to call with their keys.
   *
   * @param {TemplateKey} key
   * @param {InterpolationValue[]} values
   */
  updateInstance(key = /* @__PURE__ */ Symbol(), values) {
    const templateInstance = this.getInstance(key);
    templateInstance.applyValues(values);
    const renderedNodes = templateInstance.getRenderedNodes();
    trackTemplateInstanceNodes(templateInstance, renderedNodes);
    return renderedNodes;
  }
  /**
   * Hydrate an existing DOM subtree into a template instance, reusing matching
   * nodes and replacing mismatches with the template-owned nodes.
   *
   * @param {TemplateKey} key
   * @param {Element | ShadowRoot | DocumentFragment} container
   * @param {Node[]} liveNodes
   * @param {InterpolationValue[]} values
   */
  hydrateInstance(key, container, liveNodes, values) {
    const templateInstance = this.getInstance(key);
    templateInstance.applyValues(values);
    const adoptionMap = /* @__PURE__ */ new Map();
    const managedCustomElements = /* @__PURE__ */ new WeakSet();
    for (const site of templateInstance.sites) {
      let parent = site.node.parentElement;
      while (parent) {
        if (parent.localName.includes("-")) {
          managedCustomElements.add(parent);
          break;
        }
        parent = parent.parentElement;
      }
    }
    reconcileHydrationNodes(
      container,
      liveNodes,
      /** @type {Node[]} */
      [...templateInstance.getRenderedNodes(true)],
      adoptionMap,
      managedCustomElements,
      liveNodes[liveNodes.length - 1]?.nextSibling || null
    );
    templateInstance.absorb(adoptionMap);
    const renderedNodes = templateInstance.getRenderedNodes();
    trackTemplateInstanceNodes(templateInstance, renderedNodes);
    return renderedNodes;
  }
};
function parseTemplate(strings, mode) {
  let template = templateCache.get(strings);
  if (!template) templateCache.set(strings, template = new Template(strings, mode));
  return template;
}
function findInterpolationSites(fragment, caseMappings) {
  const sites = [];
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
  let node;
  while (node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = (
        /** @type {Text} */
        node
      );
      const textContent = textNode.textContent || "";
      if (textContent.includes(INTERPOLATION_MARKER)) {
        const match = textContent.match(INTERPOLATION_REGEXP);
        if (match) {
          const interpolationIndex = parseInt(match[1]);
          textNode.textContent = "";
          sites.push({ node: textNode, type: (
            /** @type {'text'} */
            "text"
          ), interpolationIndex });
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = (
        /** @type {Element} */
        node
      );
      const elementState = {};
      const attributesToRemove = [];
      for (const attr of element.attributes) {
        const name = attr.name;
        const value = attr.value;
        const spreadMatch = name.match(SPREAD_PLACEHOLDER_ATTR_REGEXP);
        if (spreadMatch) {
          sites.push({
            node: element,
            type: (
              /** @type {'spread'} */
              "spread"
            ),
            interpolationIndex: parseInt(spreadMatch[1]),
            elementState
          });
          attributesToRemove.push(name);
          continue;
        }
        if (name === "ref" && value.includes(INTERPOLATION_MARKER)) {
          sites.push({
            node: element,
            type: (
              /** @type {'property'} */
              "property"
            ),
            attributeName: "__pepperRef",
            parts: parseInterpolationParts(value.split(INTERPOLATION_REGEXP), false),
            elementState
          });
          attributesToRemove.push(name);
          continue;
        }
        if (value.includes(INTERPOLATION_MARKER) || name.startsWith("?") || name.startsWith(".") || name.startsWith("@") || name.startsWith("!")) {
          const isStatic = !value.includes(INTERPOLATION_MARKER);
          let parsedParts;
          if (isStatic) parsedParts = [value];
          else parsedParts = parseInterpolationParts(value.split(INTERPOLATION_REGEXP), false);
          let type = "attribute";
          let processedName = "";
          let skipEqualityCheck = name.startsWith("!");
          if (name.startsWith("?") || name.startsWith("!?")) {
            type = "boolean-attribute";
            processedName = name.slice(skipEqualityCheck ? 2 : 1);
          } else if (name.startsWith(".") || name.startsWith("!.")) {
            type = "property";
            const placeholder = name.slice(skipEqualityCheck ? 2 : 1);
            processedName = caseMappings.get(placeholder) || placeholder;
          } else if (name.startsWith("@") || name.startsWith("!@")) {
            type = "event";
            const placeholder = name.slice(skipEqualityCheck ? 2 : 1);
            processedName = caseMappings.get(placeholder) || placeholder;
          } else {
            type = "attribute";
            processedName = skipEqualityCheck ? name.slice(1) : name;
            if (isStatic && skipEqualityCheck) element.setAttribute(processedName, value);
          }
          const site = {
            node: element,
            type,
            attributeName: processedName,
            parts: parsedParts,
            skipEqualityCheck,
            elementState
          };
          sites.push(site);
          attributesToRemove.push(name);
        } else {
          sites.push({ node: element, type: "attribute", attributeName: name, parts: [value], elementState });
        }
      }
      for (const name of attributesToRemove) element.removeAttribute(name);
    }
  }
  return sites;
}
function arrayEquals(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0, l = a.length; i < l; i++) if (a[i] !== b[i]) return false;
  return true;
}
var siteIndexKeys = /* @__PURE__ */ new WeakMap();
var nodeTemplateInstances = /* @__PURE__ */ new WeakMap();
var nodeHostSites = /* @__PURE__ */ new WeakMap();
var componentBoundaries = /* @__PURE__ */ new WeakSet();
var siteTemplateInstances = /* @__PURE__ */ new WeakMap();
function getStableNestedKey(site, index) {
  let indexKeys = siteIndexKeys.get(site);
  if (!indexKeys) siteIndexKeys.set(site, indexKeys = []);
  let key = indexKeys[index];
  if (!key) indexKeys[index] = key = /* @__PURE__ */ Symbol("nested-template-key" + index);
  return key;
}
function trackTemplateInstanceNodes(templateInstance, nodes) {
  for (const node of nodes) nodeTemplateInstances.set(node, templateInstance);
}
function replaceNodeOwnership(boundary, previousNodes, nextNodes) {
  const site = nodeHostSites.get(boundary);
  const siteNodes = site?.insertedNodes;
  if (!siteNodes) return false;
  const boundaryIndex = siteNodes.indexOf(boundary);
  const startIndex = boundaryIndex - previousNodes.length + 1;
  if (startIndex < 0) return false;
  const updatedSiteNodes = [...siteNodes];
  updatedSiteNodes.splice(startIndex, previousNodes.length, ...nextNodes);
  site.insertedNodes = updatedSiteNodes;
  for (const node of nextNodes) if (componentBoundaries.has(node)) nodeHostSites.set(node, site);
  return true;
}
function getBindingKey(type, name) {
  if (type === "boolean-attribute") return `?${name}`;
  if (type === "property") return `.${name}`;
  if (type === "event") return `@${name}`;
  return name;
}
function updateEventHandler(element, eventName, state2, inputValue) {
  let eventListener;
  if (typeof inputValue === "function") eventListener = /** @type {EventListener} */
  inputValue;
  else if (typeof inputValue === "string") eventListener = /** @type {EventListener} */
  new Function("event", inputValue);
  else eventListener = null;
  if (eventListener) {
    if (!state2.internalHandler) {
      state2.internalHandler = /** @type {EventListener} */
      ((event) => state2.currentEventListener?.(event));
      element.addEventListener(eventName, state2.internalHandler);
    }
    state2.currentEventListener = eventListener;
    return true;
  }
  if (state2.internalHandler) {
    element.removeEventListener(eventName, state2.internalHandler);
    state2.internalHandler = void 0;
    state2.currentEventListener = void 0;
  }
  return false;
}
var ATTRIBUTE_SITE_ERROR = "Nested templates and DOM elements are not allowed in attributes. Use text content interpolation instead.";
function resolveSiteValue(site, values) {
  const parts = site.parts || [];
  if (parts.length === 3 && parts[0] === "" && parts[2] === "" && typeof parts[1] === "number")
    return handleForceValue(site, values[parts[1]]);
  const processedValues = [...values];
  for (const part of parts) if (typeof part === "number") processedValues[part] = handleForceValue(site, values[part]);
  return joinPartsWithValues(parts, processedValues);
}
function reconcileDom(parentNode, oldNodes, newNodes, endBoundaryNode = null) {
  let oldStart = 0;
  let oldEnd = oldNodes.length;
  let newStart = 0;
  let newEnd = newNodes.length;
  const startBoundaryNode = oldNodes.length ? oldNodes[0].previousSibling : endBoundaryNode?.previousSibling || null;
  while (oldStart < oldEnd || newStart < newEnd) {
    if (oldEnd === oldStart) {
      const retainedNode = newNodes[newEnd];
      const insertBefore = retainedNode?.parentNode === parentNode ? retainedNode : endBoundaryNode;
      while (newStart < newEnd) {
        const node = newNodes[newStart++];
        if ("moveBefore" in parentNode && node.parentNode === parentNode)
          parentNode.moveBefore(node, insertBefore);
        else parentNode.insertBefore(node, insertBefore);
      }
    } else if (newEnd === newStart) {
      while (oldStart < oldEnd) oldNodes[oldStart++].remove();
    } else if (oldNodes[oldStart] === newNodes[newStart]) {
      oldStart++;
      newStart++;
    } else if (oldNodes[oldEnd - 1] === newNodes[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    } else if (oldStart < oldEnd - 1 && newStart < newEnd - 1 && oldNodes[oldStart] === newNodes[newEnd - 1] && oldNodes[oldEnd - 1] === newNodes[newStart]) {
      newStart++;
      newEnd--;
      const oldStartNode = oldNodes[oldStart++];
      const oldEndNode = oldNodes[--oldEnd];
      const startInsertBefore = oldStartNode.nextSibling;
      const safeInsertBefore = startInsertBefore?.parentNode === parentNode ? startInsertBefore : endBoundaryNode;
      if ("moveBefore" in parentNode && oldStartNode.parentNode === parentNode)
        parentNode.moveBefore(
          oldStartNode,
          oldEndNode.nextSibling
        );
      else parentNode.insertBefore(oldStartNode, oldEndNode.nextSibling);
      if (startInsertBefore !== oldEndNode && oldEndNode.parentNode === parentNode) {
        if ("moveBefore" in parentNode && oldEndNode.parentNode === parentNode)
          parentNode.moveBefore(oldEndNode, safeInsertBefore);
        else parentNode.insertBefore(oldEndNode, safeInsertBefore);
      }
    } else {
      const lastSettledNode = newNodes[newStart - 1] || null;
      const retainedNode = newNodes[newEnd];
      const endBoundary = retainedNode?.parentNode === parentNode ? retainedNode : endBoundaryNode;
      const firstPendingNode = newNodes[newStart] || endBoundary;
      while (newStart < newEnd) {
        const node2 = newNodes[newStart++];
        if ("moveBefore" in parentNode && node2.parentNode === parentNode)
          parentNode.moveBefore(node2, endBoundary);
        else parentNode.insertBefore(node2, endBoundary);
      }
      let node = lastSettledNode ? lastSettledNode.nextSibling : startBoundaryNode ? startBoundaryNode.nextSibling : parentNode.firstChild;
      while (node && node !== firstPendingNode) {
        const nextSibling = node.nextSibling;
        const removableNode = (
          /** @type {ChildNode} */
          node
        );
        removableNode.remove();
        node = nextSibling;
      }
      break;
    }
  }
  return newNodes;
}
function interpolateTextSite(site, value) {
  let unwrappedValue = handleForceValue(site, value);
  if (isTrustedTextValue(unwrappedValue)) unwrappedValue = resolveTrustedTextValue(unwrappedValue);
  if (!site.skipEqualityCheck && site.lastValue === unwrappedValue) return;
  site.lastValue = unwrappedValue;
  if (!(unwrappedValue instanceof Node) && !Array.isArray(unwrappedValue) && typeof unwrappedValue !== "function") {
    if (site.insertedNodes) for (const node of site.insertedNodes) node.remove();
    site.node.textContent = typeof unwrappedValue === "boolean" ? "" : String(unwrappedValue ?? "");
    site.insertedNodes = void 0;
    for (const templateInstance of site.nestedTemplateInstances || []) templateInstance.deactivate();
    site.nestedTemplateInstances = void 0;
  } else {
    const itemsToProcess = Array.isArray(unwrappedValue) ? unwrappedValue : [unwrappedValue];
    const nestedTemplateInstances = [];
    const nodes = (
      /** @type {(Element | Text)[]} */
      itemsToProcess.flatMap((item, index) => {
        if (typeof item === "function") {
          const view = (
            /** @type {typeof item & {template?: Template}} */
            item
          );
          const stableKey = getStableNestedKey(site, index);
          item = item(stableKey);
          const templateInstance = view.template?.getInstance(stableKey);
          if (templateInstance) {
            nestedTemplateInstances.push(templateInstance);
            item = templateInstance.getRenderedNodes(true);
          }
        }
        if (isTrustedTextValue(item)) item = resolveTrustedTextValue(item);
        if (Array.isArray(item)) return item.flat(1);
        return [item];
      }).flatMap((item) => {
        if (isTrustedTextValue(item)) item = resolveTrustedTextValue(item);
        if (Array.isArray(item)) return item.flat(Infinity);
        if (item instanceof Node) return (
          /** @type {Element | Text} */
          item
        );
        if (item != null && item !== "" && typeof item !== "boolean") return [new Text(String(item))];
        return [];
      })
    );
    if (!site.skipEqualityCheck && site.insertedNodes && arrayEquals(site.insertedNodes, nodes)) return;
    const parentNode = site.node.parentNode;
    if (!parentNode) {
      site.node.textContent = "";
      site.insertedNodes = nodes.length ? [...nodes] : void 0;
      return;
    }
    const reconciledNodes = (
      /** @type {(Element | Text)[]} */
      reconcileDom(
        /** @type {Element | DocumentFragment | Document} */
        parentNode,
        site.insertedNodes || [],
        nodes,
        site.node
      )
    );
    site.node.textContent = "";
    site.insertedNodes = reconciledNodes.length ? reconciledNodes : void 0;
    for (const node of reconciledNodes) if (componentBoundaries.has(node)) nodeHostSites.set(node, site);
    const previousTemplateInstances = site.nestedTemplateInstances || [];
    for (const templateInstance of previousTemplateInstances)
      if (!nestedTemplateInstances.includes(templateInstance)) templateInstance.deactivate();
    if (siteTemplateInstances.get(site)?.active) {
      for (const templateInstance of nestedTemplateInstances)
        if (!previousTemplateInstances.includes(templateInstance)) templateInstance.activate();
    }
    site.nestedTemplateInstances = nestedTemplateInstances.length ? nestedTemplateInstances : void 0;
  }
}
function adoptSubtree(adoptionMap, root) {
  const nodes = [root];
  while (nodes.length) {
    const node = (
      /** @type {Node} */
      nodes.pop()
    );
    adoptionMap.set(node, node);
    for (let child = node.lastChild; child; child = child.previousSibling) nodes.push(child);
  }
}
function canHydrateNode(liveNode, targetNode) {
  if (liveNode.nodeType !== targetNode.nodeType) return false;
  if (liveNode.nodeType === Node.COMMENT_NODE) return liveNode.nodeValue === targetNode.nodeValue;
  if (liveNode.nodeType === Node.TEXT_NODE || liveNode.nodeType === Node.CDATA_SECTION_NODE) return true;
  if (liveNode.nodeType !== Node.ELEMENT_NODE) return liveNode.isEqualNode(targetNode);
  const liveElement = (
    /** @type {Element} */
    liveNode
  );
  const targetElement = (
    /** @type {Element} */
    targetNode
  );
  if (liveElement.namespaceURI !== targetElement.namespaceURI || liveElement.tagName !== targetElement.tagName || liveElement.attributes.length !== targetElement.attributes.length)
    return false;
  for (const attr of targetElement.attributes) if (liveElement.getAttribute(attr.name) !== attr.value) return false;
  return true;
}
function reconcileHydrationNodes(parentNode, liveNodes, targetNodes, adoptionMap, managedCustomElements, nextSibling = null) {
  let liveIndex = 0;
  let targetIndex = 0;
  while (liveIndex < liveNodes.length || targetIndex < targetNodes.length) {
    const liveNode = liveNodes[liveIndex];
    const targetNode = targetNodes[targetIndex];
    if (!liveNode && targetNode) {
      parentNode.insertBefore(targetNode, nextSibling);
      adoptSubtree(adoptionMap, targetNode);
      targetIndex++;
      continue;
    }
    if (liveNode && !targetNode) {
      const removableNode = (
        /** @type {ChildNode} */
        liveNode
      );
      removableNode.remove();
      liveIndex++;
      continue;
    }
    if (liveNode.nodeType === Node.TEXT_NODE && liveNode.nodeValue?.trim() === "" && targetNode.nodeType !== Node.TEXT_NODE && !(parentNode instanceof Element && parentNode.tagName === "PRE")) {
      const removableNode = (
        /** @type {ChildNode} */
        liveNode
      );
      removableNode.remove();
      liveIndex++;
      continue;
    }
    if (targetNode.nodeType === Node.TEXT_NODE && targetNode.nodeValue?.trim() === "" && liveNode.nodeType !== Node.TEXT_NODE && !(parentNode instanceof Element && parentNode.tagName === "PRE")) {
      parentNode.insertBefore(targetNode, liveNode);
      adoptSubtree(adoptionMap, targetNode);
      targetIndex++;
      continue;
    }
    if (!canHydrateNode(liveNode, targetNode)) {
      parentNode.replaceChild(targetNode, liveNode);
      adoptSubtree(adoptionMap, targetNode);
      liveIndex++;
      targetIndex++;
      continue;
    }
    adoptionMap.set(targetNode, liveNode);
    if (liveNode.nodeType === Node.TEXT_NODE || liveNode.nodeType === Node.CDATA_SECTION_NODE) {
      if (liveNode.nodeValue !== targetNode.nodeValue) liveNode.nodeValue = targetNode.nodeValue;
    } else if (liveNode.nodeType === Node.ELEMENT_NODE) {
      const liveElement = (
        /** @type {Element} */
        liveNode
      );
      const targetElement = (
        /** @type {Element} */
        targetNode
      );
      let hydrateChildren = !liveElement.localName.includes("-") || managedCustomElements.has(targetElement);
      if (!hydrateChildren) {
        for (const child of targetElement.childNodes)
          if (child.nodeType !== Node.TEXT_NODE || child.nodeValue?.trim()) {
            hydrateChildren = true;
            break;
          }
      }
      if (hydrateChildren)
        reconcileHydrationNodes(
          liveElement,
          Array.from(liveElement.childNodes),
          Array.from(targetElement.childNodes),
          adoptionMap,
          managedCustomElements,
          null
        );
    }
    liveIndex++;
    targetIndex++;
  }
}
var TemplateInstance = class {
  /**
   * @param {TemplateNodes} nodes The cloned nodes for this template instance
   * @param {InterpolationSite[]} sites The interpolation sites in the template
   */
  constructor(nodes, sites) {
    this.active = false;
    this.nodes = nodes;
    this.sites = sites;
    for (const site of sites) siteTemplateInstances.set(site, this);
  }
  /** @param {boolean} active */
  updateRefs(active) {
    const handledElements = /* @__PURE__ */ new WeakSet();
    for (const site of this.sites) {
      const elementState = site.elementState;
      const element = (
        /** @type {Element} */
        site.node
      );
      if (!elementState || handledElements.has(element)) continue;
      handledElements.add(element);
      for (const binding of elementState.lastBindings?.values() || []) {
        const ref2 = binding.type === "property" && binding.attributeName === "__pepperRef" ? binding.value : null;
        if (!ref2 || typeof ref2 !== "object" || !("current" in ref2)) continue;
        if (active) ref2.current = element;
        else if (ref2.current === element) ref2.current = null;
      }
    }
  }
  activate() {
    if (this.active) return;
    this.active = true;
    this.updateRefs(true);
    for (const site of this.sites)
      for (const templateInstance of site.nestedTemplateInstances || []) templateInstance.activate();
  }
  deactivate() {
    if (!this.active) return;
    this.active = false;
    for (const site of this.sites)
      for (const templateInstance of site.nestedTemplateInstances || []) templateInstance.deactivate();
    this.updateRefs(false);
  }
  /**
   * Absorb live nodes mapped for adoption into this template instance.
   *
   * @param {Map<Node, Node>} adoptionMap
   */
  absorb(adoptionMap) {
    this.nodes = /** @type {TemplateNodes} */
    Object.freeze(this.nodes.map((node) => (
      /** @type {Element | Text} */
      adoptionMap.get(node) || node
    )));
    const nestedAdoptionMaps = /* @__PURE__ */ new Map();
    const reboundElementStates = /* @__PURE__ */ new WeakSet();
    for (const site of this.sites) {
      const previousNode = site.node;
      const node = (
        /** @type {Element | Text} */
        adoptionMap.get(site.node) || site.node
      );
      site.node = node;
      if (site.insertedNodes)
        site.insertedNodes = site.insertedNodes.map(
          (node2) => (
            /** @type {Element | Text} */
            adoptionMap.get(node2) || node2
          )
        );
      const elementState = site.elementState;
      if (!elementState || node === previousNode || reboundElementStates.has(elementState)) continue;
      for (const [eventName, eventState] of elementState.eventBindings || []) {
        if (eventState.internalHandler) previousNode.removeEventListener(eventName, eventState.internalHandler);
        eventState.internalHandler = void 0;
        if (eventState.currentEventListener)
          updateEventHandler(
            /** @type {Element} */
            node,
            eventName,
            eventState,
            eventState.currentEventListener
          );
      }
      if (
        /** @type {Element} */
        node.localName.includes("-")
      ) {
        for (const binding of elementState.lastBindings?.values() || [])
          if (binding.type === "property") node[binding.attributeName] = binding.value;
      }
      for (const binding of elementState.lastBindings?.values() || []) {
        if (binding.type === "property" && binding.attributeName === "__pepperRef" && binding.value && typeof binding.value === "object" && "current" in binding.value) {
          if (this.active) binding.value.current = /** @type {Element} */
          node;
        }
      }
      reboundElementStates.add(elementState);
    }
    for (const [templateNode, liveNode] of adoptionMap) {
      const templateInstance = nodeTemplateInstances.get(templateNode);
      if (!templateInstance || templateInstance === this) continue;
      let nestedAdoptionMap = nestedAdoptionMaps.get(templateInstance);
      if (!nestedAdoptionMap) nestedAdoptionMaps.set(templateInstance, nestedAdoptionMap = /* @__PURE__ */ new Map());
      nestedAdoptionMap.set(templateNode, liveNode);
    }
    for (const [templateInstance, nestedAdoptionMap] of nestedAdoptionMaps) templateInstance.absorb(nestedAdoptionMap);
    for (const site of this.sites)
      for (const node of site.insertedNodes || [])
        if (componentBoundaries.has(node)) nodeHostSites.set(node, site);
    trackTemplateInstanceNodes(this, this.getRenderedNodes());
  }
  /**
   * Apply values to interpolation sites
   * @param {InterpolationValue[]} values
   */
  applyValues(values) {
    const sites = this.sites;
    let currentElement = null;
    let currentElementState = null;
    let currentBindings = null;
    const flushElementBindings = () => {
      if (!currentElement || !currentElementState || !currentBindings) return;
      const element = (
        /** @type {Element} */
        currentElement
      );
      const anyElement = (
        /** @type {any} */
        element
      );
      const lastBindings = currentElementState.lastBindings || /* @__PURE__ */ new Map();
      const eventBindings = currentElementState.eventBindings || /* @__PURE__ */ new Map();
      for (const [key, binding] of lastBindings) {
        if (currentBindings.has(key)) continue;
        if (binding.type === "event") {
          const eventState = eventBindings.get(binding.attributeName);
          if (eventState) {
            if (eventState.internalHandler)
              element.removeEventListener(binding.attributeName, eventState.internalHandler);
            eventBindings.delete(binding.attributeName);
          }
        } else if (binding.type === "property") {
          if (binding.attributeName === "__pepperRef") {
            if (this.active && binding.value && typeof binding.value === "object" && "current" in binding.value && binding.value.current === element)
              binding.value.current = null;
          } else {
            anyElement[binding.attributeName] = void 0;
          }
        } else element.removeAttribute(binding.attributeName);
      }
      for (const [key, binding] of currentBindings) {
        const previous = lastBindings.get(key);
        if (!binding.force && previous && previous.type === binding.type && previous.attributeName === binding.attributeName && previous.value === binding.value)
          continue;
        if (binding.type === "event") {
          let eventState = eventBindings.get(binding.attributeName);
          if (!eventState) eventBindings.set(binding.attributeName, eventState = {});
          updateEventHandler(element, binding.attributeName, eventState, binding.value);
        } else if (binding.type === "property") {
          if (binding.attributeName === "__pepperRef") {
            if (this.active && previous?.value && previous.value !== binding.value && typeof previous.value === "object" && "current" in previous.value && previous.value.current === element)
              previous.value.current = null;
            if (this.active && binding.value && typeof binding.value === "object" && "current" in binding.value) binding.value.current = element;
          } else {
            anyElement[binding.attributeName] = binding.value;
          }
        } else if (binding.type === "boolean-attribute") {
          if (binding.value) element.setAttribute(binding.attributeName, "");
          else element.removeAttribute(binding.attributeName);
        } else {
          element.setAttribute(
            binding.attributeName,
            /** @type {string} */
            binding.value
          );
        }
      }
      currentElementState.lastBindings = currentBindings;
      currentElementState.eventBindings = eventBindings.size ? eventBindings : void 0;
      currentElement = null;
      currentElementState = currentBindings = null;
    };
    for (const site of sites) {
      if (site.type === "text") {
        flushElementBindings();
        const value = values[
          /** @type {number} */
          site.interpolationIndex
        ];
        interpolateTextSite(site, value);
        continue;
      }
      const element = (
        /** @type {Element} */
        site.node
      );
      if (element !== currentElement) {
        flushElementBindings();
        currentElement = element;
        currentElementState = site.elementState || {};
        currentBindings = /* @__PURE__ */ new Map();
      }
      const parts = site.parts || [];
      if (site.type === "spread") {
        const spreadValue = handleForceValue(site, values[
          /** @type {number} */
          site.interpolationIndex
        ]);
        if (spreadValue == null || spreadValue === false || typeof spreadValue !== "object" || Array.isArray(spreadValue) || spreadValue instanceof Node)
          continue;
        for (const [name, inputValue2] of Object.entries(spreadValue)) {
          let type = "attribute";
          let attributeName = name;
          let bindingValue = inputValue2;
          if (name.startsWith("?")) {
            type = "boolean-attribute";
            attributeName = name.slice(1);
            bindingValue = !!inputValue2;
          } else if (name === "ref") {
            type = "property";
            attributeName = "__pepperRef";
          } else if (name.startsWith(".")) {
            type = "property";
            attributeName = name.slice(1);
          } else if (name.startsWith("@")) {
            type = "event";
            attributeName = name.slice(1);
            if (inputValue2 == null || inputValue2 === "" || inputValue2 === false) {
              if (!currentBindings) continue;
              currentBindings.delete(getBindingKey(type, attributeName));
              continue;
            }
          } else {
            if (isTrustedTextValue(inputValue2)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR);
            if (inputValue2 instanceof Node || Array.isArray(inputValue2) || typeof inputValue2 === "function")
              throw new Error(ATTRIBUTE_SITE_ERROR);
            bindingValue = String(inputValue2 ?? "");
          }
          if (!currentBindings) continue;
          currentBindings.set(getBindingKey(type, attributeName), {
            type,
            attributeName,
            value: bindingValue,
            force: site.skipEqualityCheck
          });
        }
        continue;
      }
      if (site.type === "attribute") {
        const attributeValues = parts.filter((part) => typeof part === "number").map((part) => {
          const value = values[part];
          if (isForceWrapped(value)) {
            if (!site.requiresUnwrapping) {
              site.skipEqualityCheck = true;
              site.requiresUnwrapping = true;
            }
            return unwrapForce(value);
          } else if (site.requiresUnwrapping) {
            throw new Error(
              "Value must be wrapped with force() for this interpolation site. Once force() is used at a site, it must always be used."
            );
          }
          return value;
        });
        if (attributeValues.some(isTrustedTextValue)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR);
        if (attributeValues.some((value) => value instanceof Node || Array.isArray(value) || typeof value === "function"))
          throw new Error(ATTRIBUTE_SITE_ERROR);
        const processedValues = [...values];
        let attributeValueIndex = 0;
        for (const part of parts)
          if (typeof part === "number") processedValues[part] = attributeValues[attributeValueIndex++];
        if (!currentBindings) continue;
        currentBindings.set(getBindingKey(site.type, site.attributeName || ""), {
          type: site.type,
          attributeName: site.attributeName || "",
          value: joinPartsWithValues(parts, processedValues),
          force: site.skipEqualityCheck
        });
        continue;
      }
      if (site.type === "boolean-attribute") {
        let setAttribute = false;
        if (parts.length === 3 && parts[0] === "" && parts[2] === "" && typeof parts[1] === "number") {
          const value = handleForceValue(site, values[parts[1]]);
          if (isTrustedTextValue(value)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR);
          setAttribute = !!value;
        } else if (parts.length === 1 && typeof parts[0] === "string") setAttribute = parts[0].trim() !== "";
        else setAttribute = true;
        if (!currentBindings) continue;
        currentBindings.set(getBindingKey(site.type, site.attributeName || ""), {
          type: site.type,
          attributeName: site.attributeName || "",
          value: setAttribute,
          force: site.skipEqualityCheck
        });
        continue;
      }
      if (site.type === "property") {
        const value = resolveSiteValue(site, values);
        if (isTrustedTextValue(value)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR);
        if (site.attributeName === "__pepperRef" && (!value || typeof value !== "object" || !("current" in value))) {
          throw new TypeError("Pepper ref bindings expect ref() objects, e.g. ref=${buttonRef}.");
        }
        if (!currentBindings) continue;
        currentBindings.set(getBindingKey(site.type, site.attributeName || ""), {
          type: site.type,
          attributeName: site.attributeName || "",
          value,
          force: site.skipEqualityCheck
        });
        continue;
      }
      const eventName = site.attributeName || "";
      let inputValue = resolveSiteValue(site, values);
      if (isTrustedTextValue(inputValue)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR);
      if (typeof inputValue === "string" && inputValue.trim() === "") inputValue = null;
      const bindingKey = getBindingKey(site.type, eventName);
      if (inputValue == null || inputValue === "" || inputValue === false) {
        if (!currentBindings) continue;
        currentBindings.delete(bindingKey);
        continue;
      }
      if (!currentBindings) continue;
      currentBindings.set(bindingKey, {
        type: site.type,
        attributeName: eventName,
        value: inputValue,
        force: site.skipEqualityCheck
      });
    }
    flushElementBindings();
  }
  /** @param {boolean} [includeInterpolationAnchors=false] */
  getRenderedNodes(includeInterpolationAnchors = false) {
    return (
      /** @type {TemplateNodes} */
      Object.freeze(
        this.nodes.flatMap((node) => {
          for (const site of this.sites) {
            if (site.type !== "text" || site.node !== node || !site.insertedNodes?.length) continue;
            return includeInterpolationAnchors ? [...site.insertedNodes, node] : site.insertedNodes;
          }
          return [node];
        })
      )
    );
  }
};

// src/index.js
var { componentBoundaries: componentBoundaries2, reconcileDom: reconcileDom2, replaceNodeOwnership: replaceNodeOwnership2 } = (
  /** @type {{
  * componentBoundaries: WeakSet<Node>,
  * reconcileDom(parentNode: Element | DocumentFragment | Document, oldNodes: Node[], newNodes: Node[], endBoundaryNode?: Node | null): Node[],
  * replaceNodeOwnership(boundary: Node, previousNodes: Node[], nextNodes: Node[]): boolean,
  * }} */
  /** @type {unknown} */
  html_exports
);
var rootMap = /* @__PURE__ */ new WeakMap();
var singleValueStrings = (
  /** @type {TemplateStringsArray} */
  Object.assign(
    /** @type {MutableTemplateStringsArray} */
    ["", ""],
    { raw: ["", ""] }
  )
);
function realizeDomRenderable(renderable, runtime, liveNodes = null) {
  const view = (
    /** @type {((key?: symbol, liveNodes?: ChildNode[]) => Node[]) & {template?: {getInstance(key: symbol): {activate(): void, deactivate(): void, getRenderedNodes(includeInterpolationAnchors?: boolean): Node[]}}}} */
    typeof renderable === "function" ? renderable : (
      /** @type {DomTags} */
      runtime.rootRecord.domTags.html(singleValueStrings, renderable)
    )
  );
  const renderedNodes = liveNodes ? view(runtime.viewKey, liveNodes) : view(runtime.viewKey);
  const templateInstance = view.template?.getInstance(runtime.viewKey) || null;
  const ownedNodes = runtime.domBoundary && templateInstance ? templateInstance.getRenderedNodes(true) : renderedNodes;
  const nodes = runtime.domBoundary ? [...ownedNodes, runtime.domBoundary] : ownedNodes;
  if (runtime.currentTemplateInstance !== templateInstance) {
    runtime.currentTemplateInstance?.deactivate();
    templateInstance?.activate();
    runtime.currentTemplateInstance = templateInstance;
  }
  runtime.currentNodes = nodes;
  return nodes;
}
function realizeComponentRuntime(renderable, runtime, liveNodes = null) {
  try {
    return realizeDomRenderable(renderable, runtime, liveNodes);
  } catch (error) {
    if (isErrorBoundarySignal(error)) throw error;
    throwBoundaryError(runtime, error);
  }
}
function commitRuntimeNodes(runtime, previousNodes, nextNodes) {
  const boundary = runtime.domBoundary;
  if (!boundary?.parentNode || previousNodes.at(-1) !== boundary || nextNodes.at(-1) !== boundary) return;
  reconcileDom2(
    /** @type {Element | DocumentFragment | Document} */
    boundary.parentNode,
    previousNodes.slice(0, -1),
    nextNodes.slice(0, -1),
    boundary
  );
  let ownerRuntime = runtime;
  let previousOwnedNodes = previousNodes;
  let nextOwnedNodes = nextNodes;
  while (ownerRuntime.parentRuntime) {
    if (replaceNodeOwnership2(
      /** @type {Text} */
      ownerRuntime.domBoundary,
      previousOwnedNodes,
      nextOwnedNodes
    )) break;
    const ownerNodes = ownerRuntime.parentRuntime.currentNodes;
    const boundaryIndex = ownerNodes?.indexOf(
      /** @type {Text} */
      ownerRuntime.domBoundary
    ) ?? -1;
    const startIndex = boundaryIndex - previousOwnedNodes.length + 1;
    if (!ownerNodes || startIndex < 0) break;
    const updatedOwnerNodes = [...ownerNodes];
    updatedOwnerNodes.splice(startIndex, previousOwnedNodes.length, ...nextOwnedNodes);
    const parentRuntime = ownerRuntime.parentRuntime;
    previousOwnedNodes = /** @type {Node[]} */
    parentRuntime.currentNodes;
    parentRuntime.currentNodes = updatedOwnerNodes;
    nextOwnedNodes = updatedOwnerNodes;
    ownerRuntime = parentRuntime;
  }
}
function createDomTags() {
  return {
    html(strings, ...values) {
      const compiled = compileComponentTemplate(strings);
      if (!compiled) return html(strings, ...values);
      const ownerRuntime = getCurrentOwnerRuntime();
      if (!ownerRuntime) {
        throw new Error("Pepper component tags can only be used while rendering a Pepper component.");
      }
      const loweredValues = lowerComponentValues(compiled, values, (entry, sourceValues) => createDomComponentValue(ownerRuntime, entry, sourceValues));
      return html(compiled.strings, ...loweredValues);
    },
    mathml,
    svg
  };
}
var domTags = createDomTags();
function createDomComponentValue(ownerRuntime, descriptor, values) {
  return function renderComponentValue(instanceKey = /* @__PURE__ */ Symbol()) {
    const store = getOrCreateChildStore(ownerRuntime, descriptor);
    const componentType = (
      /** @type {PepperComponent} */
      values[descriptor.componentIndex]
    );
    const { key, props } = resolveComponentProps(descriptor.bindings, values);
    const childTemplate = descriptor.childrenTemplate;
    const childKey = key ?? instanceKey;
    let runtime = store.get(childKey);
    if (key != null && runtime?.lastSeen === ownerRuntime.renderPassId)
      throw new Error(`Duplicate key at component site: ${String(key)}`);
    const childValues = childTemplate ? childTemplate.indices.map((index) => values[index]) : null;
    const reusableRuntime = runtime?.componentType === componentType ? runtime : null;
    let childrenChanged = false;
    if (reusableRuntime && childValues) {
      const oldChildValues = reusableRuntime.childrenValues || [];
      childrenChanged = oldChildValues.length !== childValues.length || oldChildValues.some((value, index) => !Object.is(value, childValues[index]));
      props.children = reusableRuntime.props.children;
    } else if (childTemplate) {
      props.children = () => {
        const childRuntime = (
          /** @type {ComponentRuntime} */
          runtime
        );
        return runWithOwnerRuntime(
          childRuntime,
          () => (
            /** @type {DomTags} */
            childRuntime.rootRecord.domTags.html(childTemplate.strings, ...childRuntime.childrenValues || [])
          )
        );
      };
    }
    if (!runtime || runtime.componentType !== componentType) {
      if (runtime) destroyComponentRuntime(runtime);
      try {
        runtime = createComponentRuntime(componentType, props, ownerRuntime.rootRecord, ownerRuntime, createChildIdPath(ownerRuntime));
      } catch (error) {
        throwBoundaryError(ownerRuntime, error, true);
      }
      if (childValues) runtime.childrenValues = childValues;
      store.set(childKey, runtime);
    } else {
      syncComponentProps(runtime, props);
      if (childValues) runtime.childrenValues = childValues;
      if (childrenChanged) runtime.dirty = true;
    }
    if (!runtime.domBoundary) {
      runtime.domBoundary = new Text();
      componentBoundaries2.add(runtime.domBoundary);
    }
    runtime.lastSeen = ownerRuntime.renderPassId;
    const nodes = runtime.currentNodes && !runtime.dirty ? runtime.currentNodes : realizeComponentRuntime(
      renderComponentRuntime(
        runtime,
        /** @type {RuntimeTags} */
        ownerRuntime.rootRecord.domTags
      ),
      runtime,
      runtime.options.errorBoundary ? (
        /** @type {ChildNode[] | null} */
        runtime.currentNodes?.filter((node) => node !== runtime.domBoundary) || null
      ) : null
    );
    const debugKeyValue = ownerRuntime.rootRecord.options?.debugKeys === true && key != null ? String(key) : "";
    if (runtime.debugKeyNodes) {
      for (const node of runtime.debugKeyNodes)
        if (node instanceof Element && (!debugKeyValue || !nodes.includes(node))) node.removeAttribute("x-key");
      runtime.debugKeyNodes = void 0;
    }
    if (debugKeyValue) {
      runtime.debugKeyNodes = [];
      for (const node of nodes)
        if (node instanceof Element) {
          node.setAttribute("x-key", debugKeyValue);
          runtime.debugKeyNodes.push(node);
        }
    }
    finalizeComponentRuntime(runtime);
    return nodes;
  };
}
function createRootRecord(Component, container, props, options) {
  const rootRecord = {
    Component,
    container,
    context: createContextValues(options.context),
    contextConsumers: /* @__PURE__ */ new Map(),
    dirtyRuntimes: /* @__PURE__ */ new Set(),
    domTags,
    flushScheduled: false,
    mounted: false,
    pendingCallbacks: [],
    pendingEffects: /* @__PURE__ */ new Set(),
    options,
    identifierPrefix: options.identifierPrefix || "",
    scheduleRender() {
    },
    topRuntime: null
  };
  rootRecord.scheduleRender = () => scheduleRootRender(rootRecord);
  rootRecord.topRuntime = createComponentRuntime(Component, props, rootRecord, null);
  return rootRecord;
}
function removeOwnedNodes(target, nodes) {
  if (!target) return;
  for (const node of nodes) {
    if (node.parentNode === target) node.remove();
  }
}
function resolveElementTarget(container, errorPrefix) {
  const target = typeof container === "string" ? document.querySelector(container) : container;
  if (!(target instanceof Element)) throw new Error(`${errorPrefix} must be a DOM element or selector.`);
  return target;
}
function flushEffectsWithBoundaries(rootRecord) {
  try {
    flushEffects(rootRecord);
    return true;
  } catch (error) {
    if (!isErrorBoundarySignal(error)) throw error;
    captureBoundaryError(error.boundary, error.error);
    rootRecord.dirtyRuntimes.add(error.boundary);
    return false;
  }
}
function flushDirtyRuntimes(rootRecord) {
  const dirtyRuntimes = [...rootRecord.dirtyRuntimes].filter((runtime) => runtime.dirty && !runtime.destroyed).filter((runtime) => {
    for (let parent = runtime.parentRuntime; parent; parent = parent.parentRuntime) {
      if (rootRecord.dirtyRuntimes.has(parent) && parent.dirty && !parent.destroyed) return false;
    }
    return true;
  });
  rootRecord.dirtyRuntimes.clear();
  for (const runtime of dirtyRuntimes) {
    let retryRuntime = runtime;
    let retrying = false;
    while (true) {
      try {
        const previousNodes = retryRuntime.currentNodes || [];
        const renderable = renderComponentRuntime(retryRuntime, rootRecord.domTags);
        const nodes = realizeComponentRuntime(
          renderable,
          retryRuntime,
          retryRuntime !== rootRecord.topRuntime && (retrying || retryRuntime.options.errorBoundary) ? (
            /** @type {ChildNode[] | null} */
            previousNodes.filter((node) => node !== retryRuntime.domBoundary)
          ) : null
        );
        commitRuntimeNodes(retryRuntime, previousNodes, nodes);
        if (retryRuntime === rootRecord.topRuntime && (retrying || nodes.some((node) => node.parentNode !== rootRecord.container))) rootRecord.container.replaceChildren(...nodes);
        finalizeComponentRuntime(retryRuntime);
        break;
      } catch (error) {
        if (!isErrorBoundarySignal(error)) throw error;
        captureBoundaryError(error.boundary, error.error);
        let nextRuntime = error.boundary;
        for (let parent = error.boundary.parentRuntime; parent; parent = parent.parentRuntime) {
          if (parent !== retryRuntime) continue;
          nextRuntime = retryRuntime;
          break;
        }
        retryRuntime = nextRuntime;
        retrying = true;
      }
    }
  }
  if (!flushEffectsWithBoundaries(rootRecord)) flushDirtyRuntimes(rootRecord);
  for (const callback of rootRecord.pendingCallbacks.splice(0)) callback();
}
function performRootRender(rootRecord, hydrateOnly = false) {
  if (!rootRecord.topRuntime) throw new Error("Pepper root is missing its top runtime.");
  if (!hydrateOnly && rootRecord.mounted && !rootRecord.topRuntime.dirty && rootRecord.dirtyRuntimes.size) {
    flushDirtyRuntimes(rootRecord);
    return;
  }
  rootRecord.dirtyRuntimes.clear();
  let liveNodes = hydrateOnly ? Array.from(rootRecord.container.childNodes) : null;
  let replaceNodes = !rootRecord.mounted && !hydrateOnly;
  let nodes;
  while (true) {
    try {
      const renderable = renderComponentRuntime(rootRecord.topRuntime, rootRecord.domTags);
      nodes = realizeComponentRuntime(renderable, rootRecord.topRuntime, liveNodes?.length ? liveNodes : null);
      finalizeComponentRuntime(rootRecord.topRuntime);
      break;
    } catch (error) {
      if (!isErrorBoundarySignal(error)) throw error;
      captureBoundaryError(error.boundary, error.error);
      liveNodes = null;
      replaceNodes = true;
    }
  }
  if (replaceNodes) rootRecord.container.replaceChildren(...nodes);
  rootRecord.mounted = true;
  if (!flushEffectsWithBoundaries(rootRecord)) flushDirtyRuntimes(rootRecord);
  for (const callback of rootRecord.pendingCallbacks.splice(0)) callback();
}
function scheduleRootRender(rootRecord) {
  if (rootRecord.flushScheduled) return;
  rootRecord.flushScheduled = true;
  queueMicrotask(() => {
    rootRecord.flushScheduled = false;
    if (!rootRecord.topRuntime) throw new Error("Pepper root is missing its top runtime.");
    flushDirtyRuntimes(rootRecord);
  });
}
function mountRoot(Component, container, props = {}, options = {}, hydrateOnly = false) {
  const target = resolveElementTarget(container, "Pepper render/hydrate target");
  let rootRecord = rootMap.get(target);
  if (!rootRecord || rootRecord.Component !== Component) {
    if (rootRecord) {
      destroyComponentRuntime(rootRecord.topRuntime);
      rootMap.delete(rootRecord.container);
    }
    rootRecord = createRootRecord(Component, target, props, options);
    rootMap.set(target, rootRecord);
    performRootRender(rootRecord, hydrateOnly);
    if (!rootRecord.topRuntime?.model) throw new Error("Pepper root did not produce a component model.");
    return rootRecord.topRuntime.model;
  }
  rootRecord.options = options;
  rootRecord.identifierPrefix = options.identifierPrefix || "";
  const previousContext = rootRecord.context;
  const nextContext = createContextValues(options.context);
  const contextKeys = /* @__PURE__ */ new Set([...previousContext.keys(), ...nextContext.keys()]);
  rootRecord.context = nextContext;
  for (const key of contextKeys) {
    if (nextContext.has(key) === previousContext.has(key) && Object.is(nextContext.get(key), previousContext.get(key))) continue;
    for (const runtime of rootRecord.contextConsumers.get(key) || []) {
      runtime.dirty = true;
      rootRecord.dirtyRuntimes.add(runtime);
    }
  }
  syncComponentProps(
    /** @type {ComponentRuntime} */
    rootRecord.topRuntime,
    props
  );
  performRootRender(rootRecord, hydrateOnly && !rootRecord.mounted);
  if (!rootRecord.topRuntime?.model) throw new Error("Pepper root did not produce a component model.");
  return rootRecord.topRuntime.model;
}
function hydrate(Component, container, props = {}, options = {}) {
  return mountRoot(Component, container, props, options, true);
}
function render(Component, container, props = {}, options = {}) {
  return mountRoot(Component, container, props, options, false);
}
function portal(target, renderable) {
  const ownerRuntime = getCurrentOwnerRuntime();
  if (!ownerRuntime) throw new Error("portal() can only be used while rendering a Pepper component.");
  if (!ownerRuntime.rootRecord.domTags || typeof document === "undefined") return () => [];
  return function renderPortalValue(instanceKey = /* @__PURE__ */ Symbol()) {
    let portalRuntime = ownerRuntime.portals.get(instanceKey);
    if (!portalRuntime) {
      const createdPortalRuntime = {
        currentNodes: [],
        currentTarget: null,
        viewKey: /* @__PURE__ */ Symbol(`pepper-portal-${ownerRuntime.renderPassId}`),
        lastSeen: 0,
        destroy() {
          removeOwnedNodes(createdPortalRuntime.currentTarget, createdPortalRuntime.currentNodes);
          createdPortalRuntime.currentNodes = [];
          createdPortalRuntime.currentTarget = null;
        }
      };
      portalRuntime = createdPortalRuntime;
      ownerRuntime.portals.set(instanceKey, portalRuntime);
    }
    const nextTarget = resolveElementTarget(target, "Pepper portal target");
    const portalState = (
      /** @type {{ currentNodes: ChildNode[], currentTarget: Element | null, viewKey: symbol, lastSeen: number, destroy(): void }} */
      portalRuntime
    );
    const liveNodes = portalState.currentTarget === nextTarget && portalState.currentNodes.length ? portalState.currentNodes : null;
    if (!liveNodes && portalState.currentTarget && portalState.currentTarget !== nextTarget) {
      removeOwnedNodes(portalState.currentTarget, portalState.currentNodes);
      portalState.currentNodes = [];
    }
    const view = (
      /** @type {(key?: symbol, liveNodes?: ChildNode[]) => Node[]} */
      typeof renderable === "function" ? renderable : (
        /** @type {DomTags} */
        ownerRuntime.rootRecord.domTags.html(singleValueStrings, renderable)
      )
    );
    const nodes = (
      /** @type {ChildNode[]} */
      liveNodes ? view(portalState.viewKey, portalState.currentNodes) : view(portalState.viewKey)
    );
    if (!liveNodes) for (const node of nodes) nextTarget.append(node);
    portalState.currentNodes = nodes;
    portalState.currentTarget = nextTarget;
    portalState.lastSeen = ownerRuntime.renderPassId;
    return [];
  };
}
var html2 = domTags.html;
var svg2 = svg;
var mathml2 = mathml;
export {
  component,
  force,
  html2 as html,
  hydrate,
  mathml2 as mathml,
  portal,
  rawText,
  ref,
  render,
  stableId,
  state,
  svg2 as svg,
  unsafeHTML,
  unsafeMathML,
  unsafeSVG
};
//# sourceMappingURL=index.js.map
