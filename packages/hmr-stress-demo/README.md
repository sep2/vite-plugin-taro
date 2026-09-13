# Mini Program HMR stress demo

A repository-only WeChat and Alipay Mini Program fixture for exercising HMR with a large retained React/Taro tree.

> **AI-assisted development is recommended:** Follow the [VPT AI development guide](https://vpt.js.org/guides/ai/) and let a coding assistant create, develop, test, and validate your app.

Each page renders:

- a 24-component linear chain around the edited marker;
- a 364-node ternary recursive tree;
- 243 stateful leaf components;
- 96 additional stateful grid cells;
- controlled input, counter, selection, density, and mount-token state.

The singleton App projects the Page outlet through a 16-level host chain beside a second 16-level decorative branch, and it consumes the same edited marker as both Pages. Every marker generation also reverses the two keyed App branches, forcing structural App HMR while retaining the Page subtree. The mirror route mounts a second Page copy while the primary Page remains in the back stack. Together they stress App-view slot routing, App and Page React Refresh, cumulative patch delivery, native Page replacement on WX, in-place interpreter updates on ZFB, large `data` snapshot restoration, hidden-page recovery, runtime-requested rebuilds, and invalid-source recovery.

## Automated WeChat DevTools suite

The automated suite remains WeChat-specific because it uses the `wechatide` runtime. It creates a clean fixed fixture at `/tmp/vite-plugin-taro-hmr-stress-v1`, starts Vite, opens or reuses the same WeChat DevTools project, performs assertions, stops Vite, and quits DevTools through `wechatide -c Pi quit` (using the configured client name). Quitting DevTools closes all of its project windows. Authorize the fixed CLI client once; subsequent runs reuse both that trust and the fixed project path without another authorization prompt:

```bash
wechatide auth -c Pi
pnpm setup:hmr-stress-demo:devtools   # open DevTools before each test invocation
pnpm test:hmr-stress-demo:devtools
```

Setup and the aggregate suite may each use up to 60 seconds. Every standalone case has a hard 30-second deadline and reuses the fixed runtime. The complete suite runs only the strict burst, rebuild storm, and syntax recovery cases. Runtime assertions replace fixed settle sleeps, including observing the restoration marker before publishing and awaiting the baseline. Plugin rebuilding is opt-in.

Individual cases can be run independently. Run `pnpm setup:hmr-stress-demo:devtools` before each invocation, since each test quits DevTools afterward:

```bash
pnpm stress:hmr-stress-demo:burst         # 30 edits at 8 ms
pnpm test:hmr-stress-demo:rebuild         # mixed ACK/rebuild report storms
pnpm test:hmr-stress-demo:recovery        # syntax failures and passive HMR recovery
```

No stress edit touches `packages/hmr-stress-demo/src`. The portable harness deliberately avoids RAM-disk provisioning: it confines writes to one fixed temporary project and bounds the strict burst to 30 source generations, plus two restoration writes. Syntax recovery uses one invalid generation plus restoration, and post-recovery health uses five edits. This retains the failure-producing profiles without thousands of filesystem writes or platform-specific mount setup.

Every invocation replaces the complete temporary `src` tree from the repository baseline. The fixed directory and last complete output remain on disk to preserve project identity. Setup intentionally leaves the DevTools window open for the next test. Vite overwrites the active development output before a case starts, and a fixed process lock prevents concurrent runs from sharing the workspace. Normal completion, failures, and SIGINT/SIGTERM terminate owned subprocess groups, drain the Vite log stream, and release the lock. On POSIX this includes descendants of command wrappers; Windows termination currently covers direct children only. Test cleanup uses the supported `wechatide quit` command rather than OS-level commands to close DevTools. It has a separate 12-second timeout, independent of the test deadline; cancellation or a failed quit is reported as an error. The fixture remains on disk for inspection.

Subprocess cleanup regression tests (no DevTools required):

```bash
node --test packages/hmr-stress-demo/scripts/create-process-scope.test.ts
```

The complete suite checks:

1. burst patch publication through both the deep App view and Pages, with primary and hidden mirror state retention;
2. unique Page-slot routing while keyed deep App branches repeatedly reorder, marker restoration, and valid two-Page navigation stacks;
3. duplicate and out-of-order ACK conflation under rebuild-report storms;
4. build identity rotation and non-empty `assets/global.wxss` after every complete rebuild;
5. invalid syntax does not start a complete build or alter the live Page heap;
6. valid source after failure resumes HMR without rotating the build identity;
7. HMR remains healthy and preserves state after syntax recovery;
8. the App console remains free of patch, Refresh, reconciliation, and `setData` failures.

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
```

## Manual development

For exploratory work rather than write-heavy pressure tests:

```bash
pnpm build:plugin
VITE_VPT_WECHAT_APP_ID=<appid> pnpm dev:hmr-stress-demo:wx
VITE_VPT_ALIPAY_APP_ID=<appid> pnpm dev:hmr-stress-demo:zfb
```

Open `packages/hmr-stress-demo/dist/wx` in WeChat DevTools or `packages/hmr-stress-demo/dist/zfb` in Alipay Mini Program Studio. ZFB uses the interpreter HMR mode required by the Alipay development tool. Do not run burst publishers against either repository-backed server; use the automated WeChat commands above so source generations remain confined to the disposable fixture.

Build-only validation is available for both targets:

```bash
pnpm build:hmr-stress-demo:wx
pnpm build:hmr-stress-demo:zfb
```
