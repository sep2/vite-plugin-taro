# SystemJS WX module-runtime probe results

Date: 2026-07-14

## Summary

The probes established that a WeChat Mini Program can use one SystemJS application graph for eager modules, lazy modules,
shared modules, physical subpackages, and ordered JavaScript updates.

The successful architecture is:

```text
Vite / Rolldown output
    -> canonical logical module definitions
    -> System.register conversion
    -> automatic WX package placement
    -> package-local registration resolvers
    -> literal require.async() dispatcher
    -> one SystemJS graph in app-runtime.js
```

Development and production use the same logical pipeline with different Rolldown output granularity:

```text
development: source module -> System registration
production:  optimized chunk -> System registration
```

A finalized Rolldown HMR patch is not a sufficient SystemJS update representation. It can replace a constant export, but
it loses later ESM live-binding mutations. Ordered HMR must therefore replace genuine System registrations rather than
adapt Rolldown export holders at runtime.

The main results are:

| Probe | Result |
| --- | --- |
| Finalized Rolldown patch updates a constant System export | PASS |
| Finalized Rolldown patch preserves later mutable ESM exports | FAIL |
| Development `preserveModules` output becomes canonical System definitions | PASS |
| Production Rolldown chunks become the same definition shape | PASS |
| Mutable bindings remain live after the System transform | PASS |
| JavaScript-only subpackages with `pages: []` load in DevTools | PASS |
| Cross-package static links are handled by SystemJS | PASS |
| Concurrent and repeated package loads are deduplicated | PASS |
| Rejected package loads can be retried | PASS |
| Automatic demand-based package planning | PASS |
| Deep graphs and SCC-aware planning | PASS |
| A static cycle split across physical packages links and executes | PASS |
| Ordered System-definition HMR for bindings, cycles, topology, CJS, and TLA | PASS |
| HMR transaction keeps native App/Page registration and the System root stable | PASS |

## Environment

- Vite: `8.1.4`
- Rolldown: `1.1.4`
- SystemJS: `6.15.1`
- Babel core and System transforms: `7.29.7`
- Node.js: `26.5.0`
- WeChat DevTools runtime reported by the simulator: `WeChatLib 3.16.2`
- Generated proof projects requested base library `3.9.11`
- Temporary projects and scripts were created under `/tmp`
- No application repository files were changed by the probes

## Logical module contract

The compiler and runtime used this conceptual definition:

```ts
type ModuleDefinition = {
    id: string;
    staticDependencies: readonly string[];
    dynamicDependencies: readonly string[];
    registration: SystemRegistration;
};
```

All dependency edges use canonical `vpt:/` IDs. A module's physical WX path is stored separately and is never used as a
logical dependency edge.

The same definition shape represented:

- a development source module;
- a production Rolldown chunk;
- a main-package module;
- a subpackage module;
- a newly introduced hot module;
- an updated hot module.

## Finalized Rolldown patch bridge

### Constant-export result

The first bridge probe used a real Rolldown DevEngine patch and a real SystemJS importer:

```text
A imports B.value
B initially exports B1
Rolldown changes B to B2
```

The runtime retained B's System `_export` function, executed the Rolldown patch, read its export holder, and published the
new value through SystemJS.

Observed result:

```text
before patch: B1
after patch:  B2
boundary:     a.js <- b.js
result:       PASS
```

SystemJS invoked A's existing setter, so the already-evaluated A observed `B2`.

Probe script:

```text
/tmp/vpt-real-system-bridge.mjs
```

### Mutable-export result

The same bridge was then tested with a live mutable export:

```js
export let value = 'B1';

export function setValue(next) {
    value = next;
}
```

After applying the patch, the test called `setValue('B3')`.

Observed result:

```text
before patch: B1
after patch:  B2
patch holder: B3
System B:     B2
System A:     B2
result:       FAIL
```

The finalized Rolldown patch exposed `B3` through its getter-based export holder, but it did not call SystemJS `_export`
again. SystemJS and A therefore remained at `B2`.

Probe script:

```text
/tmp/vpt-real-system-live-binding.mjs
```

### Conclusion

A one-time `replaceExports()` bridge is not ESM-correct. Repairing it would require transforming every exported assignment,
increment, destructuring operation, and reexport after Rolldown has already finalized the module. That would duplicate an
ESM compiler.

