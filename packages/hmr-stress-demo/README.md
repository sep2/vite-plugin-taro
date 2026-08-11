# WX HMR stress demo

A repository-only Mini Program fixture for exercising Page replacement with a large retained React/Taro tree.

Each page renders:

- a 24-component linear chain around the edited marker;
- a 364-node ternary recursive tree;
- 243 stateful leaf components;
- 96 additional stateful grid cells;
- controlled input, counter, selection, density, and mount-token state.

The mirror route mounts a second copy while the primary page remains in the back stack. This stresses cumulative patch delivery, repeated native Page replacement, large `data` snapshot restoration, React Refresh state retention, hidden-page recovery, runtime-requested rebuilds, and invalid-source recovery.

## Automated DevTools suite

The suite creates a clean fixed fixture at `/tmp/vite-plugin-taro-hmr-stress-v1`, starts Vite, opens or reuses the same WeChat DevTools project, performs assertions, and stops Vite. Authorize the fixed CLI client once; subsequent runs reuse both that trust and the fixed project path without another authorization prompt:

```bash
wechatide auth -c Pi
pnpm setup:hmr-stress-demo:devtools   # one cold window setup
pnpm test:hmr-stress-demo:devtools
```

Setup alone may use up to 60 seconds for the first DevTools compile. Every actual case has a hard 30-second deadline and reuses that fixed runtime. The complete suite runs only the strict burst, rebuild storm, and syntax recovery cases. Runtime assertions replace long fixed settle sleeps, and plugin rebuilding is opt-in.

Individual cases can be run independently:

```bash
pnpm stress:hmr-stress-demo:burst         # 30 edits at 8 ms
pnpm test:hmr-stress-demo:rebuild         # mixed ACK/rebuild report storms
pnpm test:hmr-stress-demo:recovery        # syntax failures and recovery builds
```

No stress edit touches `packages/hmr-stress-demo/src`. The portable harness deliberately avoids RAM-disk provisioning: it confines writes to one fixed temporary project and bounds the strict burst to 30 source generations, plus two restoration writes. Syntax recovery uses one invalid generation plus restoration, and post-recovery health uses five edits. This retains the failure-producing profiles without thousands of filesystem writes or platform-specific mount setup.

Every invocation replaces the complete temporary `src` tree from the repository baseline. The fixed directory, last complete output, and DevTools window remain warm to preserve project authorization and avoid cold automator attachment. Vite overwrites the active development output before a case starts, and a fixed process lock prevents concurrent runs from sharing the workspace.

The complete suite checks:

1. burst patch publication with primary and hidden mirror state retention;
2. marker restoration and valid two-Page navigation stacks;
3. duplicate and out-of-order ACK conflation under rebuild-report storms;
4. build identity rotation and non-empty `assets/global.wxss` after every complete rebuild;
5. invalid syntax does not start a wedged complete build;
6. valid source after failure causes exactly one recovery build;
7. HMR remains healthy and preserves state after syntax recovery;
8. the App console remains free of patch, Refresh, reconciliation, and `setData` failures.

Useful environment overrides:

```text
VITE_PLUGIN_TARO_WECHAT_APP_ID   App ID; falls back to the demo .env.local, then touristappid
VPT_HMR_DEVTOOLS_CLIENT          wechatide client name; default Pi
VPT_HMR_BUILD_PLUGIN             set to 1 to rebuild plugin dist before the suite
VPT_HMR_STRESS_UPDATES           burst update count
VPT_HMR_STRESS_INTERVAL_MS       burst interval
VPT_HMR_STRESS_SETTLE_MS         delay separating restoring and baseline generations; default 100
VPT_HMR_REBUILD_ROUNDS           rebuild storm rounds; default 1
VPT_HMR_REPORTS_PER_ROUND        reports per rebuild round; default 100
```

## Manual development

For exploratory work rather than write-heavy pressure tests:

```bash
pnpm build:plugin
VITE_PLUGIN_TARO_WECHAT_APP_ID=<appid> pnpm dev:hmr-stress-demo:wx
```

Open `packages/hmr-stress-demo/dist/wx` manually. Do not run burst publishers against this repository-backed server; use the automated commands above so source generations remain confined to the disposable fixture.
