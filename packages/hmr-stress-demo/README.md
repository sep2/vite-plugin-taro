# WX HMR stress demo

A repository-only Mini Program fixture for exercising Page replacement with a large retained React/Taro tree.

Each page renders:

- a 24-component linear chain around the edited marker;
- a 364-node ternary recursive tree;
- 243 stateful leaf components;
- 96 additional stateful grid cells;
- controlled input, counter, selection, density, and mount-token state.

The mirror route mounts a second copy while the primary page remains in the back stack. This stresses cumulative patch delivery, repeated native Page replacement, large `data` snapshot restoration, React Refresh state retention, and hidden-page recovery together.

## Run

```bash
pnpm build:plugin
VITE_PLUGIN_TARO_WECHAT_APP_ID=<appid> pnpm dev:hmr-stress-demo:wx
```

Open `packages/hmr-stress-demo/dist/wx` in WeChat DevTools. Change `#stress-input`, increment the counter, open the mirror route, and then run one of:

```bash
pnpm stress:hmr-stress-demo
pnpm stress:hmr-stress-demo:burst
```

The paced profile publishes 30 edits at 180 ms intervals. The burst profile publishes 60 edits at 8 ms intervals. Both use a distinct `stress-restoring` generation to drain the update backlog, then restore `src/components/hmr-marker.ts` to baseline in a `finally` block.

Useful environment overrides:

```text
VPT_HMR_STRESS_UPDATES
VPT_HMR_STRESS_INTERVAL_MS
VPT_HMR_STRESS_SETTLE_MS
```

After the run, verify:

1. `#hmr-marker` returns to `marker:baseline`.
2. `#stress-input`, `#state-value`, and `#mount-token` are unchanged.
3. both routes remain non-empty and navigation Back restores the primary tree.
4. the App console contains no patch, Refresh, reconciliation, or `setData` failures.
5. ordinary updates changed only `dist/wx/hmr/patches.js`.
