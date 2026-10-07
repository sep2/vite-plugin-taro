# Skyline 共享元素示例

通过原生 Skyline 共享元素动画在列表页与详情页之间切换，并在返回时保留列表页的 React 状态。

<video src="https://vpt.js.org/share-element-demo.mp4" controls autoplay muted loop playsinline width="320"></video>

## 运行

1. 将 `demo/skyline-share-element-demo/.env.example` 复制为同目录下的 `.env.local`，填写微信小程序 AppID。
2. 在仓库根目录执行：

```bash
pnpm prepare:taro
pnpm build:plugin
pnpm build:skyline-share-element-demo:wx
```

3. 在微信开发者工具中打开 `demo/skyline-share-element-demo/dist/wx`，使用 **3.8.12 或更高版本**的基础库。
4. 确认列表页与详情页均显示 **Renderer: skyline**。点击卡片进入详情页，再返回列表页，反复验证卡片的展开与收缩动画，以及列表计数器的状态保留。

开发时运行 `pnpm dev:skyline-share-element-demo:wx`；类型检查运行 `pnpm typecheck:skyline-share-element-demo`。

## 可选：检查动画帧

构建完成后执行：

```bash
node demo/skyline-share-element-demo/scripts/instrument.ts
```

在微信开发者工具中重新编译。页面跳转前，在控制台执行 `getApp().shareElementFrames = []` 清空帧记录；跳转后检查该数组，确认动画进度与矩形尺寸随帧变化。重新构建可恢复常规构建产物。

此检查用于验证动画过程；首帧时序与真机表现仍需单独验证。若页面显示 **Renderer: webview**，说明当前使用的是 WebView 渲染器，需要切换至 Skyline 后再验证。
