---
'vite-plugin-taro': patch
---

移除共享的 `miniPageComponentConstructor`：微信保留专属 `wxPageConstructor`，继续以 `Component({ data, options, methods })` 注册页面；抖音与支付宝直接使用原生 `Page` 注册。

页面构造器仍打包在 `common/bootstrap.js` 中，不额外生成构造器文件。本次调整不包含初始数据渲染或热更新策略变更。
