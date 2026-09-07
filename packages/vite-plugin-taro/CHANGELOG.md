# vite-plugin-taro

## 0.7.1

### 更新内容

- 将 Taro 运行时、React 渲染器及平台适配统一整合至 `vite-plugin-taro-runtime`。
- 使用静态 API 门面和显式 Hook 导出替代基于 Babel 的 API 转换。
- 修复 HMR 中 React Refresh 前置检查代码的处理。
- 新增 Vite 和 Rolldown 版本校验。
- 简化微信、支付宝模板，并为仓库示例补充支付宝支持。
- 移除未使用的钉钉 SDK 依赖。
- 脚手架生成的插件版本与脚手架自身发布版本保持一致。
- 扩展跨平台测试覆盖，并将发布流程迁移至 Changesets。

## 0.7.1-beta.2

### Patch Changes

- vite-plugin-taro-runtime@0.7.1-beta.2

Releases through 0.7.1-beta.1 are recorded in the [historical changelog](../../CHANGELOG.md).
