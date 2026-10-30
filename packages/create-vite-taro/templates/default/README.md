# VPT

基于 Vite 8、React 19、Taro、TypeScript 和 Tailwind CSS，一套代码运行于微信、支付宝、淘宝、抖音小程序和 Web。

[文档](https://vpt.js.org) · [GitHub](https://github.com/sep2/vite-plugin-taro)

## 快速开始

```sh
pnpm install
```

开发小程序前，在 `.env.local` 中填写对应平台的 App ID，然后选择开发命令：

| 平台 | 开发 | 构建 | 构建目录 |
| --- | --- | --- | --- |
| 微信 | `pnpm dev:wx` | `pnpm build:wx` | `dist/wx` |
| 支付宝 | `pnpm dev:zfb` | `pnpm build:zfb` | `dist/zfb` |
| 淘宝 | `pnpm dev:tb` | `pnpm build:tb` | `dist/tb` |
| 抖音 | `pnpm dev:tt` | `pnpm build:tt` | `dist/tt` |
| Web | `pnpm dev:h5` | `pnpm build:h5` | `dist/h5` |

监听文件变化并自动重新构建生产版本：`pnpm build:wx --watch`。

其他命令：`pnpm typecheck` 检查类型，`pnpm preview:h5` 预览 Web 生产构建。

## 开发

- `src/pages/home/index.tsx`：首页，从这里开始修改。
- `vite.config.ts`：页面注册、构建目标与平台配置。
- `src/tab-pages.ts`：Tab 路由、标签和图标名称。
- `src/app.css`：全局样式与 Tailwind 主题，保留 `@source "./";` 并使用完整类名。

通过 `virtual:taro/api` 和 `virtual:taro/components` 使用 Taro API 与组件。更多用法见[快速开始指南](https://vpt.js.org/guides/quick-start/)。
