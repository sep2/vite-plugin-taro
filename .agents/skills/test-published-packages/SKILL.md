---
name: test-published-packages
description: Test the newest published VPT release in a fresh npm-generated project, including template and DOM rendering, typecheck, WX builds, and DevTools HMR state retention. Use when asked to test npm artifacts or validate a published release.
compatibility: Requires Node.js 26+, npm, WeChat DevTools, wechatide, and an authorized test AppID in VITE_VPT_WECHAT_APP_ID.
---

# Test Published Packages

Set `VITE_VPT_WECHAT_APP_ID` to an authorized test AppID in `packages/create-vite-taro/.env.local`, or export it to override the repo setting. Keep the value out of logs and replies.

Run from the repository root:

```sh
node --env-file-if-exists=packages/create-vite-taro/.env.local .agents/skills/test-published-packages/scripts/test-published-packages.ts
```

The runner checks the current WeChat DevTools session and tests both renderers. Append `--renderer template` or `--renderer dom` to select one. If the status check fails, use its diagnostic and the [DevTools readiness guide](../miniprogram-dev-skill/references/environment-readiness.md) to identify the next step.

Run once to completion. If backgrounded to respect tool timeouts, track its PID, log, and exit code under `packages/vite-plugin-taro/tmp/` in the repository.

## Runner responsibilities

- Select the newest publication from npm `latest` and `beta`, requiring matching creator/plugin/runtime versions within each channel. Inconsistent tags stop the run until publication completes.
- Generate a fresh project from the exact selected creator version, install once, and verify the plugin and runtime registry tarballs.
- Prepare each selected renderer from the pristine scaffold, then run typecheck and a production WX build.
- Verify the active renderer in DevTools. DOM requires a captured native root and must not fall back to template rendering.
- Locate the template counter by its generated native ID. DOM uses a test-only component ID and reads the native counter's integer-string property; fixture-only type declarations expose the standard element ID.
- Verify visible HMR text edits and restoration, retained counter state, unchanged App-root files, and no new console diagnostics for every selected renderer.
- Restore the edited text, close its project window, and stop its dev server after each renderer. Retain `packages/vite-plugin-taro/tmp/vpt-published-packages-test` and per-renderer `vpt-published-packages-test-<renderer>-vite.log` files for diagnosis; the next run replaces its fixture and selected logs.

Let the runner own setup, validation, diagnostics, and cleanup. Use its evidence before taking additional actions; keep unrelated projects and processes untouched.

## Result

Require exit code `0` and `PASS` after every selected renderer completes; report the selected version/channel, renderers, checks, and log path. A partial run is not a pass. On failure, use the runner diagnostics to identify the failing stage. If automation disagrees with a normal manual edit, report an automation mismatch rather than changing package code.