The runtime must consume genuine System registrations. Babel's System transform emits the required mutation:

```js
_export('value', value = next);
```

The WeChat runtime therefore does not retain Rolldown's `createEsmInitializer`, `createCjsInitializer`, `registerModule`,
or `loadExports` graph.

## Shared development and production compiler

A compiler probe used this source shape:

```text
entry
  |- static import Shared
  `- dynamic import Lazy

Lazy
  `- static import Shared
```

It ran two builds:

```text
development: Rolldown preserveModules
production:  normal Rolldown code splitting
```

Each ESM output was normalized to canonical dependency IDs and transformed with:

```text
@babel/plugin-transform-dynamic-import
@babel/plugin-transform-modules-systemjs
```

### Development graph

```text
vpt:/module/entry.js
  static  -> vpt:/module/shared.js
  dynamic -> vpt:/module/lazy.js

vpt:/module/lazy.js
  static  -> vpt:/module/shared.js
```

### Production graph

```text
vpt:/chunk/entry-BhY55Y2M.js
  static  -> vpt:/chunk/chunk-kOVBpu9h.js
  dynamic -> vpt:/chunk/chunk-CCgNKxEa.js

vpt:/chunk/chunk-CCgNKxEa.js
  static  -> vpt:/chunk/chunk-kOVBpu9h.js
```

The test loaded the lazy module, mutated a shared exported binding, and then read it through both the entry and the
already-loaded lazy module.

Observed result in both modes:

```text
finalValue:     B3
finalLazyValue: lazy:B3
result:         PASS
```

Assertions also established that:

- every logical ID started with `vpt:/`;
- every static and dynamic edge used a canonical ID;
- a registration's static dependency list matched its `ModuleDefinition` metadata;
- dynamic `_context.import()` used the canonical target ID;
- no emitted WX file path appeared in a logical dependency edge.

Probe script:

```text
/tmp/vpt-module-definition-proof.mjs
```

## Physical package transport

### Test graph

The transport probe deliberately separated a static graph across three physical packages:

```text
main
  `- dynamic import A

package A
  `- static import Shared

package Shared
```

Each physical package exported a local resolver:

```js
module.exports = {
    get(id) {
        // Return one local System registration.
    }
};
```

The main runtime used SystemJS for all logical links. A package resolver used synchronous `require()` only for files in
its own physical package.

### Simulated transport

A Node transport added delay, counted calls, and intentionally rejected the first retry-package request.

Observed result:

```text
result: A:shared
sameNamespace: true

transport calls:
  pkg-a:      1
  pkg-shared: 1
  pkg-retry:  2

successful loads:
  pkg-a:      1
  pkg-shared: 1
  pkg-retry:  1

retrySucceeded: true
result: PASS
```

### WeChat DevTools transport

The same graph ran in an actual generated Mini Program with JavaScript-only declarations:

```json
{
    "root": "pkg-a",
    "pages": []
}
```

DevTools reported three subpackages and accepted every `pages: []` declaration.

Observed result:

```text
result: A:shared
sameNamespace: true
retrySucceeded: true

entry executions:  1
A executions:      1
Shared executions: 1
```

The `require.async()` result exposed the CommonJS resolver directly rather than under `.default` in the tested runtime.
The runtime nevertheless accepted either shape.

Proof project:

```text
/tmp/vpt-wx-placement-proof
```

### Literal `require.async()` requirement

A generic call failed:

```js
require.async(entry);
```

DevTools reported:

```text
module 'pkg-a/index.js' is not defined, require args is 'pkg-a/index.js'
```

A generated literal dispatcher passed:

```js
switch (packageId) {
    case 'pkg-a':
        return require.async('./pkg-a/index.js');
    case 'pkg-shared':
        return require.async('./pkg-shared/index.js');
}
```

The package planner must therefore emit a literal dispatcher. The generic `app-runtime.js` selects a package ID; the
generated dispatcher owns the statically discoverable `require.async()` calls.

## Generated end-to-end Vite pipeline

The next proof removed the hand-written registrations. Ordinary source imports passed through the complete generated
pipeline:

```text
ordinary import()
  -> Vite / Rolldown
  -> ESM output
  -> canonical System.register transform
  -> physical package emitter
  -> generated literal dispatcher
  -> SystemJS in WeChat
```

The source graph was:

```text
entry
  |- dynamic import A
  `- dynamic import B

