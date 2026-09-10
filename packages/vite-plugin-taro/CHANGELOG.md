# vite-plugin-taro

## 0.7.2

### 修复与改进

- 修复微信开发者工具点击「编译」后，小程序 HMR 出现补丁序号缺失和 `SocketTask.readyState is not OPEN` 的问题（#22）。

  - 新 App 在 Socket 打开后报告启动；若当前构建已发布过补丁，自动完整重建代码基线。
  - Socket 打开前跳过补丁执行，避免重放不完整的历史；仅在连接打开时发送报告。
  - 补丁应用失败时先请求完整重建，再关闭连接并停止后续补丁安装。
  - 补充启动恢复、Socket 生命周期及 Rolldown 增量补丁交付的回归测试。
- 同步依赖 `vite-plugin-taro-runtime@0.7.2`。

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
