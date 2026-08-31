# VPT

[![npm version](https://img.shields.io/npm/v/vite-plugin-taro.svg)](https://www.npmjs.com/package/vite-plugin-taro)
[![npm downloads](https://badgen.net/npm/dm/vite-plugin-taro)](https://www.npmjs.com/package/vite-plugin-taro)
![Vite](https://img.shields.io/npm/dependency-version/vite-plugin-taro/peer/vite?label=Vite)
[![CI](https://github.com/sep2/vite-plugin-taro/actions/workflows/publish.yml/badge.svg?branch=main&event=push)](https://github.com/sep2/vite-plugin-taro/actions/workflows/publish.yml)
[![coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](https://github.com/sep2/vite-plugin-taro/actions/workflows/publish.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

简体中文 | [English](README.en.md)

使用 Vite 8、React 19、Taro 4 和 Tailwind CSS v4 构建微信小程序与 Web 应用。

官网：<https://vpt.js.org>

> **推荐使用 AI 开发：** 阅读 [VPT AI 开发指南](https://vpt.js.org/guides/ai/)，让编程助手创建项目并完成开发、测试和验证。

## 快速开始

```sh
npm create vite-taro@latest my-app
```

接下来阅读[快速开始](https://vpt.js.org/guides/quick-start/)。


### 已支持微信开发者工具的 React 热更新

<video src="https://github.com/user-attachments/assets/c8289e1e-d8ad-429f-a0d9-a40656b4962a" controls autoplay muted loop playsinline width="100%"></video>

- **Vite 8 + React 19** 基于 Vite 生态，一份代码覆盖微信小程序与 Web。
- **热更新** 编辑代码时保留 App 数据、当前页面、React 组件状态与输入状态。
- **全自动分包** 使用标准静态与动态导入，由 vpt 自动规划微信小程序分包。
- **Tailwind CSS v4 开箱即用** 直接书写工具类，微信与 Web 样式自动适配。
- **基于 Taro，超越 Taro** 使用 Taro 组件和 API，摆脱旧式 webpack 链路。
- **Skyline 就绪** 支持全局或按页面启用微信 Skyline 渲染模式。

## 文档

- [快速开始](https://vpt.js.org/guides/quick-start/)
- [AI 开发指南](https://vpt.js.org/guides/ai/)
- [样式](https://vpt.js.org/guides/styles/)
- [全自动分包](https://vpt.js.org/guides/automatic-subpackages/)
- [微信原生组件](https://vpt.js.org/guides/native-components/)
- [开发热更新](https://vpt.js.org/guides/hot-module-replacement/)
- [配置选项](https://vpt.js.org/guides/configuration/)
- [条件编译](https://vpt.js.org/guides/conditional-directives/)
- [Skyline 模式](https://vpt.js.org/guides/skyline-mode/)
- [从 Taro 迁移](https://vpt.js.org/guides/migrate-from-taro/)
- [模块系统](https://vpt.js.org/references/module-system/)
- [热更新原理](https://vpt.js.org/references/hmr-implementation/)
- [仓库维护](https://vpt.js.org/references/repository-management/)

## 许可证

MIT
