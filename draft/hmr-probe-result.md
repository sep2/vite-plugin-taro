# WeChat DevTools hot-reload probe results

Date: 2026-07-11

Environment:

- WeChat DevTools: `2.02.2607102`
- Base library: `3.15.2`
- macOS
- Vite: `8.1.4`
- Rolldown: `1.1.4`
- Fixed DevTools project directory for the matrix: `packages/loan-genius/dist/wx`

## Scope

The matrix varied every part of the update protocol that can affect DevTools behavior:

- new files versus pre-existing files;
- direct literal, transitive literal, and dynamic `require()` edges;
- one cumulative file, immutable files, sequential preallocated files, and circular files;
- synchronous, delayed, missing, and self-contained lifecycle suppression;
- normal execution and App Service replay;
- single, rapid, coalesced, and out-of-order file events;
- loaded and never-loaded routes;
- JavaScript, JSON, WXML, WXSS, image, and ignored text files;
- 0, 32, 128, 512, and 1,000 preallocated files.

State assertions used the DevTools page ID, a live native input value, visible React output, console traces, and App Service close/reopen replay.

## What DevTools does

With `compileHotReLoad: true`, changing a compiled project file creates a synthetic native page lifecycle. For an unprotected JavaScript change, the active Taro page is reconstructed and input state is lost.

Instrumenting the actual runtime produced this order for a protected direct dependency:

```text
beginUpdate
patch body
endUpdate
onUnload suppressed
onLoad suppressed
onShow suppressed
afterRefresh
```

`beginUpdate()` runs before DevTools delivers the synthetic lifecycle. It captures the live Taro root and page, starts Rolldown patch mode, and enables lifecycle suppression. The decorated page config then ignores the synthetic unload/load/show sequence. React Refresh updates the retained root, and `afterRefresh` attaches that root to the new native page context. This is why the page ID and native input state remain stable.

A delayed `beginUpdate()` runs after normal `onUnload`/`onLoad` and cannot recover the destroyed root or input state.

## File event matrix

Rewriting pre-existing unrelated files produced:

| Extension | Page ID | Input |
| --- | --- | --- |
| `.txt` | `5 -> 5` | preserved |
| `.png` | `5 -> 8` | reset |
| `.json` | `8 -> 11` | reset |
| `.wxss` | `11 -> 14` | reset |
| `.wxml` | `14 -> 17` | reset |
| `.js` | `17 -> 20` | reset |

Adding an unrelated root JavaScript file also invalidated the active runtime. Files outside the Mini Program root were not part of this test.

## Dependency edge matrix

| Strategy | Patch runs | State preserved | Replay works | Result |
| --- | --- | --- | --- | --- |
| One changed cumulative file directly required by the page | yes | yes | yes | correct but quadratic rewriting |
| New immutable patch plus static manifest | yes | no | yes | patch-file event is unprotected |
| New immutable patch plus dynamic manifest | yes | no | yes | dynamic require does not protect the patch-file event |
| Dynamic require directly in the page | yes | no | yes | dependency is discovered too late for lifecycle suppression |
| Literal page require wrapped in `try/catch`, file initially missing | first addition runs | no on first addition | not sufficient | missing module is not registered as a dependency |
| Preallocated slot required through a shared dispatcher | no | no | no | changed child is cached; dispatcher is not re-executed |
| Preallocated slot required through `comp.js` | no | no | no | same transitive-cache behavior |
| Preallocated slot directly required by `app.js` | unsafe | no | no | App executes it before the WX runtime and may restart the App Service |
| Preallocated slot literally required by every page | yes | yes | yes | viable |

Native dynamic `require('./path/' + value + '.js')` is supported in development and accepted by automatic preview. It does not provide the early static dependency edge needed for lifecycle suppression.

A literal missing require can be caught, but it does not pre-register the absent module. The page initially loaded and logged the caught `module ... is not defined` error. Adding the file later executed its synchronous suppression wrapper, but page ID changed `5 -> 8` and input reset. Rewriting that now-existing file immediately afterward preserved page ID `8 -> 8` and input `929292`. Therefore the file must exist during the initial dependency compilation; `try/catch` cannot replace preallocation.

