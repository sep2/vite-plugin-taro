# SystemJS WX module-runtime probe rationale and conclusions

## Purpose

This document records the architectural questions answered by the SystemJS probes and explains why each test exists.
It is intended to guide implementation and regression-test design, not to serve as an execution log. Commands,
temporary file locations, raw console output, and other reproduction details are deliberately omitted.

The probes evaluate this architecture:

```text
Vite and Rolldown
    -> logical ESM modules or optimized chunks
    -> canonical System.register definitions
    -> automatic WeChat package placement
    -> package-local registration resolvers
    -> one SystemJS graph owned by app-runtime.js
```

Development and production share that pipeline but use different logical granularity:

```text
development: source module -> System definition
production:  optimized chunk -> System definition
```

The static App and page closures remain in main. Lazy pages are outside the milestone. Ordinary dynamic imports,
including imports consumed by `React.lazy`, create the asynchronous boundaries.

## Conclusions at a glance

| Question | Conclusion | Architectural consequence |
| --- | --- | --- |
| Can a finalized Rolldown patch be copied into a System graph? | Only for one-time export replacement, not for complete ESM semantics. | Hot updates must contain genuine System registrations. |
| Can development modules and production chunks share one runtime format? | Yes. | The compiler emits one `ModuleDefinition` shape in both modes. |
| Can logical dependencies ignore physical WX paths? | Yes. | Canonical IDs and physical placement stay separate. |
| Can SystemJS link static dependencies across WX packages? | Yes. | Shared async code does not need duplication. |
| Can arbitrary package paths be passed to `require.async()`? | No. | The emitter generates a literal package dispatcher. |
| Can tiny unrelated lazy groups share a physical package? | Yes. | Physical packages are overfetch-aware bins, not logical chunks. |
| Can deep and circular graphs be planned safely? | Yes, after collapsing static SCCs. | Planning operates on an SCC DAG and uses iterative traversal. |
| Can a static SCC span multiple physical packages? | Yes. | Oversized async SCCs may be split without illegal native `require()`. |
| Can loaded System definitions be replaced without rebuilding the whole graph? | Yes, with importer-aware invalidation and relinking. | HMR uses ordered definition deltas and one evaluated graph. |
| Is stock SystemJS importer bookkeeping sufficient for SCC replacement? | No. | The embedded core must retain importer identity or expose an equivalent hook. |

## 1. Rejecting a finalized Rolldown patch as the runtime module format

### 1.1 Constant-export bridge sanity test

#### Question

Can an already-evaluated System importer observe a value extracted from a real finalized Rolldown patch?

#### Why this test exists

Before testing difficult ESM behavior, the bridge needs a minimal sanity check. If a constant replacement cannot reach an
existing System importer, failures in later tests could come from patch execution, canonical IDs, registration lookup,
or System setter propagation rather than from the semantic limitation under investigation.

The test therefore isolates the smallest useful graph:

```text
A statically imports B.value
B initially exports B1
A Rolldown patch replaces B with B2
```

Conceptually, the bridge does this:

```ts
const holder = executeFinalizedRolldownPatchFor('B');
const publish = retainedSystemExporter.get('B');
publish(readCurrentExports(holder));
```

#### Required assertion

The existing A namespace must observe `B2` without re-executing A.

#### What it establishes

A retained System `_export` function can publish a replacement value and trigger existing importer setters. This is a
useful primitive, but it establishes only one-time replacement. It does not establish ESM live bindings after the patch
has finished.

### 1.2 Mutable-export discriminator

#### Question

Does the same bridge preserve a mutable ESM binding after the patched module mutates it again?

#### Why this test exists

Live bindings are not an optional optimization. They are observable ESM semantics used by normal source, reexports,
cycles, and generated CommonJS interop. A bridge that handles React component constants but loses subsequent mutations
would create a subtly different module system.

The discriminating source shape is:

```js
// B
export let value = 'B1';

export function setValue(next) {
    value = next;
}

// A
import { value } from './B';
export const read = () => value;
```

The test sequence is:

```text
A.read()          -> B1
replace B         -> B2
A.read()          -> B2
B.setValue(B3)
A.read()          -> must be B3
```

#### Why the finalized patch cannot satisfy it

Rolldown's finalized patch exposes the current value through a getter-based export holder. Publishing that holder once
updates SystemJS at that moment, but a later assignment inside the Rolldown initializer does not call System `_export`.
The holder advances while the System namespace and importer setters do not.

