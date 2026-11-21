# Pepper Architecture and Runtime Review

Original review date: 2026-07-10

## Current status (2026-11-21)

Reviewed through `926365e` on `tests/known-bug-regressions`. All six findings from the 0.4.0 release review are resolved on this branch. The release review has its own numbering. For example, release #2 concerns stale child DOM, while original finding A02 concerns Safari support.

| Release finding | Behavior on this branch | Commit |
| --- | --- | --- |
| #1 — Equal-props root render | Calling `render()` again with equal props preserves the mounted children and their DOM. Pending child updates can still flush. | `09ce239` |
| #2 — Stale child DOM after a local update | A child could replace one element with two while its parent still remembered the first element. A later keyed reorder or removal could then act on stale DOM. Pepper now updates the enclosing templates’ and components’ node lists when the child changes shape. Hydration binds those lists to the live nodes. Browser tests exercise both mount paths, keyed moves, empty output, and sibling identity. | `926365e` |
| #3 — Skipped dirty descendants | When an ancestor and a descendant both have pending work, the ancestor runs first. A descendant still awaiting an update runs even across a clean intermediate component. | `222574b` |
| #4 — Synchronous rendering from an effect | Calling `render()` or `hydrate()` on the root whose effects are running throws. Effects can schedule state updates and render into another root. | `46fc607` |
| #5 — Root props change the output shape | Rendering a mounted root with new props commits the new template, including transitions to and from empty output. | `ade31d8` |
| #6 — Nested SSR resets allocation counters | A nested public serialization restores the outer render’s ID and key allocation state when it exits. | `355d610` |

Two packaging fixes also landed. Strict TypeScript consumers can import the Store declarations from the packed package (`f88e9f4`), and the bundled VS Code extension includes the current template diagnostics (`3aa6d3d`).

**Original review.** A01–A18 have fixes or explicit behavior decisions. A02 was closed by setting the Safari minimum to 16.4, A08 by keeping component closing-tag checks in tooling, and A10 by fixing comparison bugs while retaining deep memoization as the default. The detailed findings and measurements below record earlier branch states. The architecture proposals are design options.

**Other decisions now implemented.** Setup-time `effect()` replaces the lifecycle callbacks. Stable IDs use component ordinals directly. A portal selector must match an element when the portal renders. DOM child types accept insertable nodes, and fragment insertion tracks the children that moved. Event bindings require callable handlers. A `force(value)` wrapper applies to that update only. The browser test command discovers the unit suites, and template lint has a default project.

**Verification at this revision.** Chrome passed 173 tests with one intentional skip for the legacy Safari weak-key reproduction. Node passed 66 SSR, tooling, and regression tests. The build, JavaScript and template lint, and TypeScript checks passed. The Store entry also passed a strict NodeNext consumer check against the packed package.

**Remaining work.** Safari 16.4 and QuickJS execution are outside those verification results. The optional compile-time template metadata and low-level HTML entry remain design proposals. The shared-range and separate-hydration prototypes were measured and reverted. Published bundle size at this revision has yet to be remeasured.

## Runtime Cleanup Pass (2026-08-22)

The first low-risk cleanup pass used standalone esbuild bundles with
`--bundle --minify --format=esm --target=es2022` and gzip level 9 with the
original filename omitted:

| Entry | Before minified | After minified | Before gzip | After gzip |
| --- | ---: | ---: | ---: | ---: |
| Browser | 34,817 B | 34,696 B | 11,418 B | 11,388 B |
| SSR | 17,972 B | 17,266 B | 6,318 B | 6,089 B |

The pass fixes memoization for components returning `null`, `false`, an empty
string, or zero by using the render-pass counter as the initialized sentinel.
It also removes the initial property comparison and unused comparison result,
the always-enabled component-node-cache flag, unused utility exports, and
unnecessary class fields. Debug key node arrays are now allocated only when
debug keys are enabled.

Template invocation values now travel directly to update and hydration
methods rather than being stored on the shared `Template`. Besides reducing
state, this prevents a custom element constructor that reenters the same
template site from replacing the outer invocation's values. Focused tests now
cover both falsy component results and this reentrant upgrade case.

All component, known-bug, SSR, tooling, HTML, type, JavaScript lint, and build
checks pass. The wider force suite retains its pre-existing static forced
attribute failure. `lint:templates` still reports its existing fixture and
test diagnostics; its package script also still lacks the required default
TypeScript project argument.

The same pass also adopts React-like child semantics for booleans: `true` and
`false` now render as empty children, while `0` remains visible. This applies
only to text/child interpolation. Attribute strings, DOM properties, events,
and `?boolean` bindings retain their existing behavior. Browser and SSR tests
cover the distinction.

## Compiler and SSR Consolidation (2026-08-22)

Paired component children are now compiled into each component descriptor as a
`SourceTemplate` instead of retaining source text and reparsing it through a
global cache during every render. Component lowering now returns only resolved
values, avoiding a second `{strings, values}` wrapper. SSR root and child
serialization share one render/serialize/error-boundary helper, and SSR no
longer carries the browser-only pending callback queue.

Against the post-cleanup baseline, this measured:

| Entry | Before minified | After minified | Before gzip | After gzip |
| --- | ---: | ---: | ---: | ---: |
| Browser | 34,696 B | 34,587 B | 11,388 B | 11,371 B |
| SSR | 17,266 B | 16,984 B | 6,089 B | 6,015 B |

Component, HTML, SSR, known-bug, typecheck, JavaScript lint, and build tests
passed after the consolidation. The reduction is worthwhile but modest; the
compiler representation change also removes a source-template cache and a
reparse path without introducing a VDOM.

The attempted lazy runtime-collection pass was reverted after measurement. It
made `childStores`, `portals`, `effects`, `refs`, and context dependency sets
optional and queued only components that used effects or context. Behavior tests
passed, but the extra guards increased the browser bundle from 34,587 B /
11,371 B gzip to 34,720 B / 11,414 B gzip, and SSR from 16,984 B / 6,015 B
gzip to 17,056 B / 6,057 B gzip. It remains a plausible memory optimization,
but is not a size optimization and is therefore not retained in the code.

### Post-implementation review

No correctness regression was found in the retained cleanup or consolidation.
A targeted SSR probe covered a component directly nested inside paired
component children, nested paired components, ordinary attributes containing
boolean values, `?boolean` attributes, and boolean values inside nested child
arrays.

The two review follow-ups are fixed. Falsy-result memoization is now tested at
the root with explicit equal-props `render()` calls, which directly exercises
`renderComponentRuntime()`. `componentTemplateCache` now distinguishes a
cached `null` result from an `undefined` miss, so component-free templates are
scanned only once. The cache correction costs 9 minified bytes in both bundles:
the browser is now 34,596 B / 11,373 B gzip and SSR is 16,993 B / 6,025 B gzip.

## Bundle Architecture Follow-Up

Production measurements after A04/A05 use esbuild with `--bundle --minify
--format=esm --target=es2022` and gzip level 9:

| Entry/use case | Minified | Gzip |
| --- | ---: | ---: |
| Complete browser entry | 33,557 B | 11,036 B |
| `render` + `state` from browser entry | 31,646 B | 10,457 B |
| `hydrate` + `state` from browser entry | 31,646 B | 10,460 B |
| `html` from browser entry | 28,013 B | 9,377 B |
| Low-level `src/html.js` alone | 16,322 B | 5,519 B |
| Component syntax compiler alone | 3,666 B | 1,524 B |

