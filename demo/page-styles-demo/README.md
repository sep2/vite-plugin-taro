# page-styles-demo

App/Page stylesheet ownership and native rendering fixture for WeChat (`wx`), Alipay (`zfb`), and TikTok (`tt`). No H5 target.

## Run

From the repository root:

```bash
pnpm install
pnpm dev:page-styles-demo:wx
# Or: pnpm dev:page-styles-demo:zfb / pnpm dev:page-styles-demo:tt
```

Import `demo/page-styles-demo/dist/<target>` into the corresponding native developer tools, **not** the source directory. Copy `.env.example` to `.env.local` inside this demo to set App IDs. WX defaults to `touristappid`; supply your own App ID where required. Native tool domain checks are disabled for local HMR.

WX uses DevTools HMR; Alipay and TikTok use interpreter HMR. For TikTok, use DevTools 4.1.4+ and base library 2.98.0.0+ for native stylesheet hot updates.

```bash
pnpm build:page-styles-demo:wx
pnpm build:page-styles-demo:zfb
pnpm build:page-styles-demo:tt
pnpm typecheck:page-styles-demo
pnpm test:page-styles-demo
```

## Fixtures

| Fixture | Expected result |
| --- | --- |
| `src/app.css` | Green App banner and global layout on all pages; emitted only in `assets/global.*`. |
| `src/pages/red/red.css` | Red heading/cards, including inside `CustomWrapper` and a 20-level native View tree. |
| `src/pages/blue/blue.css` | Same heading/card selectors, but blue; no Red styles. |
| `src/components/shared-card.css` | Purple card on Red and Blue, copied into both page stylesheets, never App CSS. |
| `src/components/shared-card.module.css` | Yellow badge with the same generated class on Red and Blue. |
| `src/components/lazy-card.css` | Orange lazy card, Red only. CSS is included even before clicking **Load lazy card**. |
| Plain page | Imports no CSS; its page stylesheet is empty. The leak probe stays gray despite using page-only class names. |

The root `app.wxss` / `app.acss` / `app.ttss` imports `assets/global.*`. Each route owns its sibling `pages/<name>/<name>.*` stylesheet.

## Native rendering and HMR checklist

1. Open Red. Confirm red direct, wrapper, and deep cards; purple shared card; yellow module badge; gray Blue-only leak probe.
2. Increment the App, Red, and wrapper counters. Load the lazy card and increment its counter.
3. Change colors in `src/pages/red/red.css`. All three card locations should update without resetting counters. App CSS should remain unchanged on disk.
4. Open Blue. Its cards must be blue, and its Red/lazy leak probe gray. Increment its counters, edit `blue.css`, and check that the counters survive.
5. While Blue is visible, edit `red.css`. Return using **Back to retained Red page**. Red should show the edit and retain its counters and loaded lazy card. Blue must not inherit Red's colors.
6. Edit `shared-card.css` and `shared-card.module.css`: both styled pages should update, with neither stylesheet leaking into App/Plain. Edit `lazy-card.css`: only Red's lazy card should change.
7. Open Plain after visiting both styled pages. Its leak probe must stay gray. Edit `app.css`: global styling should update on every page without resetting counters.
8. To check stale CSS removal, remove `import './blue.css'` from `blue.tsx`. Blue's heading/card colors should disappear and its output should lose `.blue-only`; shared Page CSS must remain. Restore the import afterward.

Counter retention applies to CSS-only updates and retained pages. Returning with `navigateBack` destroys the popped page; reopening it is a fresh mount.

The automated tests build this actual demo in memory for all three targets and check App/Page ownership, conflicting selectors, shared CSS, CSS Module identity, lazy CSS, native route output, and empty Plain stylesheets. They do **not** prove native component style propagation or DevTools HMR state retention; use the checklist for those checks.
