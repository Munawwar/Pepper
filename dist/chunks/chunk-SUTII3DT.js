var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/utils.js
function isEqual(value1, value2, ancestors) {
  if (Object.is(value1, value2)) return true;
  if (value1 === null || value2 === null || typeof value1 !== "object" || typeof value2 !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value1);
  if (prototype !== Object.getPrototypeOf(value2)) return false;
  const isArray = Array.isArray(value1);
  if (isArray !== Array.isArray(value2)) return false;
  if (value1 instanceof Date) {
    return value1.getTime() === /** @type {Date} */
    value2.getTime();
  }
  if (value1 instanceof RegExp) {
    return value1.toString() === value2.toString();
  }
  if (isArray) {
    if (value1.length !== /** @type {unknown[]} */
    value2.length) return false;
  } else if (prototype !== Object.prototype && prototype !== null) return false;
  ancestors ||= /* @__PURE__ */ new WeakSet();
  if (ancestors.has(value1)) return false;
  ancestors.add(value1);
  const objectKeys = Object.keys(value1);
  const equal = objectKeys.length === Object.keys(value2).length && objectKeys.every((key) => Object.hasOwn(value2, key) && isEqual(
    /** @type {Record<string, unknown>} */
    value1[key],
    /** @type {Record<string, unknown>} */
    value2[key],
    ancestors
  ));
  ancestors.delete(value1);
  return equal;
}

