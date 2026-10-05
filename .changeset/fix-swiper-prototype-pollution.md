---
'vite-plugin-taro-runtime': patch
---

将 H5 运行时的 Swiper 依赖升级至 12.1.2，修复原型污染漏洞 CVE-2026-27212（GHSA-hmx5-qpq5-p643）。Taro 的 Swiper 组件继续使用相同的属性和事件接口，应用无需修改代码。
