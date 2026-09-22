# Loan Genius

简体中文 | [English](README.en.md)

基于 VPT 的房贷计算器示例，一套源码支持微信、支付宝、抖音小程序和 Web。

此项目迁移自 [wuba/Taro-Mortgage-Calculator](https://github.com/wuba/Taro-Mortgage-Calculator)。

![Loan Genius screenshot](./screenshots/demo.webp)

[VPT 文档](https://vpt.js.org) · [AI 开发指南](https://vpt.js.org/guides/ai/)

## 快速开始

需要 Node.js 26+、pnpm 12，以及目标平台的小程序开发者工具。

首先初始化仓库：

```sh
git clone https://github.com/sep2/vite-plugin-taro.git
cd vite-plugin-taro
pnpm install
pnpm prepare:taro
pnpm build:plugin
```

（可选）在 `demo/loan-genius/.env.local` 中填写对应平台的 App ID：

```dotenv
VITE_VPT_WECHAT_APP_ID=your_wechat_app_id
VITE_VPT_ALIPAY_APP_ID=your_alipay_app_id
VITE_VPT_TIKTOK_APP_ID=your_tiktok_app_id
```

## 开发与构建

按目标选择命令，脚本会自动设置 `VITE_VPT_TARGET`：

| 目标 | 开发模式 | 生产构建 | 构建目录 |
| --- | --- | --- | --- |
| 微信 | `pnpm dev:loan-genius:wx` | `pnpm build:loan-genius:wx` | `demo/loan-genius/dist/wx` |
| 支付宝 | `pnpm dev:loan-genius:zfb` | `pnpm build:loan-genius:zfb` | `demo/loan-genius/dist/zfb` |
| 抖音 | `pnpm dev:loan-genius:tt` | `pnpm build:loan-genius:tt` | `demo/loan-genius/dist/tt` |
| Web | `pnpm dev:loan-genius:h5` | `pnpm build:loan-genius:h5` | `demo/loan-genius/dist/h5` |

- 小程序：等待初始构建完成，在对应开发者工具中导入构建目录，不要导入源码目录。
- Web：访问终端显示的地址；构建后用 `pnpm preview:loan-genius:h5` 预览。
- 开发时保持命令运行。各平台工具版本与热更新配置见[开发热更新指南](https://vpt.js.org/guides/hot-module-replacement/)。

## 修改应用

- `vite.config.ts`：目标、页面、应用与开发者工具配置。
- `src/app.tsx` / `src/app.css`：应用入口、全局样式和 Tailwind CSS。
- `src/pages/calculator/`：计算器、月供明细和历史记录页面。
- `src/components/` / `src/utils/`：共享组件和工具函数。

## 测试

类型检查、自动化测试、WX HMR 回归与平台验证范围见 [TESTING.md](TESTING.md)。

## 许可证

MIT