Repairing this after finalization would require recognizing and rewriting every operation that can mutate an exported
binding, including assignments, increments, destructuring, loop targets, and reexports. That would duplicate an ESM
lowering pass inside the WX runtime.

#### What it establishes

A finalized Rolldown patch is not the canonical application-module representation. The server must instead emit genuine
System registrations. A System transform lowers the mutation directly:

```js
function setValue(next) {
    _export('value', value = next);
}
```

The WeChat runtime therefore does not keep Rolldown's initializer/export-holder graph as a second loader.

## 2. One logical module contract for development and production

### Contract under test

```ts
type ModuleDefinition<TRegistration> = {
    id: string;
    staticDependencies: readonly string[];
    dynamicDependencies: readonly string[];
    registration: TRegistration;
};
```

On the server, `registration` is source for a local generated file. In WeChat, loading that file produces the actual
System registration tuple.

The contract deliberately excludes the physical package path. Logical linking and physical download placement are
separate concerns.

### 2.1 Development granularity test

#### Question

Can Rolldown's `preserveModules` output become independently replaceable System definitions?

#### Why this test exists

Development HMR needs stable module-level units. Using production-sized chunks would make a one-component edit replace
and re-execute unrelated application code. Conversely, inventing a source-module compiler would duplicate Vite and
Rolldown resolution, transforms, tree shaking, and CommonJS handling.

The development test verifies this pipeline:

```text
Vite/Rolldown preserveModules output
    -> canonicalize emitted dependencies
    -> transform ESM and dynamic import to System.register
    -> one ModuleDefinition per retained source module
```

#### Required assertions

- Every reachable source module has one stable logical definition.
- Static dependencies in the registration match `staticDependencies` metadata.
- Dynamic import targets match `dynamicDependencies` metadata.
- Vite and Rolldown, rather than the plugin, still determine which source modules survive tree shaking.

#### What it establishes

Development can use source-module granularity without introducing another module compiler. The package placer consumes
Rolldown output; it does not parse application source to reconstruct a graph.

### 2.2 Production granularity test

#### Question

Can ordinary production chunks use the same runtime contract without preserving every source module?

#### Why this test exists

Using `preserveModules` in production would sacrifice scope hoisting, shared chunk optimization, file-count reduction,
and startup performance. Using a different runtime format in production would instead create two loaders and two sets of
linking semantics.

The production test uses normal Rolldown code splitting and then applies the same canonicalization and System transform
to each emitted chunk.

#### Required assertions

- Dynamic entries remain separate logical definitions.
- Shared code selected by Rolldown remains a shared logical definition.
- Static and dynamic chunk edges become canonical IDs.
- The same app runtime can instantiate both development modules and production chunks.

#### What it establishes

The pipeline is shared even though granularity is mode-specific:

```text
Rolldown output unit -> ModuleDefinition -> package placement -> app-runtime
```

This mirrors Vite's normal module-oriented development and bundle-oriented production model.

### 2.3 Canonical-ID test

#### Question

Can every logical edge be independent of its emitted WX path?

#### Why this test exists

Physical package roots can change when sizes, consumers, or existing user packages change. If a System registration
contains `../../some-package/chunk.js`, changing placement changes module semantics and forces Rolldown-style path
rewrites inside the runtime graph.

The compiler therefore rewrites emitted specifiers to build-scoped IDs:

```text
vpt:/module/src/feature.tsx
vpt:/chunk/shared-<hash>.js
```

#### Required assertions

- Static registration dependencies contain canonical IDs only.
- `_context.import()` receives canonical IDs only.
- No physical main/subpackage path appears in a logical edge.
- The placement manifest can move a definition without changing its registration.

#### What it establishes

SystemJS owns logical resolution while the manifest owns physical location. This separation is what allows hot
definitions to override a frozen checkpoint placement and allows several logical modules to share one WX package.

### 2.4 Shared mutable-binding test

#### Question

Do transformed definitions preserve live bindings across both eager and already-loaded dynamic consumers?

#### Why this test exists

It is possible for a System transform to look correct while a dynamic consumer receives a copied namespace or a
production chunk accidentally snapshots an export. The test uses one mutable shared export observed by the entry and by
a lazy module that has already loaded.

```text
entry ----\
           -> mutable Shared
lazy -----/
```

After both consumers are active, the shared binding changes. Both consumers must observe the same new value.

#### What it establishes

The canonical definition format retains System's live setter behavior in both compiler modes. This closes the semantic
gap exposed by the finalized Rolldown patch test.

