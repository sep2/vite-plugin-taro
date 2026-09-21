---
'vite-plugin-taro': patch
---

将小程序独立的 `common/vpt/global.js` 改为非严格模式输出，保留原有全局对象探测顺序，修复抖音 iOS 环境中全局对象恢复结果为 `undefined` 的问题。应用代码的严格模式不变，无需调整配置。
