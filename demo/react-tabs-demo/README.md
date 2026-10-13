# React 标签栏示例

三个 Tab 页面共用 React 标签栏，通过 `Taro.switchTab` 切换。

页面设置中启用了预渲染 prerender: true，在第一帧就渲染整个页面，切换 tab 不再闪屏。

## 运行

将当前目录的 `.env.example` 复制为 `.env.local`，填写目标平台的 AppID。

在仓库根目录执行：

```sh
pnpm install
pnpm prepare:taro
pnpm build:react-tabs-demo:wx
```

小程序开发工具打开 `demo/react-tabs-demo/dist/wx`。

## Skyline
把 skylineRenderEnable 设置为 true 即可。

## 主要文件

- `src/tab-pages.ts`：页面路由、标签和图标名称。
- `src/components/app-tab-bar/app-tab-bar.tsx`：React 标签栏。
- `wx-public/`、`zfb-public/`：隐藏平台默认标签栏的占位组件。
