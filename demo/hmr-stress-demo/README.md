# Mini Program HMR stress demo

A repository-only WeChat and Alipay Mini Program fixture for exercising HMR with a large retained React/Taro tree. TikTok (抖音 / TT) is supported by VPT but is not configured in this fixture.

> **AI-assisted development is recommended:** Follow the [VPT AI development guide](https://vpt.js.org/guides/ai/) and let a coding assistant create, develop, test, and validate your app.

Each page renders:

- a 24-component linear chain around the edited marker;
- a 364-node ternary recursive tree;
- 243 stateful leaf components;
- 96 additional stateful grid cells;
- controlled input, counter, selection, density, and mount-token state.

The singleton App projects the Page outlet through a 16-level host chain beside a second 16-level decorative branch, and it consumes the same edited marker as both Pages. Every marker generation also reverses the two keyed App branches, forcing structural App HMR while retaining the Page subtree. The mirror route mounts a second Page copy while the primary Page remains in the back stack. Together they stress App-view slot routing, App and Page React Refresh, cumulative patch delivery, native Page replacement on WX, in-place interpreter updates on ZFB, large `data` snapshot restoration, hidden-page recovery, runtime-requested rebuilds, and invalid-source recovery. These flows do not exercise TT.

## Automated WeChat DevTools suite

The automated suite remains WeChat-specific because it uses the `wechatide` runtime. It creates a clean fixed fixture at `<os.tmpdir()>/vite-plugin-taro-hmr-stress-v1`, starts Vite, opens or reuses the same WeChat DevTools project, performs assertions, stops Vite, and closes only its own project window. Other DevTools projects remain open. Authorize the fixed CLI client once; subsequent runs reuse both that trust and the fixed project path without another authorization prompt:

```bash
wechatide auth -c Pi
pnpm test:hmr-stress-demo:devtools
pnpm test:hmr-stress-demo:interpreter
# Optional: open the fixture without running assertions, leaving its window open.
pnpm setup:hmr-stress-demo:devtools
```

Setup and the restart case may each use up to 60 seconds; `cold-page` has a 90-second deadline, the aggregate suite 150 seconds, and two-project port-swap 120 seconds. Other standalone cases have a 30-second deadline. Each invocation attaches to the newly built output itself; a prior setup invocation is not required. The complete suite runs both cold-page checks, strict burst, rebuild storm, syntax recovery, and server restart cases. Runtime assertions replace fixed settle sleeps, including observing the restoration marker before publishing and awaiting the baseline. Plugin rebuilding is opt-in.

The `cold-page` command first edits a shared component before the mirror Page is mounted, then restarts the disposable Vite project to give the mirror-only edit an independent, never-mounted App generation. The second check currently fails: the patch contains the edited mirror title, but the first mirror mount shows the old title. Because `all` includes this check, it also fails until the bug is fixed.

Individual cases can be run independently:

```bash
pnpm stress:hmr-stress-demo:burst         # 30 edits at 8 ms
pnpm test:hmr-stress-demo:cold-page       # shared edit, then isolated mirror-only edit (currently fails)
pnpm test:hmr-stress-demo:rebuild         # mixed ACK/rebuild report storms
pnpm test:hmr-stress-demo:recovery        # syntax failures and passive HMR recovery
pnpm test:hmr-stress-demo:restart         # real Vite process restart, then rendered HMR updates
pnpm test:hmr-stress-demo:port-swap       # reverse two projects' Vite ports, then verify independent HMR
pnpm test:hmr-stress-demo:watch-restart   # replace vite build --watch, then render two later edits
```

No stress edit touches `demo/hmr-stress-demo/src`. The portable harness deliberately avoids RAM-disk provisioning: it confines writes to one fixed temporary project and bounds the strict burst to 30 source generations, plus two restoration writes. Syntax recovery uses one invalid generation plus restoration, and post-recovery health uses five edits. This retains the failure-producing profiles without thousands of filesystem writes or platform-specific mount setup.

Every invocation replaces the complete temporary `src` tree from the repository baseline. The fixed directory and last complete output remain on disk to preserve project identity. Setup intentionally leaves the DevTools window open for inspection. Vite overwrites the active development output before a case starts, and a fixed process lock prevents concurrent runs from sharing the workspace. Normal completion, failures, and SIGINT/SIGTERM terminate owned subprocess groups, drain the Vite log stream, and release the lock. On POSIX this includes descendants of command wrappers; Windows termination currently covers direct children only. Vite runs directly under Node on every platform; Windows links the fixture dependencies with a junction, which does not require symlink privileges. Test cleanup uses `wechatide close_project_window` with this fixture's path, never a global quit. It has a separate 12-second timeout, independent of the test deadline; cancellation or a failed close is reported as an error. The fixture remains on disk for inspection.

Subprocess cleanup regression tests (no DevTools required):

```bash
node --test demo/hmr-stress-demo/scripts/create-process-scope.test.ts
```

The complete suite checks:

1. a shared component edited while only the primary Page is mounted renders its latest generation when the mirror Page is first opened; after a fresh App build, an edit belonging only to the unmounted mirror Page must also render on its first mount (currently fails);
2. burst patch publication through both the deep App view and Pages, with primary and hidden mirror state retention;
3. unique Page-slot routing while keyed deep App branches repeatedly reorder, marker restoration, and valid two-Page navigation stacks;
4. duplicate and out-of-order ACK conflation under rebuild-report storms;
5. build identity rotation and non-empty `assets/global.wxss` after every complete rebuild;
6. invalid syntax does not start a complete build or alter the live Page runtime state;
7. valid source after failure resumes HMR without rotating the build identity;
8. HMR remains healthy and preserves state after syntax recovery;
9. the App console remains free of patch, Refresh, reconciliation, and `setData` failures;
10. restarting the actual Vite process, without reopening or manually compiling DevTools, removes obsolete output and loads a new baseline;
11. two successive source edits after restart appear in the simulator while retaining input state, build identity, and the App stylesheet marker;
12. two simultaneously open projects survive reverse-order Vite restarts that exchange their ports, then independently render later HMR edits without cross-project identity or state corruption.

The harness observes the real App's startup report for the current build before publishing edits; a rendered Page can appear before its HMR socket opens. The restart case first proves HMR works before restarting, then delays each full compilation by three seconds so cleanup behavior is visible to the open project. It distinguishes a successful App reload from working post-restart HMR: changing a patch file or opening a new socket alone cannot satisfy its rendered-marker assertions. Both Vite process logs are retained in the fixture's `vite.log`.

The standalone port-swap case uses two fixed trusted projects under `<os.tmpdir()>/vite-plugin-taro-hmr-port-swap-v1`. It starts A before B on adjacent ports, stops both servers, then starts B before A from A's former port. Both DevTools windows remain open throughout; the case requires each replacement App to acquire its own new build identity and exchanged endpoint before a later source edit can update only that project's rendered marker while retaining input state.

The standalone build-watch restart case uses the same fixed project and ownership boundary but launches the production `vite build --watch` path. It proves one rendered edit, replaces the watcher process without reopening or manually compiling DevTools, and then requires two more rendered edits. Every watched build is delayed by three seconds; this path performs full reloads and does not assert state retention.

Useful environment overrides:

```text
VITE_VPT_WECHAT_APP_ID           WeChat App ID; falls back to the demo .env.local, then touristappid
VITE_VPT_ALIPAY_APP_ID           Alipay App ID for manual ZFB development
VPT_HMR_DEVTOOLS_CLIENT          wechatide client name; default Pi
VPT_HMR_BUILD_PLUGIN             set to 1 to rebuild plugin dist before the suite
VPT_HMR_STRESS_UPDATES           burst update count
VPT_HMR_STRESS_INTERVAL_MS       burst interval
VPT_HMR_REBUILD_ROUNDS           rebuild storm rounds; default 1
VPT_HMR_REPORTS_PER_ROUND        reports per rebuild round; default 100
VPT_HMR_PORT_SWAP_BASE           first preferred port for the two-project case; default 53200
```

## Manual development

For exploratory work rather than write-heavy pressure tests:

```bash
pnpm build:plugin
VITE_VPT_WECHAT_APP_ID=<appid> pnpm dev:hmr-stress-demo:wx
VITE_VPT_ALIPAY_APP_ID=<appid> pnpm dev:hmr-stress-demo:zfb
```

Open `demo/hmr-stress-demo/dist/wx` in WeChat DevTools or `demo/hmr-stress-demo/dist/zfb` in Alipay Mini Program Studio. ZFB uses interpreter HMR. For TikTok development, use `pnpm dev:loan-genius:tt` and open `demo/loan-genius/dist/tt` in TikTok DevTools; this stress fixture has no TT target. Do not run burst publishers against either repository-backed server; use the automated WeChat commands above so source generations remain confined to the disposable fixture.

Build-only validation is available for both targets:

```bash
pnpm build:hmr-stress-demo:wx
pnpm build:hmr-stress-demo:zfb
```