### 2.5 Entry-preservation test

#### Question

Will Vite retain generated App/page entry exports that are consumed by the native runtime rather than by another ESM
importer?

#### Why this test exists

From Rolldown's point of view, an exported bootstrap function with no ESM consumer is dead code. The fact that a native
shell later reads the System namespace is outside the ordinary module graph.

The build must mark those entry signatures as externally observable:

```ts
preserveEntrySignatures: 'strict'
```

#### What it establishes

System-backed native roots require explicit entry preservation. Without it, dynamic import functions and root exports
can be correctly tree-shaken from Rolldown's perspective but missing at runtime.

## 3. Physical package transport

### Test graph

```text
main
  -> dynamic A

A
  -> static Shared
```

A and Shared are deliberately placed in different physical subpackages. The split is intentionally more difficult than
the likely optimized plan because it proves that physical co-location is not required for correctness.

### 3.1 Main-startup isolation test

#### Question

Does starting the application avoid downloading or executing lazy-only definitions?

#### Why this test exists

A loader can appear to support dynamic import while eagerly requiring every package resolver during bootstrap. That would
defeat startup splitting and could exceed the main-package limit.

#### Required assertions

Before importing A:

- no async package transport has run;
- A and Shared have not executed;
- only the main registration catalog is available.

#### What it establishes

The placement manifest is descriptive metadata, not an eager import list.

### 3.2 Cross-package static-link test

#### Question

Can A statically import Shared when their native files are in different packages?

#### Why this test exists

WeChat forbids arbitrary synchronous `require()` from one subpackage into another. Downloading Shared first does not make
such a `require()` legal. A nonduplicating architecture must therefore consume the registration namespace returned by
the package and let SystemJS link the logical edge.

The required flow is:

```text
System.import(A)
    -> load A package resolver
    -> read A registration
    -> inspect A's canonical dependency on Shared
    -> load Shared package resolver
    -> read Shared registration
    -> SystemJS links and executes the graph
```

Package entries may use synchronous `require()` only for registration files inside their own package.

#### What it establishes

Shared async modules can have one logical and physical copy. Cross-package application edges are System edges, not
native CommonJS edges.

### 3.3 Concurrent and repeated-load test

#### Question

Are package download, module instantiation, and namespace identity each deduplicated?

#### Why this test exists

React rendering, sibling dynamic imports, and shared dependencies can request the same package concurrently. A cache
created only after resolution allows duplicate downloads. A cache that stores packages but not System records can still
execute a module more than once or return different namespace identities.

The package cache must store the in-flight Promise immediately:

```ts
function loadPackage(id) {
    if (packagePromises.has(id)) return packagePromises.get(id);

    const promise = literalDispatcher(id).then(readResolver);
    packagePromises.set(id, promise);
    return promise;
}
```

#### Required assertions

- Concurrent imports trigger one transport call per package.
- Repeated imports reuse the same package Promise.
- SystemJS executes each logical module once.
- Repeated imports return the same namespace object.

#### What it establishes

The runtime can safely support concurrent Suspense renders and shared dynamic dependencies.

### 3.4 Failed-load retry test

#### Question

Can a transient package failure be retried?

#### Why this test exists

If a rejected Promise remains in the package cache, every future import fails permanently even after connectivity or
DevTools state recovers. Removing successful entries would instead repeat downloads.

The cache rule is:

```ts
const promise = startLoad();
cache.set(id, promise);
promise.catch(() => {
    if (cache.get(id) === promise) cache.delete(id);
});
```

#### What it establishes

Successful package handles remain stable, while rejected handles do not poison the runtime for the rest of the App
session.

### 3.5 JavaScript-only subpackage test

#### Question

Will DevTools accept generated subpackages that contain registrations but no native pages?

#### Why this test exists

The architecture treats subpackages as JavaScript download bins. WeChat documentation usually presents subpackages as
page containers, so relying on `pages: []` without validation would leave the core transport assumption untested.

The generated declaration is conceptually:

```json
{
    "root": "__vpt_async_<id>",
    "pages": []
}
```

#### What it establishes

A physical package does not need a one-to-one relationship with a page or a logical chunk. Generated bins can contain
only registration files and a resolver entry.

This remains a simulator result and still needs preview, upload, and real-device coverage.

### 3.6 Literal `require.async()` discovery test

#### Question

Can the generic runtime call `require.async(pathVariable)`?

#### Why this test exists