A -----\
        -> Shared
B -----/
```

### Development result

Development used `preserveModules`. The output retained one logical definition per source module plus Vite's generated
preload helper before later preload normalization.

### Production result

Production used normal code splitting. Rolldown emitted:

```text
entry
  |- dynamic -> chunk-a
  `- dynamic -> chunk-b

chunk-a -----\
              -> chunk-shared
chunk-b -----/
```

The real shared chunk remained a separate logical System definition.

### DevTools result

Both generated projects reported:

```text
A: A:shared
B: B:shared
sameNamespaces: true

package attempts: 1 per package
package loads:    1 per package
entry executions: 1
A executions:     1
B executions:     1
Shared executions: 1

result: PASS
```

The build required:

```ts
preserveEntrySignatures: 'strict'
```

Without it, Vite's application build correctly treated the exported proof API as unused and tree-shook the dynamic
functions. System-backed App/page entry exports must be preserved as explicit runtime roots.

Proof artifacts:

```text
/tmp/vpt-build-e2e-proof.mjs
/tmp/vpt-wx-e2e-proof/development
/tmp/vpt-wx-e2e-proof/production
```

## Automatic physical package planner

The first automatic planner implemented:

1. the synchronous static closure for main;
2. dynamic roots;
3. each module's dynamic consumer set;
4. feature and shared demand groups;
5. first-fit splitting around a 1.8 MB soft limit;
6. a 2 MB hard limit;
7. overfetch-based bin merging;
8. a configurable total-size limit, defaulting to 30 MB;
9. the 100-subpackage limit, including existing user packages;
10. deterministic hash-based generated roots;
11. collision repair for existing roots.

The tiny A/B/Shared fixture was correctly merged into one physical package because the estimated overfetch was below the
64 KB merge threshold:

```text
main:
  entry

generated package:
  A
  B
  Shared
```

Development and production both passed in DevTools after automatic placement. Each loaded its single generated package
once and executed every logical module once.

Additional planner characterizations established:

- an eager dependency used by main remains in main even when lazy code also uses it;
- three expensive-overfetch groups remain separate;
- a 2.4 MB demand group splits into 1.6 MB and 0.8 MB bins;
- an existing count of 100 subpackages rejects a new generated package;
- a main closure over 2 MB is rejected;
- equivalent graph input order produces the same generated roots;
- generated-root collisions are repaired deterministically.

Planner artifacts:

```text
/tmp/vpt-wx-package-planner.mjs
/tmp/vpt-wx-package-planner-proof.mjs
```

## Deep graphs and static cycles

The planner was then changed to operate on strongly connected components rather than individual modules.

The SCC pipeline is:

```text
static module graph
  -> iterative Kosaraju SCC detection
  -> condensation DAG
  -> BigInt dynamic-demand propagation
  -> SCC-aware bins
  -> module placements
```

Static imports define SCCs. Dynamic imports remain boundary edges and do not become SCC edges.

The implementation is iterative so a deep graph does not depend on the JavaScript call-stack limit.

### Planner stress results

The planner passed a synthetic graph containing:

```text
10,001 logical modules
10,000-module static chain
3-module cycle at the end
130 independent dynamic boundaries
```

Observed planner runtime was approximately 2.8 seconds in the test environment.

A synthetic 2.7 MB async SCC was kept logically intact but split physically:

```text
package 1: cycle-a, cycle-b  1.8 MB
package 2: cycle-c           0.9 MB
```

Every package retained the same logical SCC identity in planner diagnostics.

### WeChat complex-graph result

The generated development Mini Program contained:

```text
210 logical System modules
207 static SCCs
200-level static chain
3-module shared cycle
2-module nested cycle
nested dynamic import
4 generated physical packages
```

The three-module cycle was deliberately assigned synthetic planning weights that forced it across two physical packages:

```text
package 1: cycle-a, cycle-b
package 2: cycle-c
```

The runtime used manifest topology to preload a target's complete static package closure with `Promise.all()` before
SystemJS linked and evaluated it.

Observed DevTools result:

```text
A:      A:shared:ab:200
B:      B:shared:ca
Nested: N:de

cycle executions:        [1, 1, 1]
nested-cycle executions: [1, 1]
all package loads:        exactly once
max concurrent loads:     3
max prefetched packages:  3

result: PASS
```

SystemJS closed the cross-package cycle without any synchronous cross-package `require()`.

