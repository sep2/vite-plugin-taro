---
name: test-published-packages
description: Test the newest published VPT release in a fresh npm-generated project, including typecheck, WX build, and DevTools HMR state retention. Use when asked to test npm artifacts or validate a published release.
compatibility: Requires Node.js 26+, npm, WeChat DevTools, wechatide, and an authorized test AppID in VITE_VPT_WECHAT_APP_ID.
---

# Test Published Packages

Reuse a ready WeChat DevTools session or initialize it through [wechatide-skill](../miniprogram-dev-skill/SKILL.md). Set `VITE_VPT_WECHAT_APP_ID` to an authorized test AppID; keep it out of logs and replies.

From this skill directory, run:

```sh
node scripts/test-published-packages.ts
```

Run once to completion. If backgrounded to respect tool timeouts, track its PID, log, and exit code under `packages/vite-plugin-taro/tmp/` in the repository.

## Runner responsibilities

- Select the newest publication from npm `latest` and `beta`, requiring matching creator/plugin versions within each channel.
- Generate a fresh project from the published creator, verify the registry plugin installation, run typecheck, and build WX.
- Verify visible HMR text edits and restoration, retained counter state, unchanged App-root files, and no new console diagnostics.
- Restore the edited text, close its project window, and stop its dev server. Retain `packages/vite-plugin-taro/tmp/vpt-published-packages-test` for diagnosis; the next run replaces it.

Let the runner own setup, validation, diagnostics, and cleanup. Use its evidence before taking additional actions; keep unrelated projects and processes untouched.

## Result

Require exit code `0` and `PASS`; report the selected version/channel, checks, and log path. A partial run is not a pass. On failure, use the runner diagnostics to identify the failing stage. If automation disagrees with a normal manual edit, report an automation mismatch rather than changing package code.