A variable call would allow one stable runtime implementation to load arbitrary manifest paths. However, the WeChat
compiler must discover asynchronous module targets while compiling the project. If it cannot see a literal, the target
module is not entered in its module table.

The rejected shape is:

```js
require.async(entryPath);
```

The required generated shape is:

```js
function loadPhysicalPackage(packageId) {
    switch (packageId) {
        case '__vpt_async_a':
            return require.async('./__vpt_async_a/index.js');
        case '__vpt_async_b':
            return require.async('./__vpt_async_b/index.js');
    }
}
```

#### What it establishes

`app-runtime.js` can remain generic, but each checkpoint must include a generated literal dispatcher. Changing physical
placement changes this native artifact and therefore requires a new checkpoint rather than a pure JavaScript hot delta.

### 3.7 Package-resolver namespace-shape test

#### Question

Does `require.async()` expose a package resolver directly or through an ESM-style `default` wrapper?

#### Why this test exists

The physical package entry is CommonJS, while `require.async()` returns a Promise-like module result controlled by the
WeChat runtime. Assuming only one interop shape can make package loading depend on compiler or base-library details that
are not part of the logical module contract.

The runtime normalizes only the package-entry boundary:

```ts
function readPackageResolver(namespace) {
    if (typeof namespace?.get === 'function') return namespace;
    if (typeof namespace?.default?.get === 'function') return namespace.default;
    throw new Error('Package did not export a registration resolver');
}
```

#### What it establishes

CommonJS shape normalization belongs at the generated package-resolver boundary. Application namespaces remain genuine
System namespaces and do not receive ad hoc default-unwrapping.

## 4. Generated end-to-end compiler and loader test

### Question

Does the complete pipeline work when registrations and package entries are generated rather than hand-authored?

### Why this test exists

Hand-written registrations prove the loader but can accidentally omit the exact syntax produced by Vite, Rolldown,
Babel, CommonJS lowering, dynamic-import transforms, and helper modules. Likewise, compiler-only tests do not prove that
DevTools can consume the emitted CJS wrappers and package layout.

The source graph is:

```text
entry
  -> dynamic A
  -> dynamic B

A ----\
       -> Shared
B ----/
```

The test runs the same source through both compiler granularities, emits physical package resolvers and a literal
package dispatcher, and evaluates the result through the WX runtime.

### Required assertions

- No application registration is hand-authored.
- Main startup does not load A, B, or Shared.
- A and B resolve through ordinary dynamic imports.
- Shared executes once even when A and B are requested concurrently.
- Repeated imports preserve namespace identity.
- The production graph retains Rolldown's shared chunk decision.
- Development and production consume the same runtime contract.

### What it establishes

The individual compiler and transport proofs compose into one vertical slice. The package layer does not interfere with
Rolldown's production chunking, and development module granularity does not require a different loader.

## 5. Automatic physical package planning

### Planner input and output

The planner consumes logical topology and estimated emitted sizes:

```ts
type PlanningModule = {
    id: string;
    staticDependencies: readonly string[];
    dynamicDependencies: readonly string[];
    byteLength: number;
};
```

It returns:

```text
logical module ID -> main or generated package root
```

It does not combine scopes, rewrite imports, or tree-shake. Those remain Rolldown responsibilities.

### 5.1 Main static-closure test

#### Why this test exists

Any module statically reachable from the native App/page roots must be available without an asynchronous package load.
A module used by both main and lazy code must stay in main; moving it to a generated subpackage would turn a static main
edge into an illegal or asynchronous dependency.

#### Planner rule

```ts
main = staticClosure(appAndPageEntries);
```

The closure is computed before lazy demand. Main ownership always wins.

### 5.2 Dynamic-demand test

#### Why this test exists

Counting only direct dynamic importers misplaces transitive dependencies and fails when several lazy roots share a deep
module. Every non-main module needs the set of boundaries whose static closures require it.

For each dynamic root, the planner propagates its demand through static edges:

```text
A needs {A}
B needs {B}
Shared needs {A, B}
```

Modules with the same demand set form an initial affinity group.

#### What it establishes

Feature-local and shared async code emerge from topology rather than user configuration or filename conventions.

### 5.3 Cheap-merge test

#### Why this test exists

One physical package per demand set creates excessive package declarations and tiny downloads. Physical grouping is
allowed to overfetch code as long as logical execution remains lazy.

The planner estimates additional transfer caused by merging bins:

