# Issue #22 — cache and publication investigation

Investigation snapshot: 2026-09-11. Related issue: [#22](https://github.com/sep2/vite-plugin-taro/issues/22).

This report is committed separately from its evidence and reproduction helpers. Unless stated otherwise, their paths and commands refer to this local investigation directory, not the repository's `draft/` directory:

```text
C:/Users/james/AppData/Local/Temp/vpt-issue22-watch-c3523db-pi-7ad6/investigation
```

The local artifacts are not included in this commit and may be removed by temporary-directory cleanup.

## Confirmed finding

**The stale build/watch output is caused by stale child-file content surviving output-directory deletion/recreation in DevTools.** This is now supported by delivered JavaScript, DevTools file-event logs, two VPT interventions, and a native reproduction without Vite, React, Taro, or changing filenames.

This does **not** establish the full cause of the earlier persistent undefined-bootstrap failure with cleanup disabled. No product fix has been implemented or verified.

## Environment and scope

- Reused the locally built plugin and runtime 0.7.2 archives from commit `c3523dbd300bca8cfcc90280d04b5e57600aacdf`. See `../evidence/provenance.json`; neither package was replaced with an npm artifact.
- DevTools Nightly `2.02.2608262`, WeChatLib `3.17.2`, Windows 11, Node `26.8.1`, Vite `8.2.2`, Rolldown `1.2.7`, React `19.2.8`.
- **Watcher correction:** DevTools logs explicitly report `initNewWatcher` for both this investigation and all four earlier c3523db cases. Those cases are not verified old-watcher tests. No watcher preference was changed here. This finding is scoped to the c3523db tests, not the separate earlier 12685e7 reports.
- Captured actual simulator HTTP responses through a project-scoped browser recording. These are responses delivered during automatic reloads, not later requests that could regenerate the bundle.
- Read and formatted extracted copies of installed DevTools JavaScript. The installed archive was not modified.

## 1. VPT: fresh App entry, stale Page entry

Command: `pnpm watch:wx:reported`, with the original cleanup configuration and `compileHotReLoad: false`.

After generation 1 → 2:

- Vite completed generation 2.
- Disk `pages/home/index.js` required `bootstrap-C6tki260.js` and imported `index-capsule-AjXsr0ds.js`.
- DevTools delivered a Page wrapper requiring generation-1 `bootstrap-DL6lVCo0.js` and importing `index-capsule-N79r2IRF.js`.
- The delivered main bundle's **App** wrapper already required generation-2 `bootstrap-C6tki260.js`. Its module definitions included both generations.
- The rendered hero remained at generation 1.

The compiler log records `unlinkDir pages`, followed by `addDir pages`, `addDir pages/home`, and `add pages/home/index.js`. It does not report an individual unlink for that child file. The corresponding assets directory also receives a directory unlink.

A narrowly targeted intervention appended an inert comment to the already-correct disk `pages/home/index.js`. No source edit, Vite rebuild, manual Compile, global cache clear, or project reopen was used for recovery. DevTools then delivered the generation-2 Page wrapper and rendered generation 2.

The next normal Vite source edit reproduced the problem and the same intervention recovered it again:

| Disk generation | Visible after ordinary rebuild | Visible after Page-file invalidation |
| --- | --- | --- |
| 2 | 1 | 2 |
| 3 | 2 | 3 |

The build log contains four builds: generation 1, two generation-2 builds, and generation 3. Both generation-2 builds completed before the first comment intervention. The filesystem timeline shows no App publication during either intervention; source-edit rounds do not necessarily map one-to-one to Vite builds.

The two diagnostic comments were overwritten/removed afterward. The fixture configuration is restored to its original cleanup behavior.

Key evidence:

- `evidence/default-1-2.har`
- `evidence/default-batch-2-delivered-page.js` versus `default-batch-2-disk-page.js`
- `evidence/default-batch-2-devtools-file-events.txt`
- `evidence/default-page-invalidation.har`
- `evidence/default-2-3-invalidation.har`
- Corresponding `*-visible.json` probes and screenshots

## 2. Native reproduction: directory versus file replacement

The fixture uses a fixed `pages/index/index.js` containing only a native `Page` with a numeric data value. No changed bootstrap names or bundler are involved in this test.

| Operation | New disk value | Rendered value | Delivered Page value |
| --- | --- | --- | --- |
| Initial | 1 | 1 | Baseline |
| Change the existing JS file | 2 | 2 | 2 |
| Remove/recreate its `pages` directory | 3 | **2** | **2** |
| Remove/recreate only the JS file | 4 | 4 | 4 |
| Remove/recreate its `pages` directory again | 5 | **4** | **4** |
| Change the existing JS file | 6 | 6 | 6 |

Directory and file replacement both used a 200 ms gap; observations were taken after four seconds. HAR responses confirm this is stale delivered code, not merely an automation data cache.

Reproduction helpers, from the local investigation directory listed above:

1. With the native fixture closed: `node prepare-native.ts page`.
2. Open `native-app` in DevTools and establish visible value 1.
3. Run `node publish-native-page.ts 2 change`.
4. Run `node publish-native-page.ts 3 replace-directory`.
5. Run `node publish-native-page.ts 4 replace-file`.
6. Allow each automatic reload to settle and inspect `#generation` after each operation.

Evidence: `native-cache-1-4.har`, `native-cache-4-6.har`, `native-cache-devtools-file-events.txt`, and the six native cache probes under `evidence/`.

## 3. Matching cache implementation

Extracted source: `ide-source/js/common/miniprogram-builder/project/advance/precompileProject.js`.

`PreCompileProject` maintains `_fileBufferCache`. Its event handler:

- Deletes a file's cached buffer on `unlink` or `change`.
- Updates file/directory sets on `unlinkDir`, but does not remove cached child buffers.
- Adds paths back on `add`/`addDir`, without invalidating those retained buffers.

`getFile()` can consequently return pre-deletion content for a re-created child path. This matches the native and VPT observations. Individual file invalidation restores current content; refreshing a file list alone is not equivalent to invalidating content.

The earlier explanation was too broad: this failure does not require changing filenames, nor does it mean Vite failed to notice the source edit. The recreated-directory cache path is the confirmed mechanism for stale output.

## 4. Bootstrap-publication investigation: bounded conclusions

A separate native entry experiment intentionally wrote a new `app.js` before its new bootstrap:

- A 200 ms entry-first gap recovered to the current generation.
- With a four-second gap, a captured main bundle required `bootstrap-5.js` but defined only `bootstrap-4.js` and `app.js`.
- Once bootstrap 5 arrived, another captured bundle defined it, and the UI recovered automatically to 5.

This demonstrates how an incomplete publication can produce an undefined module, but **does not explain persistence in the earlier VPT control**.

The VPT no-cleanup retest ran **30 source-edit rounds / 120 writes**, excluding setup, through generation 31. It included batch, 500 ms-spaced, 100 ms-spaced, and continuous spaced-to-burst sequences. Observed checkpoints 2, 3, 8, and 31 updated. The earlier persistent undefined-bootstrap error did not recur. An initial attempt with failed browser-target discovery/automation readiness was discarded and retained as `invalid-setup*`; it is not counted as an application failure or a measured test round.

The original failure's DevTools log does contain the add event for `bootstrap-CV1qxcsq.js`, as well as later App/Page change events. A simple claim that DevTools never received that file's event is therefore not justified. An in-flight compilation/cache race remains a hypothesis, not a conclusion.

Relevant evidence: `native-4-5.har`, `preserved-second-*.har`, `original-failure-devtools-file-events.txt`, and the earlier failure artifacts in `../evidence/`.

For the native entry experiment, prepare with `node prepare-native.ts entry` and use `publish-native.ts`; this is separate from the Page-cache scenario above.

## Verification, limits, and cleanup at investigation completion

- `node verify-evidence.ts` asserts the two VPT stale/recovery pairs, delivered wrapper identities, five native delivered values `[2, 2, 4, 4, 6]`, selected no-cleanup UI checkpoints, and original watcher mode.
- Investigation helpers pass TypeScript **7.0.2** strict checking with `tsc` and Biome checks.
- At investigation completion, the main checkout was clean at `c3523db`; no plugin/runtime implementation or installed DevTools code was changed.
- No complete VPT build/watch fix is claimed. Preserving output alone is still not a verified general fix, given the retained earlier failure. The reporter's exact filesystem `ENOENT` and Stable DevTools version were not reproduced/tested here.
- All investigation servers, the filesystem observer, recording session, and fixture project windows are closed. DevTools auto-restored an unrelated `C:/Users/james/projects/my-app/dist/wx` window; that window was left running rather than closed. Its temporary debugging listener remains loopback-only at `127.0.0.1:9228`. See `evidence/cleanup.json`.
- Retained VPT fixture source/output: generation **3**, original cleanup config. Native Page-cache fixture: generation **6**. Prior reports describe earlier snapshots, not this current fixture state.