## Slot wrapper matrix

| Slot body | Page ID | Input | React patch |
| --- | --- | --- | --- |
| Raw Rolldown patch | stable in one run | reset | overwritten/not refreshed correctly |
| Empty synchronous `beginUpdate`/`endUpdate` wrapper | stable | preserved | not applicable |
| Wrapped real Rolldown patch | stable | preserved | applied |
| `beginUpdate` deferred with `setTimeout` | recreated | lost | too late |
| Wrapper without replay deferral | live works | live preserved | fresh replay is overwritten by the initial page module |
| Wrapper registered before readiness and drained from `onReady` | works | preserved | replay works |

The wrapper itself must therefore:

1. be a direct literal dependency of the active page;
2. execute `beginUpdate()` synchronously;
3. register its patch version before draining;
4. defer draining while `bridge.ready` is false;
5. execute contiguous versions in order;
6. call `endUpdate()` even when an earlier version has not arrived, so the current file event remains protected.

## Ordering and rapid writes

Twenty distinct slots written 20 ms apart were observed by DevTools out of order (`1, 2, 4, 3, ...`). Therefore filesystem event order cannot be used as patch order.

A bridge-owned version map fixed this. Every slot registered its closure by version, and the drain loop applied only `bridge.version + 1`. The same 20-file burst then applied exactly `1 ... 20`.

When version 2 arrived several seconds before version 1:

- version 2's file event was lifecycle-protected but not applied;
- input state remained unchanged;
- version 1 later caused the drain to apply versions 1 and 2 in order.

Rapid real Vite edits generated consecutive slots and retained the page ID and input value while rendering the final edit.

## Sequential files versus a circle

Sequential preallocated slots replay correctly, including when the first patch introduces a new module and the second patch only loads that module.

Circular reuse is not correct. A real two-patch probe showed:

1. patch 1 introduced `src/hmr-slot-dependency.ts`;
2. patch 2 loaded it but did not redefine it;
3. overwriting patch 1's slot with patch 2 worked in the live runtime;
4. after App Service restart, replay warned `Module src/hmr-slot-dependency.ts not found` and rendered `undefined-PAGE_V2`.

A circle discards executable history. It cannot guarantee replay for new dependencies or independent module changes. Slots may only be reused after a full build establishes a new baseline.

## Scale

All scale tests used direct literal page dependencies and pre-existing empty files.

| Slots | Open, compile, and first assertion | Empty slot bytes | Result |
| ---: | ---: | ---: | --- |
| 0 | 8,904 ms | 0 | pass |
| 32 | 8,466 ms | 256 | pass |
| 128 | 8,431 ms | 1,024 | pass |
| 512 | 9,141 ms | 4,096 | pass |
| 1,000 | 9,951 ms | 8,000 | pass |

The CLI/window overhead dominates these absolute values. The 1,000-slot case added roughly 1.5 seconds relative to the fastest run. Automatic preview accepted 1,000 files.

The stress matrix proved that 1,000 slots work, but the implementation uses 512: the 16 MiB byte threshold is normally reached first, while 512 halves initial file and page-banner overhead. Slot paths use the short `vpt-hmr/<base36>.js` form. The 1,000-slot prototype reported 1,032 initial output files. The final 512-slot build reported 544 files and 1,405 ms readiness in its final measured run; the broader prototype range was 1,028-1,429 ms. A development automatic preview with four approximately 34 KiB patches was 1,975,053 bytes and succeeded.

For 100 synthetic 36.5 KiB patches, slot writing measured:

```json
{
    "patches": 100,
    "payloadBytes": 3651600,
    "diskBytes": 3729792,
    "files": 100,
    "appendMs": 21.2
}
```

The former cumulative journal would write approximately 184 MB for the same sequence. Slot writing is proportional to the new patch size instead of total journal size.

Ten isolated slot changes executed in 45-183 ms, with a median around 147 ms. A 20 ms same-file burst skipped intermediate versions, while twenty distinct files retained all versions after ordered draining.

## Full builds and errors