For comparison, locally bundling current Preact 10.29.7 and HTM 3.1.1 with the
same esbuild and gzip settings produced:

| Preact use case | Minified | Gzip |
| --- | ---: | ---: |
| `render` only | 10,555 B | 4,489 B |
| `render` + HTM | 11,783 B | 5,081 B |
| `render` + HTM + `useState`/`useEffect` | 14,254 B | 6,029 B |
| `render` + HTM + all hook exports | 15,575 B | 6,528 B |
| Full Preact exports + HTM + all hook exports | 16,804 B | 6,941 B |

HTM's prebuilt standalone Preact module is 5,325 B gzip, but embeds the Preact
version shipped in the older HTM artifact rather than current Preact 10.29.7,
so it is not the fairest maintenance-level comparison. Pepper's complete
browser runtime is currently about 4.1-5.0 KB gzip larger than the comparable
current Preact/HTM configurations.

The complete minified bundle is approximately 50.8% DOM template engine,
18.7% browser component integration, 17.6% component runtime, 10.0% runtime
component-tag parser/lowering, and 2.0% utilities/shared brands. These results
rule out export-level tree shaking as the main solution: `render` retains
hydration, and `html` from the browser entry retains most component machinery.

### Recommended Architecture

#### 1. Make DOM ranges the shared primitive

Prototype result: rejected and reverted on 2026-07-13.

The prototype replaced interpolation `insertedNodes`, component ownership weak
maps, ancestor ownership propagation, and `commitRuntimeNodes()` with nested
`DomRange` blocks shared by interpolation sites, template instances, and
components. Measurements used the same single-entry esbuild/gzip command:

| Range prototype | Minified | Gzip-9 (`-n`) |
| --- | ---: | ---: |
| Baseline `6c617cb` | 33,557 B | 11,014 B |
| Shared range prototype | 32,722 B | 10,709 B |
| Reduction | 835 B (2.5%) | 305 B (2.8%) |

The known-browser, component, and low-level HTML suites passed after correcting
one ordering issue. Keyed reorders showed that eager nested-template evaluation
mutates child ranges before the parent captures its old physical order. The
prototype therefore still needed a pre-render node snapshot. Avoiding that
snapshot requires a two-phase evaluate/commit model with pending block output,
which moves Pepper toward retaining a logical render tree and is unlikely to
meet the size goal through this refactor alone.

Because the result missed the predeclared 1 KB gzip threshold by a wide margin,
the runtime changes were reverted. Range unification may still improve
correctness, but it is not a credible primary bundle-size project in the current
eager template architecture. Hydration separation and compile-time template
metadata remain the larger opportunities.

The original hypothesis was that one block/range object could replace
`TemplateInstance.nodes`, `InterpolationSite.insertedNodes`, component
`currentNodes`, boundaries, and ownership maps. The prototype removed the maps
and propagation walk, but it could not remove every physical node snapshot
without changing eager rendering into a two-phase model. The hypothesis was
therefore only partially valid.

#### 2. Separate rendering from forgiving hydration

Prototype result: rejected and reverted on 2026-07-13.

The prototype moved node matching, subtree adoption, custom-element hydration,
event/ref rebinding, and hydration node tracking from `html.js` into an installed
`html-hydrate.js` module. Component hydration moved to an
`@pepper-js/pepper/hydrate` entry while the main entry became render-only.

| Hydration split | Minified | Gzip-9 (`-n`) |
| --- | ---: | ---: |
| Current combined baseline | 33,557 B | 11,014 B |
| Render-only main entry | 30,695 B | 10,268 B |
| Main entry plus hydration | 33,778 B | 11,122 B |

The render-only SPA saving was 2,862 minified bytes but only 746 gzip bytes
(6.8%). An SSR client importing hydration became 221 minified bytes and 108
gzip bytes larger because it retained the complete algorithm plus module-hook
plumbing. Type checking and 95 active low-level/component/known browser tests
passed.

The split was reverted because it missed the predeclared 1 KB SPA threshold,
made the primary SSR use case larger, and required a breaking hydration import.
The result establishes that the current hydration implementation is not a large
enough independently compressed subsystem to drive the requested bundle target.

Hydration is currently inseparable from rendering. `hydrateInstance`, subtree
adoption, custom-element handling, event/ref rebinding, and structural hydration
reconciliation remain in bundles importing only `render`.

Move hydration to an optional `@pepper-js/pepper/hydrate` entry using the same
range/template primitives. The render-only graph must not reference hydration
functions or carry a `hydrateOnly` branch through `mountRoot`, because bundlers
currently retain both paths.

Preact 10 demonstrates that forgiving hydration is not intrinsically large when
hydration is only a mode of the normal reconciler. Its VNode tree already
supplies child order, output counts, fragment/component ownership, and logical
positions for empty children. Pepper instead has a normal DOM reconciler plus a
hydration reconciler, adoption maps, instance absorption, and rebinding.

The split measurement means hydration should remain integrated unless its
semantics are deliberately reduced for another reason. An exact-skeleton or
whole-block fallback contract could remove more code, but would trade behavior
rather than merely improve module boundaries. SSR markers are not required
merely because adjacent ranges exist when client hydration executes the render
results and knows their expected shapes; they become necessary only for
hydration that does not execute those results, or for deterministic recovery
when server and client range shapes disagree.

#### 3. Compile Pepper templates, not JSX

The runtime component-tag parser costs 1.5 KB gzip in isolation, before browser
glue. The existing analyzer and VS Code tooling already understand Pepper tagged
templates. Extend them with an optional build transform that lowers Pepper
templates to precomputed template metadata and component descriptors.

This does not introduce JSX or a virtual DOM. Native template cloning and direct
interpolation updates remain the runtime model. It removes runtime source
scanning, dynamic component open/close parsing, attribute placeholder rewriting,
and site discovery from compiled applications.

Ship two explicit tiers: a compiled core for applications optimizing size and
QuickJS parse/startup cost, and a runtime-template compatibility entry for
CDN/no-build use. Both must feed the same template/range implementation rather
than becoming two renderers. A compiled full-browser target of 6-8 KB gzip is
plausible but must be proven with a representative transformed application.

#### 4. Expose honest feature entry points

Add a public low-level HTML entry. Today `html` from the browser root is 9.38 KB
gzip while the low-level engine is 5.52 KB. Users who do not need components
cannot express that choice through package exports.

One possible package shape is:

```text
@pepper-js/pepper/html       direct DOM templates
@pepper-js/pepper            render-only components
@pepper-js/pepper/hydrate    hydration-enabled components
@pepper-js/pepper/runtime    runtime template/component compiler
@pepper-js/pepper/ssr        SSR
```

Portals, context, refs, stable IDs, and error boundaries are individually too
small or too intertwined to justify plugin APIs first. Splitting them before
ranges, hydration, and compilation would add public complexity without reaching
the requested reduction.

### Packaging Finding

The published build is currently unminified and code-split with SSR. The browser
`dist/index.js` plus its shared chunk total about 18.6 KB when each file is
gzipped. A minified split build is about 12.0 KB gzip, while a single minified
browser-only bundle is 11.0 KB because gzip can exploit repetition across the
former chunk boundary.

Minifying and building the browser entry separately is worth doing, but it is a
distribution correction rather than the architectural reduction requested. It
should not count toward a 6-8 KB compiled-core target.

### Suggested Order

1. Prototype template metadata for a representative application, then remove
   runtime component syntax and site discovery from that compiled bundle.