```ts
overfetch =
    left.bytes * consumersOnlyInRight +
    right.bytes * consumersOnlyInLeft;
```

Tiny groups are merged when their combined size remains below the soft limit and estimated overfetch remains below the
configured threshold.

#### What it establishes

Physical packages are download bins, not a second logical chunk graph.

### 5.4 Expensive-overfetch test

#### Why this test exists

A merge rule based only on package size would combine large unrelated features merely because they fit under 2 MB. That
would make loading one feature download most of another.

The test uses large feature-local groups and a shared group. A valid planner must retain separate bins when merge cost is
high, even if the combined bytes fit.

#### What it establishes

Package-count reduction does not dominate user-visible loading behavior.

### 5.5 Soft- and hard-limit tests

#### Why these tests exist

The 1.8 MB target is a planning preference, while 2 MB is a platform validity boundary. Treating both as the same value
would either waste repair headroom or emit invalid packages.

The planner uses:

```text
soft limit: normal first-fit target
hard limit: absolute package validity limit
```

A demand group larger than the soft target is split into multiple bins. A single definition larger than the hard limit
cannot be repaired by placement and must be resplit by Rolldown or rejected.

Main overflow is a separate hard error because its synchronous closure cannot be moved to an async package.

#### What it establishes

The soft limit guides packing quality, while the hard limit protects project validity. Overflow handling cannot silently
change a synchronous edge into an asynchronous one.

### 5.6 Existing-package and count-limit tests

#### Why these tests exist

Generated packages share `app.json.subPackages` with user-defined packages. Validating generated count in isolation can
produce a project rejected by DevTools even though each generated package is individually valid.

The planner therefore computes:

```ts
available = 100 - existingSubpackages.length;
```

It may merge generated bins to satisfy the available count. If no legal merge fits under the hard limit, planning fails
with a package-count diagnostic.

#### What it establishes

The practical package ceiling is a whole-project constraint, not a quota available exclusively to generated code.

### 5.7 Determinism and root-collision tests

#### Why these tests exist

Nondeterministic roots cause needless `app.json` churn, invalidate DevTools caches, and turn unchanged placement into a
new checkpoint. Generated roots must also avoid names already owned by users.

Roots are derived from sorted logical module IDs, with deterministic collision repair. Equivalent graph input order must
produce the same plan.

#### What it establishes

Placement changes reflect graph or size changes, not iteration order.

## 6. Deep graphs and strongly connected components

### 6.1 Iterative SCC test

#### Question

Can the planner process a very deep graph without relying on the JavaScript call stack?

#### Why this test exists

A recursive DFS that works for application-sized examples can overflow on generated code, large dependency trees, or
pathological graphs. Circularity also prevents direct topological planning on modules.

The planner uses iterative Kosaraju traversal:

```text
iterative finish-order traversal
    -> iterative reverse traversal
    -> static SCCs
    -> condensation DAG
```

The stress model combines a ten-thousand-module static chain with a cycle near its end.

#### What it establishes

Planner correctness is not coupled to host recursion limits, and cycles become explicit planning units.

### 6.2 Demand-bitset test

#### Question

Can shared demand be represented for more boundaries than a machine integer bitmask supports?

#### Why this test exists

Large `import.meta.glob` expansions and generated route groups can create more than 32 or 64 dynamic roots. A fixed-width
bitmask would silently merge or lose consumers.

Each dynamic-boundary SCC receives a BigInt bit. Demand bits propagate over the SCC DAG from importer to static
dependency.

The stress model uses more than one hundred independent boundaries sharing one dependency.

#### What it establishes

Demand identity remains exact for large boundary sets while grouping still compares one compact key per SCC.

### 6.3 SCC-affinity test

#### Why this test exists

All members of a static SCC are mutually reachable and therefore receive the same demand set. Packing them separately
when they fit adds package coordination without reducing overfetch.

The planner treats an SCC as a soft affinity atom:

```text
if SCC <= hard limit:
    keep it intact while packing
```

This is an optimization, not a semantic requirement.

### 6.4 Oversized-SCC split test

#### Question

Does correctness survive when an async SCC cannot fit in one physical package?

#### Why this test exists

Rejecting every SCC over 2 MB would impose a stronger limit than WeChat requires. Duplicating the cycle would violate
single-module identity. The architecture claims that SystemJS can link the cycle across packages, so that claim needs a
direct test.

For an oversized async SCC:

```text
logical SCC: A <-> B <-> C
physical package 1: A, B
physical package 2: C
```