A partial DevEngine full output does not necessarily re-emit development assets. Therefore slot reset must explicitly rewrite every used slot to `void 0;`. A new development session also deletes the plugin-owned slot directory before writing its initial output, preventing stale excess slots from earlier sessions. This was verified: a filled 34 KiB slot became 8 bytes after a CSS-triggered full build.

Atomic temporary-file rename prevents DevTools from compiling partially written patch code. Deliberately writing invalid JavaScript directly into a slot kept the page ID but reset input because no wrapper could execute; fixing the file recovered compilation. The real pipeline transforms and validates code before the atomic rename, so it does not expose this invalid intermediate state.

## Route behavior

Updating a module for a route that had already executed while another route was active worked. The active route retained its page ID, and navigating back showed the update.

An initial probe confirmed that a patch for a page module that had never executed could be overwritten when that route first loaded. The final design adds `vpt-hmr/preload.js`, required after `runtime.js` and before `update.js`, to initialize every configured page component in the first page runtime. Repeating the direct-history-route probe then preserved the history page and rendered `PRELOADED_INACTIVE_UPDATE` when the calculator route opened for the first time.

## Local control channel

A page-level `wx.request()` to a local control server was tested from the same fixed project. The POST reached the Node server and returned status 200 with both `urlCheck: false` and `urlCheck: true` in DevTools.

The implemented channel uses `http://localhost:<vite-port>` because Vite's default macOS listener may bind only to `::1`; `127.0.0.1` then fails even though `localhost` succeeds. The generated endpoint is authenticated by a per-server random token. Requests and responses carry only build/session/version metadata, never executable code.

The protocol also had to account for an initial `update.js` batch executing before asynchronous App Service registration completes. Reporting that batch immediately aborts registration and leaves the client stuck. The final client state machine queues the literal batch until registration succeeds.

## Protocol transport validation

The final pull/ack transport was manually validated against the fixed `packages/loan-genius/dist/wx` project:

- initial output emitted only `vpt-hmr/control.js`, `preload.js`, and `update.js`;
- active-page patches changed only the fixed `update.js` executable dependency;
- consecutive updates advanced `0 -> 1` and `1 -> 2`, preserved page ID `5`, and preserved native input `616161`;
- two rapid source events converged to the fourth protocol version without losing the final render or input state;
- compatible App updates preserved page ID `14` and input `717171`;
- after App Service restart, the new session reported version 0 and the server published one retained `0 -> 1` batch; the client reached version 1 and rendered the update;
- restarting Vite produced a new full-build epoch, reset `update.js` to `void 0;`, and retained the latest source in the full output;
- a CSS edit changed `buildId`, reset protocol version to 0, and produced a full WX output;
- reverting test edits recovered through the same protocol.

The server retains deltas only in memory, publishes one missing range at a time, and does not acknowledge a range until the App Service reports its post-Refresh version. Every retry rewrites the same batch with a fresh nonce so a missed same-file event cannot be hidden by identical file content.

## Final model

Under the tested DevTools implementation, a state-preserving executable update requires one changed JavaScript module that is already a direct literal dependency of the active page and that synchronously opens the lifecycle-suppression transaction.

The final transport is:

- eagerly preload every configured page component after the Rolldown runtime initializes;
- require one fixed `vpt-hmr/update.js` directly from every page entry;
- retain all current-build deltas and versions in Vite server memory;
- let a fresh App Service register its actual version and long-poll for metadata;
- atomically write one literal missing-range batch into `update.js`;
- synchronously protect that file event with `beginUpdate`/`endUpdate`;
- execute one in-flight batch and acknowledge only after React Refresh or stale-route relaunch completes;
- queue changes arriving in flight for the next batch;
- replay retained versions from 0 after App Service restart;
- establish a new full-build `buildId` after Vite restart, unsafe updates, failures, or retention limits;
- retain at most 1,000 deltas or 16 MiB before a full-build reset.

This keeps steady-state disk writes proportional to the newly published missing range, uses only three protocol files, avoids cross-file manifest races, and preserves literal DevTools-compiled execution without `eval`, `Function`, snapshots, executable network payloads, or a custom application loader.
