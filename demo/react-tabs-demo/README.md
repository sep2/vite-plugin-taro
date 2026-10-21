# React 标签栏示例

三个真实 Tab 页面通过 `Taro.switchTab` 切换，保留已访问页面的 React 状态。

每个页面负责自己的全屏布局，并向共用的 `TabBar` 组件传入当前路径。`App` 负责应用生命周期和全局样式，直接返回 `children`。

微信通过 `tabBar.custom: true` 配置接管标签栏渲染。页面启用 `prerender: true`，在首帧同步渲染页面内容和 React 标签栏。

<video src="https://github.com/user-attachments/assets/aa2da4bb-fe60-4d3b-9a94-8df17a4e73ae" controls autoplay muted loop playsinline width="320"></video>

## 运行

将当前目录的 `.env.example` 复制为 `.env.local`，填写微信的 AppID。

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
- `src/components/tab-bar/tab-bar.tsx`：由页面路径驱动的 React 标签栏。
- `src/pages/`：各 Tab 页面的布局、内容和标签栏。
- `vite.config.ts`：原生 Tab 路由、自定义标签栏和页面预渲染配置。
