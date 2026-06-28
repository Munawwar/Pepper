// src/html.js
function html(strings, ...values) {
  return handleTemplateTag("html", strings, ...values);
}
function svg(strings, ...values) {
  return handleTemplateTag("svg", strings, ...values);
}
function mathml(strings, ...values) {
  return handleTemplateTag("mathml", strings, ...values);
}
var FORCE_SYMBOL = /* @__PURE__ */ Symbol("force");
var UNSAFE_HTML_SYMBOL = /* @__PURE__ */ Symbol("unsafe-html");
var UNSAFE_SVG_SYMBOL = /* @__PURE__ */ Symbol("unsafe-svg");
var UNSAFE_MATHML_SYMBOL = /* @__PURE__ */ Symbol("unsafe-mathml");
var RAW_TEXT_SYMBOL = /* @__PURE__ */ Symbol("raw-text");
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
    template.values = values;
    return liveNodes ? template.hydrateInstance(
      key,
      /** @type {Element | ShadowRoot | DocumentFragment} */
      liveNodes[0]?.parentNode,
      liveNodes
    ) : template.updateInstance(key);
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
var HTML_TAG_REGEXP = /<[^<>]*?\/?>/g;
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
    htmlString = htmlString.replace(HTML_TAG_REGEXP, (tagMatch) => {
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
  /** @type {InterpolationValue[]} */
  values = [];
  /**
   * Update instance with new values. This gets returned by the `html`
   * function for users to call with their keys.
   *
   * @param {TemplateKey} key
   */
  updateInstance = (key = /* @__PURE__ */ Symbol()) => {
    const templateInstance = this.getInstance(key);
    templateInstance.applyValues(this.values);
    const renderedNodes = templateInstance.getRenderedNodes();
    trackTemplateInstanceNodes(templateInstance, renderedNodes);
    return renderedNodes;
  };
  /**
   * Hydrate an existing DOM subtree into a template instance, reusing matching
   * nodes and replacing mismatches with the template-owned nodes.
   *
   * @param {TemplateKey} key
   * @param {Element | ShadowRoot | DocumentFragment} container
   * @param {Node[]} liveNodes
   */
  hydrateInstance = (key, container, liveNodes) => {
    const templateInstance = this.getInstance(key);
    templateInstance.applyValues(this.values);
    const adoptionMap = /* @__PURE__ */ new Map();
    reconcileHydrationNodes(
      container,
      liveNodes,
      /** @type {Node[]} */
      [...templateInstance.nodes],
      adoptionMap,
      liveNodes[liveNodes.length - 1]?.nextSibling || null
    );
    templateInstance.absorb(adoptionMap);
    const renderedNodes = templateInstance.getRenderedNodes();
    trackTemplateInstanceNodes(templateInstance, renderedNodes);
    return renderedNodes;
  };
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
  else if (inputValue == null || inputValue === "" || inputValue === false) eventListener = null;
  else throw new TypeError(`Event handler for ${eventName} must be a function or string`);
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
  const startBoundaryNode = oldNodes[0]?.previousSibling || endBoundaryNode?.previousSibling || null;
  while (oldStart < oldEnd || newStart < newEnd) {
    if (oldEnd === oldStart) {
      while (newStart < newEnd) {
        const node = newNodes[newStart++];
        if ("moveBefore" in parentNode && node.parentNode === parentNode)
          parentNode.moveBefore(node, endBoundaryNode);
        else parentNode.insertBefore(node, endBoundaryNode);
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
      const endBoundary = newNodes[newEnd] || endBoundaryNode;
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
    site.node.textContent = String(unwrappedValue ?? "");
    site.insertedNodes = void 0;
  } else {
    const itemsToProcess = Array.isArray(unwrappedValue) ? unwrappedValue : [unwrappedValue];
    const nodes = (
      /** @type {(Element | Text)[]} */
      itemsToProcess.flatMap((item, index) => {
        if (typeof item === "function") {
          const stableKey = getStableNestedKey(site, index);
          item = item(stableKey);
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
        if (item != null && item !== "") return [new Text(String(item))];
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
function reconcileHydrationNodes(parentNode, liveNodes, targetNodes, adoptionMap, nextSibling = null) {
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
      reconcileHydrationNodes(
        liveElement,
        Array.from(liveElement.childNodes),
        Array.from(targetNode.childNodes),
        adoptionMap,
        null
      );
    }
    liveIndex++;
    targetIndex++;
  }
}
var TemplateInstance = class {
  nodes;
  sites;
  /**
   * @param {TemplateNodes} nodes The cloned nodes for this template instance
   * @param {InterpolationSite[]} sites The interpolation sites in the template
   */
  constructor(nodes, sites) {
    this.nodes = nodes;
    this.sites = sites;
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
        if (binding.type === "property" && binding.attributeName === "__pepperRef" && binding.value && typeof binding.value === "object" && "current" in binding.value) binding.value.current = /** @type {Element} */
        node;
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
    trackTemplateInstanceNodes(this, this.getRenderedNodes());
    return this;
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
            if (binding.value && typeof binding.value === "object" && "current" in binding.value)
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
            if (previous?.value && previous.value !== binding.value && typeof previous.value === "object" && "current" in previous.value)
              previous.value.current = null;
            if (binding.value && typeof binding.value === "object" && "current" in binding.value) binding.value.current = element;
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
  getRenderedNodes() {
    return (
      /** @type {TemplateNodes} */
      Object.freeze(
        this.nodes.flatMap((node) => {
          for (const site of this.sites) {
            if (site.type !== "text" || site.node !== node || !site.insertedNodes?.length) continue;
            return site.insertedNodes;
          }
          return [node];
        })
      )
    );
  }
};

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
function createContextValues(context) {
  if (context instanceof Map) return new Map(context);
  return new Map(Object.entries(context || {}));
}
function getContextValue(runtime, key) {
  let current = runtime;
  while (current) {
    if (current.contextValues?.has(key)) return current.contextValues.get(key);
    current = current.parentRuntime;
  }
  return runtime.rootRecord.context?.get(key);
}
function hasContextValue(runtime, key) {
  let current = runtime;
  while (current) {
    if (current.contextValues?.has(key)) return true;
    current = current.parentRuntime;
  }
  return runtime.rootRecord.context?.has(key) === true;
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
  runtime.rootRecord.dirtyRuntimes?.add(runtime);
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
    contextValues: null,
    currentNodes: null,
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
  const setupApi = {
    getProps: () => runtime.props,
    getContext: (key) => getContextValue(runtime, key),
    hasContext: (key) => hasContextValue(runtime, key),
    onMount: (handler) => {
      runtime.mountHandlers.push(handler);
    },
    onProps: (handler) => {
      runtime.propHandlers.push(handler);
    },
    setContext: (key, value) => {
      if (!runtime.contextValues) runtime.contextValues = /* @__PURE__ */ new Map();
      runtime.contextValues.set(key, value);
      return value;
    },
    update: (callback) => {
      markRuntimeDirty(runtime, callback);
    }
  };
  const previousRuntime = currentSetupRuntime;
  currentSetupRuntime = runtime;
  try {
    const model = definition.factory(setupApi);
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
  runtime.currentNodes = null;
  for (const cleanup of runtime.mountCleanups.splice(0)) cleanup();
  for (const runtimeRef of runtime.refs) runtimeRef.current = null;
}
function flushMounts(rootRecord) {
  const pendingMounts = rootRecord.pendingMounts.splice(0);
  for (const runtime of pendingMounts) {
    if (runtime.destroyed || !runtime.needsMount) continue;
    runtime.needsMount = false;
    for (const handler of runtime.mountHandlers) {
      const cleanup = handler();
      if (typeof cleanup === "function") runtime.mountCleanups.push(cleanup);
    }
  }
}
function getCurrentOwnerRuntime() {
  return currentOwnerRuntime;
}
function getOrCreateChildStore(ownerRuntime, descriptor) {
  let store = ownerRuntime.childStores.get(descriptor);
  if (!store) ownerRuntime.childStores.set(descriptor, store = /* @__PURE__ */ new Map());
  return store;
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

// src/html-ssr.js
var FORCE_SYMBOL2 = /* @__PURE__ */ Symbol("force");
var TEMPLATE_RESULT_SYMBOL = /* @__PURE__ */ Symbol("template-result");
var UNSAFE_HTML_SYMBOL2 = /* @__PURE__ */ Symbol("unsafe-html");
var UNSAFE_SVG_SYMBOL2 = /* @__PURE__ */ Symbol("unsafe-svg");
var UNSAFE_MATHML_SYMBOL2 = /* @__PURE__ */ Symbol("unsafe-mathml");
var RAW_TEXT_SYMBOL2 = /* @__PURE__ */ Symbol("raw-text");
var INTERPOLATION_MARKER3 = "\u29D9\u29D8";
var INTERPOLATION_PARTS_REGEXP = new RegExp(`${INTERPOLATION_MARKER3}(\\d+)${INTERPOLATION_MARKER3}`);
var SPREAD_SITE_REGEXP = new RegExp(`^\\.\\.\\.${INTERPOLATION_MARKER3}(\\d+)${INTERPOLATION_MARKER3}$`);
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
var ATTRIBUTE_SITE_ERROR2 = "Nested templates and DOM elements are not allowed in attributes. Use text content interpolation instead.";
var TRUSTED_TEXT_CONTEXT_ERROR2 = "unsafeHTML(), unsafeSVG(), unsafeMathML(), and rawText() are only allowed in text content interpolation.";
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
function html2(strings, ...values) {
  return handleTemplateTag2("html", strings, ...values);
}
function svg2(strings, ...values) {
  return handleTemplateTag2("svg", strings, ...values);
}
function mathml2(strings, ...values) {
  return handleTemplateTag2("mathml", strings, ...values);
}
function renderToString(value) {
  return serializeChildValue(value);
}
function unwrapForce2(value) {
  return typeof value === "object" && value !== null && FORCE_SYMBOL2 in value ? value[FORCE_SYMBOL2] : value;
}
function handleTemplateTag2(mode, strings, ...values) {
  const render2 = function() {
    return { [TEMPLATE_RESULT_SYMBOL]: true, mode, strings, values };
  };
  render2.template = { mode, strings };
  return render2;
}
function serializeChildValue(value) {
  value = unwrapForce2(value);
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
    (htmlString, string, index) => htmlString + string + (index < strings.length - 1 ? `${INTERPOLATION_MARKER3}${index}${INTERPOLATION_MARKER3}` : ""),
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
    const parts = parseInterpolationParts3(source.slice(cursor, end));
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
        parts: value == null ? null : parseInterpolationParts3(value)
      });
      continue;
    }
    if (name.startsWith(".") || name.startsWith("!.") || name.startsWith("@") || name.startsWith("!@")) continue;
    bindings.push({
      type: "attribute",
      name: name.startsWith("!") ? name.slice(1) : name,
      parts: value == null ? [""] : parseInterpolationParts3(value)
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
              value2 = !!unwrapForce2(values[binding.parts[1]]);
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
  spreadValue = unwrapForce2(spreadValue);
  if (spreadValue == null || spreadValue === false || typeof spreadValue !== "object" || Array.isArray(spreadValue) || looksLikeNode(spreadValue))
    return;
  for (const [name, value] of Object.entries(spreadValue)) {
    if (name.startsWith("?")) {
      bindings.set(name, { type: "boolean-attribute", name: name.slice(1), value: !!unwrapForce2(value) });
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
  value = unwrapForce2(value);
  if (value == null) return "";
  if (looksTrustedTextValue(value)) throw new Error(TRUSTED_TEXT_CONTEXT_ERROR2);
  if (typeof value === "function" || Array.isArray(value) || looksTemplateValue(value) || looksLikeNode(value))
    throw new Error(ATTRIBUTE_SITE_ERROR2);
  return String(value);
}
function parseInterpolationParts3(value) {
  if (!value.includes(INTERPOLATION_MARKER3)) return [value];
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
  return typeof value === "object" && value !== null && (UNSAFE_HTML_SYMBOL2 in value || UNSAFE_SVG_SYMBOL2 in value || UNSAFE_MATHML_SYMBOL2 in value || RAW_TEXT_SYMBOL2 in value);
}
function serializeTrustedTextValue(value) {
  if (UNSAFE_HTML_SYMBOL2 in value || UNSAFE_SVG_SYMBOL2 in value || UNSAFE_MATHML_SYMBOL2 in value)
    return value[UNSAFE_HTML_SYMBOL2] || value[UNSAFE_SVG_SYMBOL2] || value[UNSAFE_MATHML_SYMBOL2] || "";
  if (!(RAW_TEXT_SYMBOL2 in value)) return "";
  let text = value[RAW_TEXT_SYMBOL2] || "";
  for (const [pattern, replacement] of RAW_TEXT_REPLACEMENTS) {
    if (typeof replacement === "string") text = text.replace(pattern, replacement);
    else text = text.replace(pattern, replacement);
  }
  return text;
}

// src/pepper-ssr.js
var publicSsrTagsHolder = {
  context: /* @__PURE__ */ new Map(),
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
      if (!compiled) return html2(strings, ...values);
      const ownerRuntime = getCurrentOwnerRuntime();
      const lowered = lowerComponentTemplate(compiled, values, (entry) => createSsrComponentValue(rootRecord, ownerRuntime, entry, values));
      if (!lowered) return html2(strings, ...values);
      return html2(lowered.strings, ...lowered.values);
    },
    mathml: mathml2,
    svg: svg2
  };
}
function createSsrComponentValue(rootRecord, ownerRuntime, descriptor, values) {
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
    const runtime = createComponentRuntime(componentType, props, rootRecord, ownerRuntime);
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
function renderComponentToString(Component, props = {}, options = {}) {
  const rootRecord = {
    context: createContextValues(options.context),
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
publicSsrTagsHolder.ssrTags = createSsrTags(publicSsrTagsHolder);

// src/store.js
var Store = class {
  /** @type {Record<string, unknown>} */
  #data;
  /** @type {Array<{ props: string[], callback: (changedProps: string[]) => void, context: unknown }>} */
  #subscribers;
  /**
   * @param {Record<string, unknown>} [initialData]
   */
  constructor(initialData) {
    this.#data = initialData || {};
    this.#subscribers = [];
  }
  /**
   * Read the current store data object.
   *
   * @returns {Record<string, unknown>}
   */
  get data() {
    return this.#data;
  }
  /**
   * Replace the entire store data object and notify subscribers for changed keys.
   *
   * @param {Record<string, unknown>} newData
   */
  set data(newData) {
    if (!newData || typeof newData !== "object") {
      return;
    }
    const changedProps = [
      ...keys(newData).filter((prop) => this.#data[prop] !== newData[prop]),
      ...keys(this.#data).filter((prop) => !(prop in newData))
    ];
    this.#data = newData;
    this.#notify(changedProps);
  }
  /**
   * @param {string[]} changedProps
   */
  #notify(changedProps) {
    const changedPropsLookup = new Set(changedProps);
    this.#subscribers.forEach((subscriber) => {
      const changesPropsSubset = subscriber.props.filter((prop) => changedPropsLookup.has(prop));
      if (changesPropsSubset.length) {
        subscriber.callback.call(subscriber.context, changesPropsSubset);
      }
    });
  }
  /**
   * Subscribe to changes in global store properties
   * @param {string[]} propsToListenFor
   * @param {(changedProps: string[]) => void} func
   * @param {unknown} [context]
   */
  subscribe(propsToListenFor, func, context) {
    if (typeof func !== "function" || !Array.isArray(propsToListenFor)) {
      return;
    }
    const alreadyAdded = this.#subscribers.some((subscriber) => subscriber.callback === func && (context === void 0 || context === subscriber.context));
    if (!alreadyAdded) {
      this.#subscribers.push({
        props: propsToListenFor,
        callback: func,
        context
      });
    }
  }
  /**
   * @param {(changedProps: string[]) => void} func
   * @param {unknown} [context]
   * @returns {void}
   */
  unsubscribe(func, context) {
    this.#subscribers = this.#subscribers.filter((subscriber) => !(subscriber.callback === func && (context === void 0 || context === subscriber.context)));
  }
  /**
   * Shallow-merge partial data into the store and notify subscribers for changed keys.
   *
   * @param {Record<string, unknown>} newData
   */
  assign(newData) {
    if (!newData || typeof newData !== "object") {
      return;
    }
    const changedProps = keys(newData).filter((prop) => this.#data[prop] !== newData[prop]);
    Object.assign(this.#data, newData);
    this.#notify(changedProps);
  }
};

// src/index.js
var rootMap = /* @__PURE__ */ new WeakMap();
var ENABLE_COMPONENT_NODE_CACHE = true;
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
    /** @type {(key?: symbol, liveNodes?: ChildNode[]) => Node[]} */
    typeof renderable === "function" ? renderable : (
      /** @type {DomTags} */
      runtime.rootRecord.domTags.html(singleValueStrings, renderable)
    )
  );
  const nodes = liveNodes ? view(runtime.viewKey, liveNodes) : view(runtime.viewKey);
  runtime.currentNodes = nodes;
  return nodes;
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
      const lowered = lowerComponentTemplate(compiled, values, (entry) => createDomComponentValue(ownerRuntime, entry, values));
      if (!lowered) return html(strings, ...values);
      if (compiled.strings.every((string) => string === "")) {
        const keyedInstanceIds = /* @__PURE__ */ new Map();
        return function renderComponentOnlyTemplate(key = /* @__PURE__ */ Symbol()) {
          let instanceIds = keyedInstanceIds.get(key);
          if (!instanceIds) keyedInstanceIds.set(key, instanceIds = []);
          return lowered.values.flatMap((value, index) => {
            if (typeof value === "function") {
              let instanceId = instanceIds[index];
              if (!instanceId) instanceIds[index] = instanceId = /* @__PURE__ */ Symbol(`pepper-component-hole-${index}`);
              return value(instanceId);
            }
            return Array.isArray(value) ? value.flat(Infinity) : value == null ? [] : [value];
          });
        };
      }
      return html(lowered.strings, ...lowered.values);
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
    const childrenSource = descriptor.childrenSource;
    if (childrenSource != null) {
      props.children = () => renderSourceTemplate(
        /** @type {DomTags} */
        ownerRuntime.rootRecord.domTags.html,
        childrenSource,
        values
      );
    }
    const childKey = key ?? instanceKey;
    let runtime = store.get(childKey);
    if (!runtime || runtime.componentType !== componentType) {
      if (runtime) destroyComponentRuntime(runtime);
      runtime = createComponentRuntime(componentType, props, ownerRuntime.rootRecord, ownerRuntime);
      store.set(childKey, runtime);
    } else {
      syncComponentProps(runtime, props);
    }
    runtime.lastSeen = ownerRuntime.renderPassId;
    const nodes = ENABLE_COMPONENT_NODE_CACHE && runtime.currentNodes && !runtime.dirty && !runtime.hasDirtyDescendant && !runtime.pendingChangedProps.length ? runtime.currentNodes : realizeDomRenderable(
      renderComponentRuntime(
        runtime,
        /** @type {RuntimeTags} */
        ownerRuntime.rootRecord.domTags
      ),
      runtime
    );
    const debugKeyValue = ownerRuntime.rootRecord.options?.debugKeys === true && key != null ? String(key) : "";
    if (runtime.debugKeyNodes) {
      for (const node of runtime.debugKeyNodes)
        if (node instanceof Element && (!debugKeyValue || !nodes.includes(node))) node.removeAttribute("x-key");
    }
    runtime.debugKeyNodes = [];
    if (debugKeyValue) {
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
    dirtyRuntimes: /* @__PURE__ */ new Set(),
    domTags,
    flushScheduled: false,
    mounted: false,
    pendingCallbacks: [],
    pendingMounts: [],
    options,
    scheduleRender() {
    },
    topRuntime: null
  };
  rootRecord.scheduleRender = () => scheduleRootRender(rootRecord);
  rootRecord.topRuntime = createComponentRuntime(Component, props, rootRecord, null);
  return rootRecord;
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
    const renderable = renderComponentRuntime(runtime, rootRecord.domTags);
    realizeDomRenderable(renderable, runtime);
    finalizeComponentRuntime(runtime);
  }
  flushMounts(rootRecord);
  for (const callback of rootRecord.pendingCallbacks.splice(0)) callback();
}
function performRootRender(rootRecord, hydrateOnly = false) {
  if (!rootRecord.topRuntime) throw new Error("Pepper root is missing its top runtime.");
  if (!hydrateOnly && rootRecord.mounted && !rootRecord.topRuntime.dirty && !rootRecord.topRuntime.hasDirtyDescendant && !rootRecord.topRuntime.pendingChangedProps.length && rootRecord.dirtyRuntimes.size) {
    flushDirtyRuntimes(rootRecord);
    return;
  }
  rootRecord.dirtyRuntimes.clear();
  const liveNodes = hydrateOnly ? Array.from(rootRecord.container.childNodes) : null;
  const renderable = renderComponentRuntime(rootRecord.topRuntime, rootRecord.domTags);
  const nodes = realizeDomRenderable(renderable, rootRecord.topRuntime, liveNodes && liveNodes.length ? liveNodes : null);
  finalizeComponentRuntime(rootRecord.topRuntime);
  if (!rootRecord.mounted && !hydrateOnly) rootRecord.container.replaceChildren(...nodes);
  rootRecord.mounted = true;
  flushMounts(rootRecord);
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
  const target = typeof container === "string" ? document.querySelector(container) : container;
  if (!(target instanceof Element)) {
    throw new Error("Pepper render/hydrate target must be a DOM element or selector.");
  }
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
function renderToString2(Component, props = {}, options = {}) {
  return renderComponentToString(Component, props, options);
}
var html3 = domTags.html;
var svg3 = svg;
var mathml3 = mathml;
export {
  Store,
  component,
  force,
  html3 as html,
  hydrate,
  mathml3 as mathml,
  rawText,
  ref,
  render,
  renderToString2 as renderToString,
  state,
  svg3 as svg,
  unsafeHTML,
  unsafeMathML,
  unsafeSVG
};
//# sourceMappingURL=index.js.map
