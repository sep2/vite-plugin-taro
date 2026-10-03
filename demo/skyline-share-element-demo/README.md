# Skyline shared-element demo

A gallery/detail demo with native Skyline push/pop animations and retained gallery state.

## Run

1. Copy `.env.example` to `.env.local` and set your WeChat AppID.
2. From the repository root:

```bash
pnpm prepare:taro
pnpm build:plugin
pnpm build:skyline-share-element-demo:wx
```

3. Open `demo/skyline-share-element-demo/dist/wx` in WeChat DevTools with base library **3.8.12+**.
4. Confirm both pages show **Renderer: skyline**. Tap a tile, go back, and repeat. The tile should expand/shrink, and the gallery counter should survive navigation.

For development, use `pnpm dev:skyline-share-element-demo:wx`. Run `pnpm typecheck:skyline-share-element-demo` to typecheck.

## Optional frame check

After building:

```bash
node demo/skyline-share-element-demo/scripts/instrument.ts
```

Recompile in DevTools. Clear `getApp().shareElementFrames = []` in the console before navigating, then inspect it afterward for changing progress and rectangle sizes. Rebuild to remove the probe.

This checks animation, not a first-frame timing guarantee. Also test on real devices; a **WebView** badge means Skyline is not active.