The production build scope-hoisted the deep chain and source cycles into six optimized logical chunks. Its small output
was merged into one physical async package and produced the same values and execution counts.

The 2.7 MB SCC size was synthetic planner input; the emitted proof code itself was small. This proves the split and
linking behavior, not a real 2.7 MB DevTools compilation.

Proof artifacts:

```text
/tmp/vpt-build-complex-e2e-proof.mjs
/tmp/vpt-wx-complex-proof/development
/tmp/vpt-wx-complex-proof/production
```

## Ordered System-definition HMR

### Update contract

The HMR proof used ordered definition deltas:

```ts
type ModuleUpdate = {
    buildId: string;
    fromRevision: number;
    toRevision: number;
    upsert: ModuleDefinition[];
    remove: string[];
    boundaries: string[];
};
```

The definition catalog stores registration providers and topology. SystemJS remains the only evaluated namespace graph.

### SystemJS importer identity

Stock SystemJS stores only setter functions in a dependency's importer list. That is insufficient for an SCC transaction:
when several modules are invalidated, the runtime must distinguish setters owned by invalidated importers from setters
owned by stable external boundaries.

The proof used a narrow SystemJS core change:

```text
before:
  dependency.importers.push(setter)

after:
  dependency.importers.push({ importer, setter })
```

System `_export` invokes `record.setter`. During invalidation the runtime can then:

1. discard importer records whose owner is in the affected set;
2. retain records owned by a stable boundary;
3. delete the affected System records;
4. instantiate the latest registrations;
5. link the new internal SCC edges;
6. reattach only the stable external records.

This avoids reconnecting setters that close over discarded module generations.

Custom-core artifacts:

```text
/tmp/build-vpt-hmr-system-core.mjs
/tmp/vpt-hmr-system-core.cjs
```

### Probe graph and revisions

The stable root imported:

- a mutable two-module cycle through `feature`;
- a CommonJS module through an ESM consumer;
- a top-level-await module;
- an unloaded dynamic module.

Three revisions were applied.

#### Revision 1: mutable cyclic export

Only `cycle-a` changed. SCC expansion and reverse-edge traversal selected:

```text
cycle-a
cycle-b
feature
```

The stable root was the accepted boundary and was not invalidated.

Observed values:

```text
initial:       v1:b1
revision 1:    v2:b1
setFeature(v3): v3:b1
cycle-b sees:  v3
```

This proves that the new registration's later `_export()` calls continue to update bindings through the reconnected
System graph.

#### Revision 2: static topology change and new dynamic boundary

The update contained:

```text
upsert:
  feature
  replacement
  added

remove:
  cycle-a
  cycle-b
```

`feature` stopped statically importing the old cycle, started statically importing `replacement`, and added a dynamic
import of `added`.

After the transaction:

- the removed cycle was absent from both the definition catalog and evaluated registry;
- the root observed `replacement-v1`;
- `added` existed in the catalog but had not executed;
- the first dynamic import executed `added` once and returned `added-v1`.

#### Revision 3: unloaded lazy module, CJS, and TLA

The update changed:

```text
late.js
legacy.cjs
tla.js
```

`late.js` had never been imported. Applying the update changed its catalog registration without evaluating it. Its first
later import returned `late-v2` and executed it once.

The actual Vite/Rolldown CommonJS conversion changed from `cjs-v1` to `cjs-v2`.

The System top-level-await registration changed from `tla-v1` to `tla-v2` and completed before the root observed its new
namespace.

### Revision ordering

An update with the wrong `fromRevision` was rejected before any graph mutation. The runtime remained at revision zero and
continued to expose the old values. The valid updates then advanced one contiguous prefix:

```text
0 -> 1 -> 2 -> 3
```

### Stable root and single graph

The Node and WeChat versions asserted:

```text
native App registrations:  1
native Page registrations: 1
System root executions:    1
System instances:          1
final revision:             3
```

The final root snapshot was:

```json
{
    "feature": "replacement-v1",
    "cycleSeen": "replacement-v1",
    "cjs": "cjs-v2",
    "tla": "tla-v2"
}
```

The accepted root namespace retained exact object identity across all three revisions. There was no
`__rolldown_runtime__` and no second evaluated namespace graph.