2. Decide whether the default package favors no-build convenience or compiled
   size; document both sizes rather than averaging them.
3. Revisit shared ranges only for correctness or if a two-phase block model can
   replace substantially more machinery than the rejected eager prototype.

Small syntax tricks, shorter names, helper inlining, and isolated feature cuts
will not move an 11 KB bundle far enough. After both runtime refactors missed
their thresholds, the remaining credible size route is build-time Pepper
template metadata.

### Effect and Dynamic Context Refactor

The lifecycle/context redesign is implemented on `tests/known-bug-regressions`.
`onMount` and `onProps` were removed without compatibility aliases and replaced
by setup-time `effect(handler, getDependencies?)` registration. Effects run only
after successful browser commits, compare dependency entries with `Object.is`,
receive current and previous dependency arrays, clean up before rerunning and on
component destruction, propagate errors through component boundaries, and do
not execute during SSR.

Browser runtimes now track root-context keys read during component render and
effect dependency resolution. Replacing root context compares both key presence
and value identity, then directly dirties only subscribed component runtimes;
clean memoized ancestors and siblings are bypassed. Dependencies are reconciled
after each commit, so consumers stop reacting to keys they no longer read.

Measured with the same standalone esbuild/minify/ES2022 and gzip-9 commands used
for A11:

| Entry | Before minified | After minified | Delta | Before gzip | After gzip | Delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Complete browser | 33,872 B | 34,817 B | +945 B | 11,143 B | 11,418 B | +275 B |
| Complete SSR | 17,703 B | 17,972 B | +269 B | 6,250 B | 6,318 B | +68 B |

The final implementation also removes the old mount handler/cleanup queues,
prop-notification buffers, SSR mount queue, and an unused descendant-dirty flag.

## Scope

This review covers the browser-side view library and the related SSR, component,
store, hydration, and tooling features documented in `README.md`.

The review focused on:

1. Observable bugs and missing edge-case handling.
2. Design trade-offs, especially pseudo-hydration and marker avoidance.
3. Ways to reduce the logical size of the implementation without adopting JSX
   or a virtual DOM.
4. Whether the current architecture remains suitable for constrained server-side
   JavaScript engines such as QuickJS.

The initial review was completed without changing the implementation. This
branch now includes permanent regression tests for the findings and documents
Safari 16.4 as the minimum supported version.

## Executive Summary

Pepper's direct-DOM template model is a reasonable foundation. A virtual DOM is
not needed to address the problems found in this review, and adding one would
introduce server-side allocation and traversal costs that conflict with the
project's goals.

The most important original design gap was explicit ownership of a dynamic DOM
range. Ownership is spread between interpolation text nodes,
`insertedNodes`, component `currentNodes`, nested template caches, portal state,
and hydration adoption maps. This branch now closes the child-local root-change
case with stable component boundaries and synchronized interpolation ownership,
and top-level dynamic hydration now retains a live range. Broader range
unification remains open.

The recommended direction is a direct-DOM `ChildPart` or range abstraction. It
would own a parent, an end boundary, and its current nodes. Components, nested
templates, unsafe content, portals, and error boundaries could all commit through
the same mechanism. This is not a VDOM: it is explicit ownership metadata for
the real DOM.

The original review identified two packaging and compatibility blockers. Both were addressed.

- The browser and SSR entrypoints originally did not share component runtime
  state or branding symbols. This branch now emits them through one shared
  chunk, and the README's isomorphic import pattern works against `dist`.
- The browser runtime uses `Symbol` values as `WeakMap` keys, which was
  incompatible with the previous Safari 15.6 support claim. The documented
  minimum is now Safari 16.4, the first Safari release with this feature.

## Confirmed Findings

### 1. Critical: Published Browser Helpers Do Not Work During SSR

Resolution status: fixed on `tests/known-bug-regressions`. Browser and SSR are
now built as code-split entrypoints with shared component runtime state and
shared force/trusted-value brands. Seven active integration tests exercise the
published `dist` files.

Previously, the build script bundled `src/index.js` and `src/pepper-ssr.js`
independently. Each output therefore contained a separate copy of
`component-runtime.js`, with separate values for:

- `currentSetupRuntime`
- `currentOwnerRuntime`
- `COMPONENT_SYMBOL`
- the trusted-value branding symbols from the two HTML implementations

This differs from the source tests, where browser and SSR modules share one
source module graph.

The README imports `state`, `ref`, and `stableId` from the browser package root,
then passes the component to `renderComponentToString()` from the SSR entrypoint.
Against the built artifacts, that pattern produced these results:

- Browser `state()` threw because its copy of `currentSetupRuntime` was `null`.
- Browser `stableId()` threw for the same reason.
- Browser `portal()` threw because its owner-runtime copy was `null`.
- Browser `unsafeHTML()` serialized as `[object Object]` because the SSR bundle
  did not recognize its symbol brand.
- A component wrapped with browser `component(..., { errorBoundary: true })`
  lost its boundary metadata when rendered by the SSR bundle.

Originally affected code:

- `package.json:33`
- `src/component-runtime.js:3-15`
- `src/html.js:44-48`
- `src/html-ssr.js:5-10`

Implemented fix:

- Build browser and SSR entrypoints together with code splitting so shared
  runtime state is emitted once.
- Move force and trusted-value brands into `src/html-brands.js`; component
  metadata is shared through the common `component-runtime.js` chunk.
- Cover browser-imported state, refs, stable IDs, portals, error-boundary
  metadata, and every value brand through `dist` integration tests.

A neutral component entrypoint and renderer-neutral portal descriptors remain
possible API cleanups, but they are not required for runtime correctness after
the shared module graph fix.

### 2. Critical: Safari 15.6 Cannot Use the Current Template Keys

Resolution status: addressed by raising the documented minimum from Safari
15.6 to Safari 16.4. The symbol-key implementation and API remain unchanged.

`Template.instances` is a `WeakMap` while internal view keys default to
`Symbol()` values:

- `src/html.js:191`
- `src/html.js:291-292`
- `src/component-runtime.js:425`

Symbol weak keys were a later ECMAScript addition. Safari 15.6 shipped on July
20, 2022, while WebKit's implementation landed afterward in August 2022.

Sources:

