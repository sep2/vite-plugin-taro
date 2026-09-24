# React tabs demo

A four-target VPT example with real Home, Explore, and About tab routes. `AppTabBar` in `src/components/app-tab-bar/app-tab-bar.tsx` is the one visible React bar shared by WeChat, Alipay, TikTok, and H5. Home keeps the default starter page intact. Tab metadata lives in `src/tab-pages.ts`; icons are imported from `src/assets/icons`.

WeChat and Alipay require an empty platform-specific tab bar entry so their default bars never flash before the React App renders. `vite.config.ts` copies only the current target's files from `wx-public/` or `zfb-public/`. TikTok uses `tabBar.custom`. Navigation uses `Taro.switchTab`, not `reLaunch`.

From the repository root:

```sh
pnpm build:plugin
pnpm typecheck:react-tabs-demo
pnpm build:react-tabs-demo:wx
pnpm build:react-tabs-demo:zfb
pnpm build:react-tabs-demo:tt
pnpm build:react-tabs-demo:h5
```

To develop, run `pnpm dev:react-tabs-demo:<target>` (`wx`, `zfb`, `tt`, or `h5`). For mini programs, open `demo/react-tabs-demo/dist/<target>` in the corresponding developer tool. For an H5 production preview, run `pnpm preview:react-tabs-demo:h5`.

Copy `.env.example` to `.env.local` and set the appropriate `VITE_VPT_*_APP_ID` before previewing on a device. Changes to native stub files require restarting the dev build.