The package resolvers return registrations only. No module body executes during download, and no package performs a
cross-package synchronous `require()`.

SystemJS sees the logical cycle, creates one load record per canonical ID, and closes the cycle during linking.

#### What it establishes

SCC affinity may be broken to satisfy hard package limits without changing ESM identity or execution count. A main SCC
still cannot be moved out of main, and a single oversized logical definition still requires a compiler-level split.

### 6.5 Nested-cycle and deep-runtime test

#### Why this test exists

Planner-only SCC tests do not prove that generated registrations, package loading, and System execution compose. The
runtime graph therefore combines:

- a deep static chain;
- a shared three-module cycle;
- a nested dynamic import;
- a second cycle below that nested boundary;
- repeated and concurrent imports.

The assertions focus on values derived after all cycle bindings settle and on exact execution counts. This catches
snapshotting, duplicate instantiation, and accidental eager execution.

### 6.6 Static package-closure prefetch test

#### Question

Does a deep graph create one package-download waterfall per static edge?

#### Why this test exists

SystemJS can discover packages lazily while linking, but a deep graph split across many packages would then serialize
network work. The manifest already contains enough topology to know the physical package closure before evaluation.

The runtime prepares an import as follows:

```ts
function prepare(moduleId) {
    const packages = staticPackageClosure(moduleId, manifest);
    return Promise.all(packages.map(loadPackage));
}

async function instantiate(moduleId) {
    await prepare(moduleId);
    return registrationFor(moduleId);
}
```

Downloading and parsing package resolvers is safe before linking because registration `execute()` functions have not run.

#### What it establishes

Deep static graphs do not imply deep transport waterfalls. Package Promise deduplication also makes overlapping closures
safe when sibling dynamic imports start concurrently.

### 6.7 Production chunk-cycle test

#### Question

Should the production planner reconstruct source-level SCCs after Rolldown has scope-hoisted them into chunks?

#### Why this test exists

Development definitions correspond to source modules, so source cycles remain visible to the System graph. Production
definitions correspond to optimized chunks, where Rolldown may scope-hoist an entire source cycle into one definition.
Trying to recover source SCCs from chunk internals would reintroduce a second graph and undermine Rolldown's ownership of
production bundling.

The production test keeps the same deep and cyclic source graph but plans only the emitted chunk definitions and their
chunk-level edges.

#### What it establishes

SCC planning always operates on the current logical definition graph:

```text
development SCCs: source-module definitions
production SCCs:  optimized chunk definitions
```

Source cycles internal to one production chunk require no runtime cross-definition linking. Cycles that Rolldown leaves
across chunks remain ordinary System SCCs.

## 7. Ordered System-definition HMR

### Update contract

```ts
type ModuleUpdate = {
    buildId: string;
    fromRevision: number;
    toRevision: number;
    upsert: readonly ModuleDefinition<SystemRegistration>[];
    remove: readonly string[];
    boundaries: readonly string[];
};
```

The definition catalog stores current code and topology. SystemJS remains the only evaluated namespace graph.

### 7.1 Importer-identity test

#### Question

Can stock SystemJS delete and reconnect a multi-module affected SCC without retaining setters from discarded module
generations?

#### Why this test exists

A dependency's importer list in stock SystemJS stores setter functions but not the load that owns each setter. When an
SCC is invalidated, the runtime must distinguish:

```text
setter owned by invalidated importer -> discard
setter owned by stable boundary      -> retain
```

Reattaching every old setter reconnects closures from deleted module generations and can duplicate updates or retain
memory indefinitely. Discarding every setter disconnects the stable parent.

The probe adds importer identity to the embedded core's bookkeeping:

```text
before:
    dependency.importers.push(setter)

after:
    dependency.importers.push({ importer: currentLoad, setter })
```

System `_export` invokes `record.setter(namespace)`.

#### What it establishes

Fine-grained SCC replacement requires importer-aware records or an equivalent supported SystemJS hook. This is a narrow
loader change, not a second graph: the same System registry still owns all evaluated namespaces.

### 7.2 Affected-set algorithm test

#### Why this test exists

Invalidating only changed files is insufficient for cycles and topology changes. Invalidating every importer to the App
root loses HMR state unnecessarily.

The transaction computes the affected set from the union of old and new topology:

```text
changed and removed loaded modules
    -> expand their static SCCs
    -> walk reverse static edges
    -> stop at accepted boundaries
```