The WeChat proof project applied pre-embedded definition updates in one running page heap. It proves the System
transaction itself does not rerun App, Page registration, or the accepted root. It does not by itself prove delivery of
those definitions through the fixed `update.js` file; that executable-code boundary is established separately in
`draft/hmr-probe-result.md` and the existing WX HMR implementation.

HMR proof artifacts:

```text
/tmp/vpt-system-hmr-proof.mjs
/tmp/vpt-build-wx-system-hmr-proof.mjs
/tmp/vpt-wx-system-hmr-proof
```

## Vite preload normalization

Replacing Vite's preload helper implementation with a no-op was not enough for stable module updates.

When a dynamic boundary was added, Vite changed the helper import order in the otherwise unchanged root. A source-string
diff therefore falsely classified the root as updated.

The successful compiler normalization removes all three preload artifacts before the System transform:

```text
__vitePreload(...) wrapper
preload-helper import
preload-helper logical definition
```

After normalization, the topology update changed only:

```text
added
feature
replacement
```

The root registration remained byte-for-byte stable and did not enter the affected set.

## Architecture conclusions

The probes support these decisions:

1. **One evaluated graph:** `app-runtime.js` owns one SystemJS registry. A definition catalog is metadata and code storage,
   not a second evaluated namespace graph.
2. **One runtime module format:** eager, lazy, shared, production, development, and hot modules all use System
   registrations.
3. **Mode-specific granularity:** development uses source-module definitions; production uses optimized Rolldown chunk
   definitions.
4. **Rolldown still bundles:** the WX package planner assigns already-emitted definitions to download containers; it does
   not replace Rolldown's resolver, tree shaker, CJS lowering, or production chunker.
5. **Literal transport generation:** every physical package requires a generated literal `require.async()` branch.
6. **Package-local CJS only:** synchronous `require()` is restricted to a package's own resolver and registration files.
7. **SCC-aware planning:** static cycles are affinity atoms below the hard limit and remain legal when an oversized async
   SCC must be split physically.
8. **Concurrent package preparation:** manifest topology lets the runtime download a static package closure before
   SystemJS evaluation, avoiding deep package waterfalls.
9. **System-definition HMR:** Vite/Rolldown produces changed ESM outputs, which become changed System registrations.
   Finalized Rolldown patch holders are not used as the application runtime format.
10. **Ordered persistence:** a checkpoint plus a contiguous definition-update log represents the current development
    graph.

## Limits of the probes

The probes do not yet establish all release requirements:

- The generated compiler, planner, runtime, and HMR transaction are temporary spikes and are not integrated into
  `packages/vite-plugin-taro`.
- The HMR compiler snapshots were produced by repeated Vite builds. Extracting the same changed definitions from Vite's
  incremental bundled-development lifecycle remains integration work.
- The new System update transaction has not yet been delivered end to end through the fixed `update.js` protocol, even
  though that transport and App-retention boundary are independently proven.
- React Refresh and the Taro React root were not part of the System transaction fixture. Their retained-root behavior is
  covered by the existing HMR architecture and probes, but the new transaction still needs integration.
- Updating a module while its top-level-await execution is still pending was not tested. The tested updates occurred
  after the previous TLA completed.
- The 2 MB SCC split used synthetic planning weights. Exact post-emission measurement and overflow repair remain required.
- JavaScript-only `pages: []` subpackages passed the simulator but still require preview/upload and real-device coverage.
- iOS, Android, WebView, and Skyline device behavior was not tested here.
- Lazy pages, independent packages, and native `componentPlaceholder` remain outside the first milestone.
- Lazy CSS remains eager and is not part of these JavaScript probes.

## Reproduction commands

The temporary probes were run with:

```bash
node /tmp/vpt-real-system-bridge.mjs
node /tmp/vpt-real-system-live-binding.mjs
node /tmp/vpt-module-definition-proof.mjs
node /tmp/vpt-wx-placement-proof/simulated-proof.cjs
node /tmp/vpt-wx-package-planner-proof.mjs
node /tmp/vpt-build-e2e-proof.mjs
node /tmp/vpt-build-complex-e2e-proof.mjs
node /tmp/vpt-system-hmr-proof.mjs
node /tmp/vpt-build-wx-system-hmr-proof.mjs
```

The generated Mini Program projects were opened and asserted through WeChat DevTools automation. The final page data and
console markers reported `PASS` for development, production, complex-graph, and System-HMR projects.
