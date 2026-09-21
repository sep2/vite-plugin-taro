---
'vite-plugin-taro': patch
---

修复小程序构建将 Rolldown 运行时合并进 `common/polyfills.js` 的问题。移除重复的 polyfill 构建入口，保留 bootstrap 加载的 polyfill 文件，并使 Rolldown 运行时（开发模式下包含 HMR）独立输出。无需修改现有配置。