Using the old/new union matters when an edge is removed: the old importer relationship still identifies records that
must be detached, while the new graph determines what is reloaded.

### 7.3 Mutable cyclic-export test

#### Question

Can a changed module inside a cycle be replaced while a stable accepting root keeps its identity?

#### Why this test exists

This combines the two hardest live-graph properties: SCC invalidation and future `_export()` propagation. A test that
checks only the initial replacement value does not prove that the reconnected graph remains live.

The graph is:

```text
stable root -> feature -> A <-> B
```

Changing A must invalidate A, B, and feature but stop before the root. After relinking, a later setter call in A must be
visible through B, feature, and the unchanged root.

#### What it establishes

The transaction discards old internal setters, reconstructs the SCC, reconnects the stable external setter, and retains
future live-binding propagation.

### 7.4 Added and removed static-edge test

#### Question

Can one revision replace a static subgraph rather than merely changing module bodies?

#### Why this test exists

Real edits add imports, remove imports, and make old modules unreachable. Treating topology changes as full-build-only
would negate the ordered definition architecture.

The test changes:

```text
before:
    feature -> cyclic A/B

after:
    feature -> replacement
```

The update upserts `feature` and `replacement` and removes A/B.

#### Required assertions

- The stable root is not invalidated.
- The new static dependency is linked before feature executes.
- Removed definitions leave both the catalog and evaluated registry.
- No surviving importer still points at a removed module.

#### What it establishes

Pure-JavaScript static topology changes are incremental.

### 7.5 Added dynamic-boundary test

#### Question

Can an update introduce a new dynamic module without evaluating it immediately?

#### Why this test exists

Adding `import('./Added')` changes topology but should retain dynamic-import laziness. Eagerly evaluating every upsert would
make HMR behavior differ from a fresh build and could execute side effects on inactive routes.

The update installs the new definition and changes its importer. Before the import call, the definition must exist only
in the catalog. The first call then creates the System record and executes it once.

#### What it establishes

Hot topology can advance independently of current evaluation state.

### 7.6 Updated unloaded-module test

#### Question

If a lazy module changes before it has ever loaded, does its first import use the latest definition?

#### Why this test exists

An HMR design focused only on loaded modules can silently lose edits to inactive routes and unopened lazy features.
Replaying every update by eagerly importing those modules would instead destroy laziness.

The transaction replaces the catalog provider while leaving the System registry empty for that ID. A later dynamic
import must instantiate the newest provider.

#### What it establishes

Inactive modules do not require eager initialization or full rebuilds to receive updates.

### 7.7 CommonJS interop test

#### Question

Do updates preserve Rolldown's actual CommonJS namespace and default-import behavior?

#### Why this test exists

A hand-written fake CommonJS namespace does not exercise `__toESM`, default export selection, or Rolldown's wrapper
structure. The test therefore starts with a real CommonJS source module, lets Vite/Rolldown lower it, and then transforms
the emitted ESM to System.

The CJS module and its ESM consumer are invalidated as required, while the stable root remains connected to the consumer.

#### What it establishes

The System runtime consumes Rolldown's interop result rather than implementing a separate CommonJS compatibility layer.

### 7.8 Top-level-await test

#### Question

Does relinking await an asynchronous System `execute()` before exposing the updated namespace?

#### Why this test exists

Top-level await changes graph execution ordering. A transaction that reconnects stable importers before async execution
finishes can expose partial values or acknowledge a revision too early.

The updated module's System registration returns a Promise from `execute()`. The transaction waits for boundary imports
to finish before reconnecting and advancing the revision.

#### What it establishes

Completed TLA modules can be replaced while preserving System's dependency and completion ordering.

Updating a module while its previous TLA execution is still pending is a separate case and remains outside this proof.

### 7.9 Revision-ordering test

#### Question

Can an out-of-order update mutate any part of the graph?

#### Why this test exists

The checkpoint-plus-log model represents one ordered program. Applying revision N+1 without N can combine definitions
and topology that never existed together.

Validation occurs before catalog or registry mutation:

```ts
if (update.buildId !== currentBuildId) reject();
if (update.fromRevision !== currentRevision) reject();
if (update.toRevision !== currentRevision + 1) reject();
```

#### What it establishes

The runtime advances only one contiguous prefix and can safely ask the server to republish a missing range.

### 7.10 Stable native shell and single-graph test

#### Question

Does applying several definition transactions rerun native App registration, Page registration, or the accepted System
root?

#### Why this test exists

