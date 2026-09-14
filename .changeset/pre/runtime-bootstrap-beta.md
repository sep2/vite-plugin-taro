---
"vite-plugin-taro-runtime": patch
---

- f4bc02c: 修复 App 根节点初始化过早缓存组件别名，导致平台组件定义未完整生效的问题。

### 升级说明

从 `0.7.3` 升级到 `0.7.4-beta.0` 无需修改代码或配置；通常随 `vite-plugin-taro@0.7.4-beta.0` 自动升级。若项目直接依赖本包，请同步更新至 `vite-plugin-taro-runtime@0.7.4-beta.0`。本版本为 beta，建议先在测试项目验证。