- [Safari 15.6 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-15_6-release-notes?changes=latest_minor)
- [WebKit features in Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
- [WebKit symbol WeakMap implementation](https://github.com/WebKit/WebKit/commit/290c0b91225ac430d66b4fff9a4f6606b063ba5d)
- [TC39 symbols-as-weakmap-keys proposal](https://github.com/tc39/proposal-symbols-as-weakmap-keys)

The public `TemplateKey` type also accepts any symbol. Registered symbols such
as `Symbol.for('key')` cannot be held weakly even in implementations that
support unique symbols as weak keys, so callers should use unique symbols.

Compatibility decision:

- Retain symbol keys and raise the Safari minimum to 16.4.
- Keep the Safari 15.6 reproduction skipped as documentation of the reason for
  the version floor.
- Add a Safari 16.4 CI job so the declared minimum is exercised on releases.

This keeps the implementation smaller and avoids introducing a second key path
or a strongly held symbol-to-object compatibility cache.

### 3. High: Child-Local Updates Cannot Change Root Template Shape

Resolution status: fixed on `tests/known-bug-regressions`. Nested components now
retain an empty text boundary, local commits reconcile before that boundary,
and a weak node-to-site map updates the outermost interpolation ownership list.
Ancestors do not rerender.

Follow-up ref audit: fixed with an explicit active/inactive lifecycle on
`TemplateInstance`. Inactive cached templates retain binding state without
claiming refs; deactivation conditionally releases refs still owned by that
template, and activation reapplies refs regardless of binding equality. Nested
template instances participate recursively.

Previously, the scheduler directly rendered dirty descendants in
`flushDirtyRuntimes()` so
that ancestor component models do not rerender. This optimization works when a
child continues to return the same template site because that template instance
patches its already-mounted nodes.

It does not work when the child changes template sites. For example, a child
switching from:

```js
return html => getOn() ? html`<strong>on</strong>` : html`<em>off</em>`
```

created the new `<strong>` in a detached template fragment while leaving the
mounted `<em>` unchanged.

Relevant code:

- `src/index.js:276-315`
- `src/index.js:288-299`

A related case also leaked DOM:

1. A child initially rendered an empty top-level dynamic hole.
2. A local update changed it to a nested `<b>` template.
3. The parent later removed the child.
4. The old text anchor was removed, but the `<b>` remained because the parent
   never learned that it belonged to the child range.

Implemented fix:

- Give every nested component one stable empty text boundary.
- Track the outermost interpolation site that mounted each boundary.
- Reconcile physical template roots, including internal interpolation anchors,
  before the component boundary and replace the matching parent-owned segment.
- Propagate ownership through component-only parents without rerendering them.
- Cover distinct templates, empty and multi-root output, nested templates,
  component-only roots, batched keyed siblings, and later parent removal.
- Deactivate and reactivate root and nested template instances so cached roots
  reclaim shared refs and omitted refs are cleared from detached nodes.

### 4. High: Component-Only Template Fast Path Breaks Identity

Resolution status: fixed on `tests/known-bug-regressions`. Component-only
templates now use the normal template engine, so interpolation-site keys remain
stable across parent renders and the standard hydration path receives live
nodes. Nested templates retain their physical empty-text interpolation
boundaries so keyed reorders reconcile against the live DOM.

When every lowered template string is empty, `createDomTags()` uses a custom
component-only renderer instead of the normal template engine:

- `src/index.js:117-130`

Its `keyedInstanceIds` map belongs to the newly created view function. When a
parent rerenders and returns a new view function, unkeyed instance symbols are
regenerated. As a result, an unkeyed child in a component-only template is
destroyed and recreated instead of receiving updated props.

This behavior also masked comparator behavior in initial adversarial tests by
remounting the child before `onProps` could run.

The fast path also accepts only `key`, not `liveNodes`, so it cannot hydrate a
component-only root. A server-rendered live button remained unbound after
hydration and clicking it did not update state.

Recommended fix:

- Remove the component-only fast path.
- Route component values through the same child-part/range machinery as all
  other text-content renderables.

### 5. High: Top-Level Dynamic Hydration Loses Rendered Nodes

Resolution status: fixed on `tests/known-bug-regressions`. Hydration reconciles
against `getRenderedNodes(true)`, adopting rendered dynamic nodes while
inserting the empty-text boundaries required for later range updates. Direct
coverage verifies both node adoption and a subsequent template replacement.

`Template.hydrateInstance()` applies values and then reconciles live nodes
against `templateInstance.nodes`:

- `src/html.js:542-570`

`templateInstance.nodes` contains the original template roots. It does not
substitute nodes inserted by a top-level dynamic text site. Therefore this
low-level case removed the server-rendered span:

```js
html`${html`<span>live</span>}`(key, liveNodes)
```

Using `getRenderedNodes()` as the hydration target is not sufficient by itself.
The interpolation's hidden text anchor would still remain in the detached
fragment, leaving later updates without a live insertion boundary.

This exposes the central hydration constraint: markerless hydration cannot
always infer how a server-rendered sequence should be partitioned between
adjacent or empty dynamic holes.

Recommended fix:

- Store a live parent/end-boundary range on each claimed child part.
- Emit SSR markers only for ambiguous dynamic ranges, such as adjacent holes,
  empty holes, and multi-node top-level holes.
- Use a following static node as the end boundary when one exists.
- Bail out at the smallest static subtree on irrecoverable structural mismatch.

### 6. High: Error Boundaries Do Not Cover DOM Realization

Status: fixed on 2026-07-13 and migrated to the effect API on 2026-08-22.
Unsupported event values were reclassified as handler removal. Effect callback,
effect cleanup, nested-renderable, property setter, and portal realization
failures now have active regression coverage.

The component runtime originally caught errors thrown while executing component
setup and the component model's `render()` method, but not consistently while
applying the returned template to DOM.

`createDomComponentValue()` wrapped component creation, while the subsequent
`realizeDomRenderable()` call was outside boundary conversion.

The original regression used an invalid event value:

```js
html`<button @click=${123}>broken</button>`
```

Design correction: this should not be an error-boundary case. Pepper should
treat unsupported event-handler value types as no handler rather than throwing
during template application. Treating them as removal is safer than preserving
a stale previous listener. Functions and Pepper's existing string-handler form
remain valid.

The independent DOM-realization gap allowed a nested renderable function that
threw while an interpolation was being applied to escape as a raw error.

Errors that escaped included:

- nested renderable failures;
- throwing custom-element property setters;
- portal target resolution failures.

Implemented behavior:

- Unsupported event-handler values now remove the current listener without
  throwing. Functions and strings remain the supported handler forms.
- Effect callbacks route failures to the nearest ancestor boundary after DOM
  commit. Later component effects remain queued, and a boundary cannot catch an
  error from its own effect.
- Effect cleanups run to completion across each changed or removed set even when
  one cleanup throws, then propagate the failure to the nearest boundary that
  remains mounted. Root boundaries, nested boundary removal, dependency changes,
  and repeated cleanup failures during scheduled updates have active coverage.
- Component DOM realization now uses one boundary-aware operation for initial,
  parent-driven, root, and independently scheduled renders. Ordinary failures
  become boundary signals attributed to the component whose returned subtree
  was being applied; existing signals pass through unchanged. This catches
  nested renderables, custom-element setters, and portal target failures while
  ensuring a boundary cannot catch its own realization error. Failed portal
  output is removed when the boundary destroys the failed subtree.

The behavior follows Preact 10.29.1: its component `diff()` encloses rendering
and child DOM diffing in one `try`, then `_catchError()` starts searching from
the throwing component vnode's parent. Pepper retains direct DOM templates but
now applies the same ownership rule.

Event-listener callback errors remain excluded, as documented.

### 7. Medium: Browser Template Preprocessing Misparses Quoted `>`

Status: fixed on 2026-07-13 by adapting the experimental parser's start-tag
grammar. The complete browser bundle increased by 71 minified bytes and 56
gzip-9 bytes.

`HTML_TAG_REGEXP` is:

```js
/<[^<>]*?\/?>/g
```

It terminates on `>` even when the character is inside a quoted attribute. For
this template:

```js
html`<div title="a > b" .someProp=${42}></div>`
```

the preprocessor failed to preserve `someProp` casing. The browser parser
lowercased it and Pepper assigned `someprop` instead.

Relevant code:

- `src/html.js:220-223`
- `src/html.js:327-409`

An earlier experimental parser at
`~/Projects/devlab/parser-html-to-vdom-test/parse-html-sax-3.js` contains a
better start-tag grammar. Its start-tag branch correctly treats `>` and `<`
inside single- or double-quoted values as content, only matches tags beginning
with an ASCII letter, and accepts Pepper property, event, forced, spread,
custom-element, namespace, and interpolation-marker syntax.

The complete SAX wrapper should not be imported into the browser runtime. It
assumes balanced valid input, has incomplete multiline comment/CDATA handling,
can fail when a raw-text close tag is absent, and treats `<template>` as raw
text. Pepper delegates tree construction and error recovery to the browser's
HTML parser, so A07 only needs the quote-aware start-tag extraction branch.

Implemented fix:

- Adapt the experimental parser's start-tag expression for the preprocessing
  pass, rather than importing the tooling analyzer or full SAX parser.
- Retain the existing stateful attribute transformer inside each matched start
  tag; it already avoids rewriting special syntax inside quoted values.
- Active regressions cover single/double quotes, quoted `<`, properties, forced
  properties, custom events, spreads, repeated delimiters, binding position,
  and SVG/MathML modes.

### 8. Medium: Component Closing Tags Are Not Matched by Identity

Status: reclassified as a non-issue on 2026-07-13. The runtime intentionally
treats dynamic closing expressions as balanced delimiters, while template
tooling applies the stricter authoring rule.

`findMatchingComponentClose()` tracks nesting depth and accepts any dynamic
component closing tag at the matching depth:

- `src/component-syntax.js:125-149`

The following malformed structure rendered successfully instead of failing:

```js
html`<${A}><${B} /></${B}>`
```

This is deterministic and does not affect component ownership: the opening
expression selects the component and the closing expression only terminates its
lazy children range. The depth counter is equivalent to a stack of anonymous
component openings and permits HTML-like runtime recovery.

The tooling analyzer maintains an identity-aware stack and reports
`pepper/mismatched-closing-tag` when opening and closing expression text differs.
This is available through the editor diagnostics and `npm run lint:templates`;
the default `npm run lint` does not currently run template diagnostics.

No runtime or README change is required.

### 9. Fixed: Custom Props Comparator Bookkeeping Was Incorrect

`syncComponentProps()` previously recorded removed props before consulting the
custom comparator. Therefore a comparator returning `true` could not suppress a
rerender caused by prop removal.

When the comparator returned `false`, newly added props were pushed once by the
addition-specific code and again by the general reference comparison.

Relevant code:

- `src/component-runtime.js:341-381`

The custom comparator contract now removes that ambiguity: it returns `true` or
an empty array when the props are equivalent, and otherwise returns the prop
names it considers changed. The list now controls only the rerender decision;
the removed `onProps` API no longer requires prop-name bookkeeping. Stored props
are updated even on a bailout, so removed props cannot remain stale. Invalid
legacy boolean results fail with a clear error.

Lazy component children remain a framework-detected exception. Their public
`children` prop is a stable closure over separately stored interpolation values,
so Pepper appends `children` when those values change because the comparator
cannot observe that change from its two prop objects.

### 10. Fixed Correctness Bugs; Design Trade-off Remains: Default Deep Memoization

The default comparison previously traversed arrays and plain objects without
cycle detection:

- `src/utils.js:52-87`

Consequences included:

- separately allocated cyclic but equivalent props overflow the stack;
- large prop graphs are traversed for every memoized child on parent updates;
- arrays with holes were compared incorrectly because `Array#every` skips holes;
- maps, sets, typed arrays, and most class instances are only reference-compared,
  despite the README describing the behavior as a deep comparison;
- the `constructor` property was excluded from equality entirely.

The correctness failures are fixed conservatively. A repeated object on the
active recursion path now makes separately allocated values compare unequal,
so cyclic structures rerender rather than overflowing or claiming equality.
Arrays compare length and enumerable own-key presence, distinguishing holes
from explicit `undefined`; an explicit array-brand check rejects objects forged
with `Array.prototype`. Equality uses `Object.keys()` so `constructor` is
ordinary data. Primitive comparison now consistently preserves `Object.is`,
including the distinction between `0` and `-0`.

The final implementation changed the shared runtime chunk by +38 minified bytes
and -7 gzip-9 bytes in the A09-to-A10 isolated build comparison.

The performance policy remains a design trade-off. Large acyclic prop graphs
are still traversed, and maps, sets, typed arrays, and most class instances
remain reference-compared. This can cost more than rendering a small direct-DOM
component on a less capable engine, but unsupported structures fail
conservatively by rerendering rather than producing stale DOM.

Implemented approach:

- Preserve structural comparison for arrays, plain and null-prototype objects,
  dates, and regular expressions.
- Use reference identity for unsupported object categories.
- Treat cycles conservatively as unequal instead of adding graph-isomorphism
  bookkeeping.
- Precisely document the supported categories in the README.

Changing the default to per-prop `Object.is` and making structural comparison
explicit remains a possible future size/performance decision, but is not needed
for A10 correctness.

#### Dequal evaluation

`dequal` 2.0.3 is MIT-licensed and compact (the published minified full and
lite builds measured 576 and 391 bytes respectively with gzip level 9). Its
full implementation adds structural support for maps, sets, array buffers,
data views, typed arrays, and class instances, but it is not a drop-in A10 fix:

- separately allocated cyclic values still end in a `RangeError`;
- a sparse array compares equal to an explicit `undefined` element;
- maps with different primitive keys and `undefined` values can compare equal
  because the primitive-key path does not verify `Map#has`;
- it starts with `===`, so it treats `0` and `-0` as equal rather than using the
  `Object.is` behavior now enforced by Pepper;
- it compares constructors rather than exact prototypes.

If Pepper retains default structural comparison, use dequal as a reference
rather than an unchanged dependency. A vendored adaptation should preserve
`Object.is` and exact-prototype semantics, distinguish array property presence,
verify map-key presence, and either track object pairs or conservatively return
false when recursion encounters a cycle. A substantial source adaptation must
retain dequal's MIT copyright and license notice.

### 11. Fixed: Stable IDs Collided Across Keys and Component Sites

`createChildIdPath()` serializes a keyed component with `String(key)`:

- `src/component-runtime.js:305-310`

The component instance map still treats these as distinct keys, but their ID
paths collide. Confirmed examples include:

- two distinct object keys, both serialized as `[object Object]`;
- numeric `1` and string `'1'`;
- distinct symbols with equal descriptions.

Two keyed rows can therefore receive the same `stableId()`.

There is a second, more fundamental collision. `descriptorIndex` is only the
index within one compiled template's lowered values, so two distinct nested
template sites under the same component owner can both be `c0`. Their runtime
stores are separate because those are keyed by descriptor identity, but their
ID paths are not. This SSR example emitted the same ID twice even with a valid
string key:

```js
html`<div>${html`<${Row} key=${'same'} />`}${html`<${Row} key=${'same'} />`}</div>`
```

The path currently conflates two responsibilities: `key` identifies a runtime
within one reconciliation site, while `stableId()` needs a unique component
position within its owner. Keys only need to be unique within their own list or
site, so key serialization cannot supply the latter.

Preact 10.29.1 does not enforce a string/number key contract. VNode creation
stores the original key value, and child reconciliation compares keys with
loose equality. An object key therefore remains an object and only matches the
same object identity; it becomes `[object Object]` only when something formats
it as text. Preact's public key types also effectively permit arbitrary values.
Restricting Pepper keys would be a deliberate stricter contract, not required
for parity once stable-ID paths stop serializing keys.

The implementation now separates those responsibilities:

- component keys are restricted to strings and numbers;
- duplicate keys at one descriptor site throw in browser and SSR rendering;
- keys are no longer serialized into stable-ID paths;
- each newly created child runtime receives a persistent owner-local `cN`
  ordinal, producing conceptual paths such as `r-c1-c4`;
- reused keyed runtimes retain their paths across insertion and reordering;
- server rendering and initial hydration allocate the same hierarchical paths;
- the same key remains valid at separate component descriptor sites;
- `identifierPrefix` continues to separate multiple roots.

Regression coverage includes numeric and string keys with the same textual
form, two distinct nested template sites both locally numbered `c0`, browser
and SSR duplicate/invalid keys, SSR-to-hydration parity, and insertion without
changing existing keyed child IDs.

Measured against the preceding A10 commit (`a5a3248`) with esbuild bundling,
minification, ES2022 targeting, and gzip level 9 without filename metadata:

| A11 bundle impact | A10 | A11 | Delta |
| --- | ---: | ---: | ---: |
| Complete browser, minified | 33,808 B | 33,872 B | +64 B |
| Complete browser, gzip | 11,141 B | 11,143 B | +2 B |
| Complete SSR, minified | 17,414 B | 17,703 B | +289 B |
| Complete SSR, gzip | 6,129 B | 6,250 B | +121 B |
| Shared production chunk, minified | 11,129 B | 11,097 B | -32 B |
| Shared production chunk, gzip | 4,135 B | 4,114 B | -21 B |

The browser cost is effectively neutral. SSR pays for per-render duplicate-key
tracking because it creates fresh child runtimes rather than retaining the
browser renderer's keyed child stores. Reusing those stores would reduce code
but retain every rendered child runtime until its parent finishes serializing,
which is a poor memory trade-off for the QuickJS target.

#### Hash finalization follow-up

The stable-ID path hash is 32-bit FNV-1a with a `0xff` segment separator; it
does not currently apply MurmurHash3's `fmix32`. `fmix32` was designed to force
all output bits to avalanche, and it substantially decorrelates hashes of
neighboring sequential paths. However, its xor-shifts and multiplications by
odd constants are each invertible over 32-bit words, so the whole finalizer is
a permutation. Consequently:

```text
fmix32(fnv(a)) == fmix32(fnv(b)) exactly when fnv(a) == fnv(b)
```

It therefore preserves every full-width FNV collision and cannot lower
duplicate DOM-ID risk when Pepper emits all 32 hash bits. SMHasher results do
show weak FNV-1a avalanche and elevated collision counts for some structured
key sets, but adding only `fmix32` addresses appearance/distribution, not those
existing collisions. If collision risk is unacceptable, the effective fixes
are a wider hash or a collision-free encoding/allocation scheme, not a
bijective 32-bit finalizer.

A reproduction using Pepper's exact path encoding over one million inputs
confirmed the distinction:

| Generated paths | FNV-1a collisions | FNV-1a + `fmix32` collisions |
| --- | ---: | ---: |
| `['c0']` through `['c999999']` | 0 | 0 |
| Cartesian `['c0'..'c999', 'c0'..'c999']` | 24 | 24 |
| `['c0','c1','c2','c3','c0'..'c999999']` | 0 | 0 |

The structured two-level family demonstrates a real FNV collision concern,
while the unchanged count after finalization demonstrates why `fmix32` is not
a collision fix.

Sources: the [original MurmurHash3
implementation](https://chromium.googlesource.com/external/smhasher/+/e813f9b95be7adad5a2e441f4484278c453e5261/MurmurHash3.cpp#50),
[SMHasher's FNV-1a results](https://raw.githubusercontent.com/rurban/smhasher/master/doc/FNV1a.txt),
the [SMHasher test definitions](https://github.com/aappleby/smhasher/wiki/SMHasher),
and the [IETF FNV draft](https://datatracker.ietf.org/doc/draft-eastlake-fnv/35/).

### 12. Fixed: Repeated Root Rendering Did Not Refresh Context

Resolution status: fixed on `tests/known-bug-regressions`.

`mountRoot()` now rebuilds root context on repeated calls, compares the union of
old and new keys by presence and `Object.is`, and dirties only runtimes registered
for changed keys. `getContext()` and `hasContext()` reads are tracked during
render and effect dependency resolution, then reconciled after commit. Direct
dirty-runtime rendering lets consumers update below clean memoized ancestors.

The clarified API contract remains that `getContext()` must be called when the
value is needed, normally during `render()` or an effect dependency function.
Capturing its result in the once-only setup function is a stale-closure error,
just as capturing current props instead of calling `getProps()` would be.

`identifierPrefix` has the same mount-time constraint: existing `stableId()`
strings were created during setup and cannot be retroactively prefixed. The
current repeated-render path nevertheless replaces `identifierPrefix`, so a
later-created child can use a different prefix from existing children. Root
options and context now both use full-snapshot semantics, but identifier-prefix
changes after mount remain a separate design gap.

Active regressions cover context-only updates with identical props, consumers
below memoized ancestors, non-consumer siblings, missing versus present
`undefined`, unchanged values, dependency-key switching, Store replacement and
effect resubscription, and SSR non-execution. Omitting `options.context` supplies
an empty context map, matching the existing full-snapshot behavior of root
options.

Preact does not have an equivalent root-context option. Its context Provider is
a component in the VDOM tree. The Provider retains a subscriber set and
force-enqueues those consumers when its `value` changes, so updates bypass
memoized intermediate components. `useContext()` subscribes the current
component and reads the Provider's current prop. Preact function components are
also invoked again during an accepted diff while hook state is retained in a
separate backing component. Re-rendering the same root with a new Provider
value can therefore update captured render locals without remounting the tree.

Refreshing component output alone cannot move arbitrary subscriptions that
application code attached to an old context value. Pepper now handles this with
an effect whose dependency function returns the Store; cleanup detaches the old
Store before the callback attaches the replacement. As in Preact, omitting that
dependency remains an application bug. The equivalent Preact code is:

```js
const store = useContext(StoreContext)
useEffect(() => {
  const unsubscribe = store.subscribe(listener)
  return unsubscribe
}, [store])
```

When the Provider value changes, Context forces the consumer to render.
`useEffect()` detects that `store` differs, and after commit Preact invokes the
old cleanup before invoking the new effect. On a true unmount/remount, Preact
invokes every hook cleanup during unmount. An empty dependency list would still
be an application bug; Preact cannot infer the missing Store dependency.

Sources: Preact 10.29.1's
[effect dependency check](https://github.com/preactjs/preact/blob/10.29.1/hooks/src/index.js#L281-L305),
[cleanup/effect invocation](https://github.com/preactjs/preact/blob/10.29.1/hooks/src/index.js#L447-L455),
and [unmount cleanup](https://github.com/preactjs/preact/blob/10.29.1/hooks/src/index.js#L114-L130).

Sources: Preact 10.29.1's
[Provider implementation](https://github.com/preactjs/preact/blob/10.29.1/src/create-context.js),
[context lookup and component diff](https://github.com/preactjs/preact/blob/10.29.1/src/diff/index.js),
[useContext implementation](https://github.com/preactjs/preact/blob/10.29.1/hooks/src/index.js),
and [root render implementation](https://github.com/preactjs/preact/blob/10.29.1/src/render.js).

### 13. Medium: Native Property Hydration Policy Is Too Broad

Fixed in `f309e1a`. On hydration the template supplies the value of each bound DOM property, including a bound form value that a user edited before hydration.

**Original finding**

During hydration, property bindings are replayed onto adopted custom elements
but skipped for all native elements:

- `src/html.js:1191-1202`

This preserves user-mutated form state, which is a valuable behavior. However,
it also prevents initialization of native properties that have no useful SSR
attribute representation, such as:

- `indeterminate`;
- `srcObject`;
- some media and imperative DOM state.

Recommended fix:

- Preserve an allowlist of user-owned form properties such as `value`,
  `checked`, selection state, and possibly scroll state.
- Replay other native property bindings onto adopted nodes.
- Allow an explicit forced property binding to opt into initialization.

### 14. Medium: Static Forced Attributes Fail Their Existing Test

Resolved in `8bc9d61`. A literal such as `!class="x"` is invalid and template tooling flags it. Use `!class=${name}` to reapply a binding on every update. Multiple spreads and attributes after a spread are supported in source order. The last binding wins.

**Original finding**

`findInterpolationSites()` iterates the live `element.attributes` collection.
For a static forced regular attribute, it adds the processed attribute during
that iteration:

- `src/html.js:628`
- `src/html.js:691-693`

The newly added normal attribute can also be visited and recorded. Its unforced
binding then overwrites the forced binding in the per-element map. The existing
test for `!class="same-class"` expects a same-value mutation on rerender but does
not observe one.

Recommended fix:

- Iterate over a snapshot of attributes.
- Avoid mutating the template element until discovery is complete.
- More generally, compile one ordered binding program per element instead of
  one site object per attribute.

### 15. Medium: SSR `rawText` Is Context-Dependent but Unrestricted

Fixed in `13bf8b5`. SSR serializes `rawText()` according to the enclosing HTML context. In a normal element, angle brackets remain text after parsing.

**Original finding**

In the browser, `rawText('<b>x</b>')` becomes a text node containing literal
angle brackets. In SSR, the same value inside a normal `<div>` is emitted
unescaped and becomes real `<b>` markup:

```html
<div><b>x</b></div>
```

Relevant code:

- `src/html.js:130-149`
- `src/html-ssr.js:559-568`

`rawText` is meaningful for script/style/textarea/title-like raw-text contexts,
but its SSR escaping strategy is not generally correct for every one of those
contexts. For example, JavaScript `\x3C` escapes are not valid JSON escapes and
do not preserve CSS semantics.

Recommended fix:

- Restrict `rawText` to explicitly recognized raw-text element contexts.
- Split helpers by intended content, such as JavaScript source versus JSON
  script data, if both are required.
- Escape normal-element text consistently with the browser renderer.

### 16. Low/Medium: Interpolations in Comments Leak Internal Markers

Fixed in `677d685`. Comment holes omit the internal marker and template tooling reports the unsupported interpolation.

**Original finding**

Both browser and SSR template compilers leave interpolation markers inside HTML
comments rather than evaluating or rejecting the interpolation. SSR produced:

```html
<!-- ⧙⧘0⧙⧘ -->
```

The value itself was not leaked, but the internal marker was emitted into
output. Component syntax and the tooling scanner also disagree about comment
handling.

Recommended fix:

- Reject interpolations in comments with a clear diagnostic, or define an
  explicit comment interpolation behavior shared by all compilers.

### 17. Low/Medium: Store Edge Cases and Prototype Mutation

Fixed in `c2a26ab` and `3f06fae`. Construction, data replacement, and `assign()` reject an own `__proto__` key before applying changes. `constructor` and `prototype` remain ordinary data keys. Store compares values with `Object.is` and has direct regression coverage.

**Original finding**

`Store` uses a shared `keys()` helper that removes the key `constructor`.
Subscribers therefore do not receive changes to a documented top-level data
key named `constructor`.

`Store.assign()` also calls `Object.assign()` on the existing data object. An
own `__proto__` property from parsed input can change that data object's
prototype. This did not pollute `Object.prototype`, but it made inherited
attacker-controlled values visible through `store.data`.

Relevant code:

- `src/utils.js:23-30`
- `src/store.js:97-103`

Recommended fix:

- Use `Object.keys()` directly for equality and notifications.
- Reject dangerous prototype keys or store data in null-prototype records.
- Use `Object.is` for shallow change detection so `NaN` and signed zero have
  predictable semantics.
- Add direct store unit tests; current store coverage is only through a context
  consumer.

### 18. Design Gap: No Public Root Unmount API

Fixed in `c51b934`. Public `unmount(container)` runs cleanup, removes root and portal content, and permits a fresh mount. Repeated unmount is safe and pending callbacks from destroyed components are discarded.

**Original finding**

`effect()` handlers may return cleanup functions, and cleanup works when a
child disappears or a different component replaces a root. There is no public
way to unmount a root deliberately.

Removing the container from the DOM does not invoke Pepper cleanup. This matters
for subscriptions and portal content retained by a root runtime.

Recommended fix:

- Return or export an explicit `unmount(container)` operation.
- Define cleanup ordering and behavior for repeated unmount calls.

## Feature Assessment at the Original Review

### DOM Templates

What works:

- ordinary text, attribute, boolean, property, event, SVG, and MathML bindings;
- stable template instances for object/modern-symbol keys;
- nested template updates;
- keyed node reordering;
- event listener callback replacement without listener churn;
- unsafe content reconciliation in normal nested positions.

Main risks:

- parser drift around quoted delimiters;
- top-level dynamic ownership;
- `DocumentFragment` and unsupported `Node` subclasses are accepted by broad
  types but are not tracked correctly after insertion;
- string event handlers use `new Function`, requiring CSP `unsafe-eval`;
- template `innerHTML` requires a Trusted Types strategy in applications that
  enforce Trusted Types.

### Components, State, and Refs

What works:

- fixed-template local state updates do not rerender ancestors;
- refs bind after render and nested hydration;
- mount and child-removal cleanup;
- component models retain custom methods;
- keyed child identity survives reorder;
- `setState(value, false)` defers rendering as documented.

Main risks:

- changing the child's root template on a local update;
- component-only unkeyed remounts;
- no explicit root unmount;
- unbounded default state/prop deep comparison;
- callbacks scheduled on a runtime that is destroyed before flushing can still
  remain in the root callback queue.

### Memoization and Effect-Event Props

The basic documented cases work:

- deep-equal plain props skip a render;
- `memo: false` uses reference identity;
- changing only a function-valued `onX` prop updates stored props without
  rerendering;
- custom comparators can skip ordinary value changes.

The comparator bookkeeping and default deep comparison findings above should be
resolved before treating this behavior as stable API.

### Paired Children

The paired-tag `children()` implementation is generally sound:

- children are lazy;
- dynamic child values are updated without replacing the `children` function;
- child template nodes remain stable across parent renders;
- children execute under the layout component's ownership and context.

Closing component labels are checked by template tooling; the runtime
intentionally uses balanced-delimiter recovery.

### Portals

The documented normal case works:

- external target rendering;
- component ownership and context;
- cleanup when the portal is removed;
- omission from SSR.

Portals inherit the component root-switch and cross-bundle SSR helper issues.
A selector target must already exist in `document`; a portal cannot target an
element created by the same not-yet-committed render unless target resolution is
deferred until after the owner DOM commits.

### Error Boundaries

The following work:

- descendant setup/model-render errors;
- rendering fallback UI;
- `getError()` and `resetError()`;
- SSR fallback rendering when all helpers come from the SSR runtime.

The missing DOM-commit boundary is the primary correctness gap.

### Context and Store

Initial and dynamically replaced root context, parent-provided context,
request-local SSR context, and Store subscriptions work. Context values are read
through `getContext()` when used rather than captured during setup. Root reads
are tracked per key, and effects own resources tied to replaceable context or
prop dependencies.

### SSR

The source SSR implementation is genuinely DOM-free and compact. It correctly
handles ordinary escaping, attributes, boolean bindings, nested arrays,
components, IDs, context, portals, SVG/MathML, and model-render error boundaries
in the covered cases.

The minified SSR bundle measured approximately 6,058 bytes gzip. This supports
the goal of avoiding a server VDOM on constrained engines.

The package-level shared-runtime issue must be fixed before this source-level
success translates to published usage.

### Tooling

The shared analyzer is one of the stronger parts of the repository. Its scanner
already handles comments, quotes, raw-text states, namespace transitions,
component closing expressions, and structural HTML diagnostics more carefully
than the runtime parsers.

Issues found:

- the runtime does not reuse its grammar;
- `npm run lint:templates` exits with usage because the script supplies no
  `--project` argument;
- the unit browser config includes the Node-only `ssr.test.js`;
- the VS Code manifest repository points to `lume/pepper.git`, while the package
  repository is `Munawwar/pepper`.

## Recommended Non-VDOM Architecture

### 1. Make Dynamic Ranges First-Class

Introduce a small internal structure similar to:

```js
{
  parent,
  end,
  nodes,
  commit(renderable),
  clear(),
}
```

It should be created for each dynamic child-content site and passed to component
runtimes rendered at that site.

Benefits:

- local child root changes reconcile correctly;
- parent removal clears all nodes currently owned by the child;
- portals can use the same commit path with a different parent;
- error boundaries can wrap the complete commit;
- `currentNodes` ownership stops being duplicated between parent and child;
- hydration can claim a range without requiring the hidden template text node
  itself to be live.

### 2. Share One DOM-Free Template Scanner

The repository currently contains overlapping parsers in:

- browser HTML preprocessing;
- component syntax lowering;
- SSR compilation;
- editor/lint tooling.

Adapt the tooling scanner into a shared tokenizer that emits:

- static text/tag tokens;
- ordered element binding operations;
- text/child parts;
- component open/close descriptors;
- namespace state;
- source locations for diagnostics.

The browser renderer may still use the native `<template>` parser to construct
DOM. Sharing the scanner does not require constructing a VDOM or a server DOM.

### 3. Use Selective Hydration Markers

There is an unavoidable trade-off between:

- zero markers;
- arbitrary dynamic ranges;
- forgiving mismatch recovery;
- low memory and implementation simplicity.

Pepper can still avoid most markers:

- use a following static node as the range boundary when possible;
- use the parent boundary for a final dynamic hole;
- emit a marker only for adjacent, empty, or otherwise ambiguous holes;
- replace the smallest mismatching static subtree instead of trying to infer an
  unknowable segmentation.

This would likely use less memory than cloning the full target tree and building
an adoption map for every hydrated node.

### 4. Make the Component API Renderer-Neutral

Shared component modules should be able to import the following once and run in
both browser and SSR builds:

- `component`
- `state`
- `ref`
- `stableId`
- `portal`
- trusted content helpers

The browser and server renderer entrypoints should supply environment-specific
commit behavior, not duplicate component runtime identity.

### 5. Remove Special Cases and Dead State

After range ownership is established, simplify or remove:

- the component-only renderer;
- boundary-specific reuse of hydration as a generic rerender mechanism;
- `hasDirtyDescendant`, which is checked and reset but never set;
- the always-true `ENABLE_COMPONENT_NODE_CACHE` flag;
- unused `utils.js` exports such as `each`, `from`, `isCustomElement`, and
  `objectAssign` after confirming no external internal-path consumers;
- per-static-attribute sites on elements without spreads;
- sticky `force()` site state and its consistency error.

`force(value)` can instead carry a per-render `{value, force}` result. This
avoids permanently changing site behavior after one forced render.

## Original Testing and Verification Results

Existing verification:

- SSR tests: 31 passed.
- Tooling tests: 12 passed.
- Component browser tests: 18 passed.
- HTML browser tests: 65 passed.
- TypeScript checking: passed.
- Oxlint: passed.
- Force browser tests: 15 passed, 1 failed.

Test infrastructure findings:

- `npm run test:dom` explicitly runs only `test/pepper.test.js`, so it does not
  run the HTML or force suites.
- Running the unit config without the command-line override tries to load the
  Node-only `test/ssr.test.js` in Chrome.
- The static forced-attribute failure is therefore not visible through the
  normal `test:dom` command.
- Runtime tests import `src`, so they do not detect duplicated state and symbols
  in independently bundled `dist` entrypoints.

Targeted adversarial tests reproduced:

- child-local root template switch leaving old DOM mounted;
- leaked child DOM after empty-to-complex transition and parent removal;
- component-only root hydration not binding the live node;
- top-level nested-template hydration removing live content;
- stale root context after repeated render;
- custom comparator ignoring its own decision for removed props;
- duplicate changed-prop names;
- duplicate `stableId()` values for distinct object keys;
- error boundaries missing DOM realization errors;
- camel-case property loss after `>` in a quoted attribute;
- native property initialization skipped during hydration.

Permanent regression coverage now lives in:

- `test/known-bugs.browser.test.js`
- `test/known-bugs.node.mjs`

The `[A01]` through `[A18]` labels map to the numbered findings in this report.
Unresolved tests are skipped intentionally, so the suite records desired
behavior without making every normal test run fail. Fixed regressions are
unskipped as their implementations land. Run `npm run test:known-bugs` to verify
both files, then unskip one focused test when beginning its fix.

## Compatibility and QuickJS

The SSR implementation does not depend on a DOM, which is the correct direction
for QuickJS and similar engines. The SSR path also does not exercise the browser
template instance `WeakMap` keyed by symbols, so the Safari issue is primarily a
browser-runtime problem.

QuickJS was not installed in the review environment, so the built SSR artifact
was not executed there. A QuickJS CI job should cover:

- importing the published SSR entrypoint;
- rendering components that use every isomorphic helper;
- error boundaries and context;
- `replaceAll`, private fields in the optional store bundle, microtask behavior,
  and other ES2022 assumptions;
- memory behavior on a large component tree.

## Original Implementation Priorities

1. Fix shared runtime/branding across published browser and SSR artifacts.
   Completed on this branch with a code-split build and shared brands.
2. Replace internal symbol weak keys or raise the documented Safari minimum.
   Completed on this branch by raising the minimum to Safari 16.4.
3. Introduce child-part/range ownership and remove the component-only fast path.
   Child-local range ownership is complete; fast-path identity and hydration
   remain tracked by findings 4 and 5.
4. Rework hydration around claimed ranges and selective markers.
5. Extend error boundaries across the commit phase.
6. Share the tooling scanner with runtime and SSR parsing.
7. Fix comparator bookkeeping, stable-key encoding, and root-context semantics.
   Completed on this branch, including effect-owned resource replacement.
8. Narrow native property preservation and fix static forced attributes.
9. Add unmount, store unit tests, dist integration tests, Safari tests, and
   QuickJS tests.
10. Remove dead state and optional complexity after the new ownership model is
    stable.

This historical order addressed correctness and package usability before performing
size-focused cleanup. The cleanup should become easier after ownership,
hydration, and parsing share coherent internal contracts.