Correct values alone do not prove state preservation. Recreating the root could produce the same output while discarding
React state and module identity.

The test retains identity counters and the exact accepted root namespace across several revisions. It also verifies that
there is one System instance and no Rolldown client runtime.

#### What it establishes

The definition catalog is code/topology metadata, not a second evaluated graph. Updates replace only the affected loaded
subgraph and reconnect it to a stable boundary.

React Refresh and Taro Fiber retention are integration responsibilities layered after this transaction; they are not
re-proven by the plain System root fixture.

## 8. Vite preload normalization

### Question

Is replacing Vite's preload-helper implementation with a no-op enough to produce stable definition diffs?

### Why this test exists

Vite's browser preload wrapper is unnecessary in WeChat, but leaving its call and import in emitted ESM still lets chunk
metadata and helper import order change when dynamic topology changes. A source-string diff can then classify an
otherwise unchanged root as hot-updated, causing unnecessary invalidation.

The compiler normalization removes:

```text
__vitePreload(...) wrapper
preload-helper import
preload-helper logical definition
```

The wrapped loader expression becomes the direct dynamic import before the System transform.

### Required assertion

Adding a dynamic import below `feature` must change only the feature and newly reachable definitions. The stable root
must remain byte-for-byte unchanged and outside the affected set.

### What it establishes

Preload normalization is part of canonical module generation, not merely a runtime helper override. It improves both WX
correctness and HMR precision.

## 9. Combined implementation invariants

The probes support the following implementation requirements.

### Compiler

- Let Vite/Rolldown own resolution, transforms, tree shaking, CommonJS lowering, and production chunking.
- Use source-module granularity in development and optimized chunk granularity in production.
- Preserve native-consumed entry signatures explicitly.
- Remove browser preload artifacts before the System transform.
- Emit canonical static and dynamic IDs plus genuine System registrations.
- Treat a changed registration and changed topology as one definition update.

### Physical package planner and emitter

- Compute the synchronous main closure first.
- Collapse static cycles into SCCs and propagate dynamic demand on the SCC DAG.
- Keep fitting SCCs together as affinity atoms, but allow oversized async SCCs to span packages.
- Merge cheap tiny bins and avoid expensive overfetch.
- Count existing and generated subpackages together.
- Enforce soft, hard, total, and package-count constraints.
- Emit deterministic roots, package-local resolvers, and a literal `require.async()` dispatcher.
- Measure final emitted package sizes and repair or reject overflow before publishing a checkpoint.

### App runtime

- Own one System registry and one current definition catalog.
- Resolve canonical IDs through the placement manifest.
- Cache in-flight package Promises and evict only rejected loads.
- Prefetch a target's static physical package closure before System evaluation.
- Never perform synchronous application `require()` across physical package roots.
- Apply ordered definition updates using importer-aware SCC invalidation.
- Leave unloaded updated modules in the catalog until first import.

### Development server

- Produce a full checkpoint followed by a bounded contiguous definition-update log.
- Freeze physical placement during a checkpoint epoch.
- Use hot definitions for pure-JavaScript topology changes.
- Deliver executable definitions through the existing fixed `update.js` boundary, not over HTTP.
- Acknowledge a revision only after relinking, React Refresh, and retained-root reconnection complete.

## 10. Scope and remaining integration work

These probes establish module semantics, package transport, planning, and the System update transaction. They intentionally
do not claim that all production integration is complete.

Remaining work includes:

- integrating the compiler, planner, emitter, and runtime into `packages/vite-plugin-taro`;
- extracting changed definitions and accepted boundaries from Vite's incremental bundled-development lifecycle rather
  than comparing repeated complete compiler snapshots and supplying a fixed proof boundary;
- composing System definition transactions with the existing fixed `update.js` delivery and acknowledgement protocol;
- connecting the transaction to React Refresh and the retained Taro root;
- defining behavior for an update that arrives while an old top-level-await execution is still pending;
- exact post-emission package measurement and overflow repair;
- preview, upload, and real-device validation of JavaScript-only subpackages;
- iOS, Android, WebView, and Skyline coverage;
- preserving the existing H5 pipeline unchanged;
- keeping lazy pages, independent packages, native `componentPlaceholder`, and lazy CSS outside the first milestone.

The architectural decision supported by the full probe set is:

> Vite and Rolldown produce canonical System definitions; the WX plugin places those definitions into legal physical
> packages; `app-runtime.js` owns their one evaluated System graph; and development advances that graph through ordered
> definition transactions.
