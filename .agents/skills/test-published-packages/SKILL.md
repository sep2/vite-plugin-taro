---
name: test-published-packages
description: Validates the newest published create-vite-taro and vite-plugin-taro release across the npm latest and beta channels, including registry provenance, typecheck, WX build, and WeChat DevTools HMR state retention. Use after publishing or when testing npm artifacts independently from the workspace.
compatibility: Requires Node.js 26+, npm, WeChat DevTools, wechatide, and the repository's fixed test AppID.
---

# Test Published Packages

Run the bundled test script from this skill directory:

```bash
node scripts/test-published-packages.ts
```

The script owns the complete workflow:

- resolves both the npm `latest` and `beta` channels and selects the package pair with the newest publication time;
- requires `create-vite-taro` and `vite-plugin-taro` to resolve to the same version within each channel;
- creates `/tmp/vpt-published-packages-test` from that published creator channel;
- rejects local, linked, or non-registry plugin installations;
- runs typecheck and a production WX build;
- opens the fresh WX development output in WeChat DevTools;
- changes visible text and verifies it through a lightweight element query;
- verifies the native counter retains React state across the edit and restoration;
- collects HMR diagnostics on failure;
- restores source, closes only its project window, and stops its dev server.

A pass requires every stage. Do not substitute workspace packages or classify a partial run as passing. If automated observation fails while the same published project works through a normal manual edit, report a harness/DevTools automation mismatch rather than changing package code.

The disposable project is retained for diagnosis and replaced on the next run. Never print the AppID or delete unrelated temporary projects.
