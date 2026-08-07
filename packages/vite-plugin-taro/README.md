# vite-plugin-taro

[![npm version](https://img.shields.io/npm/v/vite-plugin-taro.svg)](https://www.npmjs.com/package/vite-plugin-taro)
![Vite compatibility](https://registry.vite.dev/api/badges?package=vite-plugin-taro&tool=vite)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简体中文 | [English](README.en.md)

使用 Vite 8、React 19、Taro 4 和 Tailwind CSS v4 构建微信小程序与 Web 应用。

文档网站：<https://vite-plugin-taro.netlify.app>

### 已支持微信开发者工具的 React 热更新

<video src="https://github.com/user-attachments/assets/cd4e6d97-6bc7-40e0-9ba9-206c9fe369f1" controls autoplay muted loop playsinline width="100%"></video>

- **Vite 8 + React 19** 基于 Vite 生态，一份代码覆盖微信小程序与 Web。
- **热更新** 编辑代码时保留 App 数据、当前页面、React 组件状态与输入状态。
- **全自动分包** 使用标准静态与动态导入，由 vpt 自动规划微信小程序分包。
- **Tailwind CSS v4 开箱即用** 直接书写工具类，微信与 Web 样式自动适配。
- **基于 Taro，超越 Taro** 使用 Taro 组件和 API，摆脱旧式 webpack 链路。
- **Skyline 就绪** 支持全局或按页面启用微信 Skyline 渲染模式。

## 创建应用

```sh
npm create vite-taro@latest my-app
```

接下来阅读[快速开始](https://vite-plugin-taro.netlify.app/guides/quick-start/)。

## 文档

- [全自动分包](https://vite-plugin-taro.netlify.app/guides/automatic-subpackages/)
- [微信原生组件](https://vite-plugin-taro.netlify.app/guides/native-components/)
- [开发者工具热更新](https://vite-plugin-taro.netlify.app/guides/hot-module-replacement/)
- [Skyline 模式](https://vite-plugin-taro.netlify.app/guides/skyline-mode/)
- [从 Taro CLI 迁移](https://vite-plugin-taro.netlify.app/guides/migrate-from-taro/)
- [配置参考](https://vite-plugin-taro.netlify.app/references/configuration/)
- [仓库维护](https://vite-plugin-taro.netlify.app/references/repository-management/)

## 许可证

MIT