// src/component-runtime.js
var COMPONENT_SYMBOL = /* @__PURE__ */ Symbol("pepper-component");
var ERROR_BOUNDARY_SIGNAL = /* @__PURE__ */ Symbol("pepper-error-boundary-signal");
var NO_ERROR = /* @__PURE__ */ Symbol("pepper-no-error");
var defaultComponentOptions = {
  autoEffectEvent: true,
  errorBoundary: false,
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
function isErrorBoundarySignal(value) {
  return !!value && typeof value === "object" && ERROR_BOUNDARY_SIGNAL in value;
}
function throwBoundaryError(runtime, error, includeSelf = false) {
  let boundary = includeSelf ? runtime : runtime.parentRuntime;
  while (boundary && (boundary.destroyed || !boundary.options.errorBoundary)) boundary = boundary.parentRuntime;
  if (!boundary) throw error;
  throw { [ERROR_BOUNDARY_SIGNAL]: true, boundary, error };
}
function captureBoundaryError(runtime, error) {
  runtime.capturedError = error;
  runtime.dirty = true;
}
function runWithOwnerRuntime(runtime, callback) {
  const previousOwnerRuntime = currentOwnerRuntime;
  currentOwnerRuntime = runtime;
  try {
    return callback();
  } finally {
    currentOwnerRuntime = previousOwnerRuntime;
  }
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
  runtime.nextContextDependencies?.add(key);
  return runtime.rootRecord.context?.get(key);
}
function hasContextValue(runtime, key) {
  let current = runtime;
  while (current) {
    if (current.contextValues?.has(key)) return true;
    current = current.parentRuntime;
  }
  runtime.nextContextDependencies?.add(key);
  return runtime.rootRecord.context?.has(key) === true;
}
function syncContextDependencies(runtime, nextDependencies) {
  const consumersByKey = runtime.rootRecord.contextConsumers;
  for (const key of runtime.contextDependencies) {
    if (nextDependencies.has(key)) continue;
    const consumers = consumersByKey?.get(key);
    consumers?.delete(runtime);
    if (!consumers?.size) consumersByKey?.delete(key);
  }
  for (const key of nextDependencies) {
    let consumers = consumersByKey?.get(key);
    if (!consumers) consumersByKey?.set(key, consumers = /* @__PURE__ */ new Set());
    consumers?.add(runtime);
  }
  runtime.contextDependencies = nextDependencies;
}
function ref() {
  const runtime = currentSetupRuntime;
  if (!runtime) throw new Error("ref() can only be used while creating a Pepper component.");
  const refObject = { current: null };
  runtime.refs.push(refObject);
  return refObject;
}
function stableId() {
  const runtime = currentSetupRuntime;
  if (!runtime) throw new Error("stableId() can only be used while creating a Pepper component.");
  return `${runtime.rootRecord.identifierPrefix || ""}p-${runtime.idPath}${(runtime.idLocalCounter++).toString(36)}`;
}
function createChildIdPath(ownerRuntime) {
  return `${ownerRuntime.idPath}${(ownerRuntime.nextChildId++).toString(36)}-`;
}
function markRuntimeDirty(runtime, callback) {
  if (runtime.destroyed) return;
  if (callback) runtime.rootRecord.pendingCallbacks?.push(() => {
    if (!runtime.destroyed) callback();
  });
  runtime.dirty = true;
  runtime.rootRecord.dirtyRuntimes?.add(runtime);
  runtime.rootRecord.scheduleRender();
}
function syncComponentProps(runtime, nextProps = {}) {
  const oldProps = runtime.props;
  const normalizedProps = { ...nextProps };
  let changed = false;
  if (typeof runtime.options.propsComparator === "function") {
    const result = runtime.options.propsComparator(oldProps, normalizedProps);
    if (result !== true && (!Array.isArray(result) || result.some((key) => typeof key !== "string")))
      throw new TypeError("Pepper propsComparator must return true or an array of changed prop names.");
    changed = result !== true && result.length > 0;
  } else {
    for (const key of /* @__PURE__ */ new Set([...Object.keys(oldProps), ...Object.keys(normalizedProps)])) {
      if (!Object.hasOwn(normalizedProps, key)) {
        changed = true;
        continue;
      }
      if (runtime.options.autoEffectEvent !== false && typeof normalizedProps[key] === "function" && /^on[A-Z]/.test(key)) continue;
      const previousValue = oldProps[key];
      const nextValue = normalizedProps[key];
      const isSame = runtime.options.memo === false ? Object.is(previousValue, nextValue) : isEqual(previousValue, nextValue);
      if (!Object.hasOwn(oldProps, key) || !isSame) changed = true;
    }
  }
  runtime.props = normalizedProps;
  if (changed) runtime.dirty = true;
}
function createComponentRuntime(componentType, props, rootRecord, parentRuntime = null, idPath = "") {
  const definition = getComponentDefinition(componentType);
  const runtime = {
    childStores: /* @__PURE__ */ new Map(),
    capturedError: NO_ERROR,
    componentType,
    contextDependencies: /* @__PURE__ */ new Set(),
    contextValues: null,
    currentNodes: null,
    currentRenderable: null,
    currentTemplateInstance: null,
    destroyed: false,
    dirty: true,
    nextChildId: 0,
    idLocalCounter: 0,
    idPath,
    lastSeen: 0,
    model: null,
    effects: [],
    options: definition.options,
    parentRuntime,
    nextContextDependencies: null,
    portals: /* @__PURE__ */ new Map(),
    props: { ...props },
    refs: [],
    renderPassId: 0,
    rootRecord,
    viewKey: /* @__PURE__ */ Symbol("pepper-view")
  };
  const setupApi = {
    effect: (handler, getDependencies) => {
      if (currentSetupRuntime !== runtime) throw new Error("Pepper effect() can only be registered while creating a component.");
      if (typeof handler !== "function" || getDependencies != null && typeof getDependencies !== "function")
        throw new TypeError("Pepper effect() expects a function and an optional dependency function.");
      runtime.effects.push({ cleanup: null, dependencies: null, getDependencies: getDependencies || null, handler: (
        /** @type {any} */
        handler
      ) });
    },
    getProps: () => runtime.props,
    getContext: (key) => getContextValue(runtime, key),
    getError: () => runtime.capturedError === NO_ERROR ? null : runtime.capturedError,
    hasContext: (key) => hasContextValue(runtime, key),
    resetError: () => {
      if (runtime.capturedError === NO_ERROR) return;
      runtime.capturedError = NO_ERROR;
      markRuntimeDirty(runtime);
      if (runtime.parentRuntime) markRuntimeDirty(runtime.parentRuntime);
    },
    setContext: (key, value) => {
      if (currentSetupRuntime !== runtime) throw new Error("Pepper setContext() can only be called during component setup.");
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
  return runtime;
}
function renderComponentRuntime(runtime, tags) {
  if (runtime.renderPassId > 0 && !runtime.dirty) {
    runtime.renderPassId++;
    return runtime.currentRenderable;
  }
  if (!runtime.model) throw new Error("Pepper component runtime is missing its model.");
  const model = runtime.model;
  while (true) {
    runtime.renderPassId++;
    runtime.nextContextDependencies = runtime.rootRecord.pendingEffects ? /* @__PURE__ */ new Set() : null;
    try {
      runtime.currentRenderable = runWithOwnerRuntime(runtime, () => model.render.call(model, tags.html));
      runtime.rootRecord.pendingEffects?.add(runtime);
      return runtime.currentRenderable;
    } catch (error) {
      if (isErrorBoundarySignal(error) && error.boundary === runtime && runtime.options.errorBoundary && runtime.capturedError === NO_ERROR) {
        captureBoundaryError(runtime, error.error);
        continue;
      }
      throwBoundaryError(runtime, error);
    }
  }
}
function finalizeComponentRuntime(runtime) {
  for (const store of runtime.childStores.values()) {
    for (const [key, childRuntime] of store) {
      if (childRuntime.lastSeen === runtime.renderPassId) continue;
      destroyComponentRuntime(childRuntime);
      store.delete(key);
    }
  }
  for (const [key, portalRuntime] of runtime.portals) {
    if (portalRuntime.lastSeen === runtime.renderPassId) continue;
    portalRuntime.destroy();
    runtime.portals.delete(key);
  }
  runtime.dirty = false;
}
function destroyComponentRuntime(runtime) {
  if (!runtime || runtime.destroyed) return;
  runtime.destroyed = true;
  let cleanupError = NO_ERROR;
  for (const store of runtime.childStores.values()) {
    for (const childRuntime of store.values()) {
      try {
        destroyComponentRuntime(childRuntime);
      } catch (error) {
        cleanupError = error;
      }
    }
    store.clear();
  }
  runtime.childStores.clear();
  for (const portalRuntime of runtime.portals.values()) portalRuntime.destroy();
  runtime.portals.clear();
  runtime.currentTemplateInstance?.deactivate();
  runtime.currentTemplateInstance = null;
  runtime.currentNodes = null;
  runtime.rootRecord.pendingEffects?.delete(runtime);
  syncContextDependencies(runtime, /* @__PURE__ */ new Set());
  for (const effect of runtime.effects) {
    const cleanup = effect.cleanup;
    effect.cleanup = null;
    if (!cleanup) continue;
    try {
      cleanup();
    } catch (error) {
      cleanupError = error;
    }
  }
  for (const runtimeRef of runtime.refs) runtimeRef.current = null;
  if (cleanupError !== NO_ERROR) {
    if (isErrorBoundarySignal(cleanupError)) throw cleanupError;
    throwBoundaryError(runtime, cleanupError);
  }
}
function flushEffects(rootRecord) {
  const pendingEffects = [...rootRecord.pendingEffects || []];
  rootRecord.pendingEffects?.clear();
  for (let index = 0; index < pendingEffects.length; index++) {
    const runtime = pendingEffects[index];
    if (runtime.destroyed) continue;
    try {
      const nextContextDependencies = runtime.nextContextDependencies || /* @__PURE__ */ new Set();
      const changedEffects = [];
      for (const effect of runtime.effects) {
        const dependencies = effect.getDependencies ? effect.getDependencies() : [];
        if (!Array.isArray(dependencies)) throw new TypeError("Pepper effect() dependencies must be an array.");
        const previousDependencies = effect.dependencies || void 0;
        if (!effect.getDependencies || !previousDependencies || dependencies.length !== previousDependencies.length || dependencies.some((value, dependencyIndex) => !Object.is(value, previousDependencies[dependencyIndex])))
          changedEffects.push({ effect, dependencies, previousDependencies });
      }
      syncContextDependencies(runtime, nextContextDependencies);
      runtime.nextContextDependencies = null;
      let cleanupError = NO_ERROR;
      for (const { effect, dependencies } of changedEffects) {
        const cleanup = effect.cleanup;
        effect.cleanup = null;
        effect.dependencies = dependencies;
        try {
          cleanup?.();
        } catch (error) {
          cleanupError = error;
        }
      }
      if (cleanupError !== NO_ERROR) throw cleanupError;
      for (const { effect, dependencies, previousDependencies } of changedEffects) {
        if (runtime.destroyed) break;
        const cleanup = effect.handler(dependencies, previousDependencies);
        if (typeof cleanup === "function") {
          if (runtime.destroyed) cleanup();
          else effect.cleanup = cleanup;
        }
      }
    } catch (error) {
      for (const pendingRuntime of pendingEffects.slice(index + 1)) rootRecord.pendingEffects?.add(pendingRuntime);
      throwBoundaryError(runtime, error);
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
var INTERPOLATION_MARKER = "\u29D9\u29D8";
var componentTemplateCache = /* @__PURE__ */ new WeakMap();
function readInterpolationMarker(source, start) {
  if (!source.startsWith(INTERPOLATION_MARKER, start)) return null;
  const valueStart = start + INTERPOLATION_MARKER.length;
  const valueEnd = source.indexOf(INTERPOLATION_MARKER, valueStart);
  if (valueEnd === -1) return null;
  return {
    index: parseInt(source.slice(valueStart, valueEnd)),
    end: valueEnd + INTERPOLATION_MARKER.length
  };
}
function parseInterpolationParts(source) {
  const parts = [];
  let cursor = 0;
  while (cursor < source.length) {
    const marker = readInterpolationMarker(source, cursor);
    if (marker) {
      parts.push(marker.index);
      cursor = marker.end;
      continue;
    }
    const nextMarker = source.indexOf(INTERPOLATION_MARKER, cursor);
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
      { type: "prop", name, parts: parseInterpolationParts(rawValue) }
    );
  }
  return bindings;
}
function compileComponentTemplate(strings) {
  let compiled = componentTemplateCache.get(strings);
  if (compiled !== void 0) return compiled;
  const source = strings.reduce(
    (htmlString, string, index) => htmlString + string + (index < strings.length - 1 ? `${INTERPOLATION_MARKER}${index}${INTERPOLATION_MARKER}` : ""),
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
      let childrenTemplate = null;
      let end = open.end;
      if (!open.selfClosing) {
        const close = findMatchingComponentClose(source, open.end);
        if (!close) throw new Error("Pepper component tag is missing a matching closing tag.");
        const childrenSource = source.slice(open.end, close.start);
        const childStrings = Object.assign([""], { raw: [""] });
        const indices = [];
        let childCursor = 0;
        while (childCursor < childrenSource.length) {
          const marker2 = readInterpolationMarker(childrenSource, childCursor);
          if (marker2) {
            indices.push(marker2.index);
            childStrings.push("");
            childStrings.raw.push("");
            childCursor = marker2.end;
            continue;
          }
          childStrings[childStrings.length - 1] += childrenSource[childCursor++];
        }
        childrenTemplate = { indices, strings: (
          /** @type {TemplateStringsArray} */
          childStrings
        ) };
        end = close.end;
      }
      outputValues.push({
        type: "component",
        componentIndex: open.componentIndex,
        bindings: parseComponentBindings(open.attributesSource),
        childrenTemplate
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
function lowerComponentValues(compiled, values, createComponentValue) {
  return compiled.values.map((entry) => entry.type === "value" ? values[entry.index] : createComponentValue(entry, values));
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
  if (key != null && typeof key !== "string" && typeof key !== "number")
    throw new TypeError("Pepper component keys must be strings or numbers.");
  return { props, key: (
    /** @type {string | number | undefined} */
    key
  ) };
}

// src/html-brands.js
var FORCE_SYMBOL = /* @__PURE__ */ Symbol("force");
var UNSAFE_HTML_SYMBOL = /* @__PURE__ */ Symbol("unsafe-html");
var UNSAFE_SVG_SYMBOL = /* @__PURE__ */ Symbol("unsafe-svg");
var UNSAFE_MATHML_SYMBOL = /* @__PURE__ */ Symbol("unsafe-mathml");
var RAW_TEXT_SYMBOL = /* @__PURE__ */ Symbol("raw-text");
var commentHolePattern = /⧙⧘\d+⧙⧘/g;

export {
  __export,
  FORCE_SYMBOL,
  UNSAFE_HTML_SYMBOL,
  UNSAFE_SVG_SYMBOL,
  UNSAFE_MATHML_SYMBOL,
  RAW_TEXT_SYMBOL,
  commentHolePattern,
  component,
  isErrorBoundarySignal,
  throwBoundaryError,
  captureBoundaryError,
  runWithOwnerRuntime,
  state,
  createContextValues,
  ref,
  stableId,
  createChildIdPath,
  syncComponentProps,
  createComponentRuntime,
  renderComponentRuntime,
  finalizeComponentRuntime,
  destroyComponentRuntime,
  flushEffects,
  getCurrentOwnerRuntime,
  getOrCreateChildStore,
  compileComponentTemplate,
  lowerComponentValues,
  resolveComponentProps
};
//# sourceMappingURL=chunk-SUTII3DT.js.map
