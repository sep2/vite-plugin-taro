---
'vite-plugin-taro-runtime': patch
---

### 修复

- 90572cab：将 H5 运行时的 Swiper 升级至 `12.1.2`，修复原型污染漏洞 CVE-2026-27212（GHSA-hmx5-qpq5-p643）。

### 升级说明

从 `0.7.12-beta.0` 升级到 `0.7.12-beta.1`：运行时随 `vite-plugin-taro@0.7.12-beta.1` 自动升级，无需单独安装。
