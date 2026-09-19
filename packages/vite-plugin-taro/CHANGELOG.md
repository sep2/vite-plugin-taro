# vite-plugin-taro

## 0.7.5-beta.0

### 变更

- 487e88e: 新增抖音小程序支持。

### 升级说明

从 `0.7.4` 升级到 `0.7.5-beta.0`：运行 `pnpm add -D vite-plugin-taro@0.7.5-beta.0`，然后重启开发服务器。

## 0.7.4

### 更新内容

- 765a019: 新增 `polyfills` 选项，按需补充小程序缺失的 JavaScript / Web API；`URL` 和 `URLSearchParams` 不再由插件自动注入。
- 8a78bd0: 默认压缩小程序生产构建的全局样式，减小样式产物体积。
- 6a7536e: 修复支付宝小程序开发编译因动态导入而报错的问题。
- 79c51ac: 小程序生产构建不再将 `performance.now()` 替换为 `Date.now()`。

### 升级说明

从 `0.7.3` 升级到 `0.7.4`：运行 `pnpm add -D vite-plugin-taro@0.7.4`，然后重启开发服务。

- **使用 `URL` / `URLSearchParams` 的小程序（包括依赖中的用法）**：旧版的自动注入已移除。运行环境缺失这些 API 时，在 `vpt()` 选项中添加 `polyfills: ['web.url']`；仅需 `URLSearchParams` 时可选 `['web.url-search-params']`。无需另行安装 core-js。可通过 `globalThis.URL` / `globalThis.URLSearchParams` 访问这些 API；微信代码若继续使用裸 `URL`，还需在 **Vite 顶层配置**添加 `define: { URL: 'globalThis.URL' }`。H5 不受此变更影响。
- **生产代码使用 `performance.now()` 的小程序**：确认运行环境提供该 API。若需保留旧版的替换行为，在 **Vite 顶层配置**添加 `define: { 'performance.now': 'Date.now' }`，并合并已有的 `define` 配置。

## 0.7.4-beta.0

### 更新内容

- 765a019: 新增小程序 `polyfills` 选项，可按需选择 core-js 模块补充 JavaScript / Web API，无需额外安装或手动导入。
- 8a78bd0: 小程序生产构建使用 Lightning CSS 压缩全局样式，减小样式产物体积。
- 6a7536e: 修复小程序原生代码块中的动态导入导致支付宝开发编译失败的问题。
- 79c51ac、65cecb6: 将 `performance.now` 兼容处理限定在开发服务中，并在非生产环境自动补充 `queueMicrotask`，避免影响生产环境原生 API。

### 升级说明

从 `0.7.3` 升级到 `0.7.4-beta.0`：运行 `pnpm add -D vite-plugin-taro@0.7.4-beta.0`，无需修改现有代码或配置。需要补充 URL API 时，在插件选项中添加 `polyfills: ['web.url']`；微信代码直接使用 `URL` 名称时，还需在 Vite 顶层配置添加 `define: { URL: 'globalThis.URL' }`。本版本为 beta，建议先在测试项目验证。

## 0.7.3

### 更新内容

- 9a8fe85: 修复微信小程序 `vite build --watch` 重建输出目录后，开发者工具仍使用旧文件缓存的问题（#23）。
- 405d933: 微信和支付宝小程序支持 HTML 标签及 Taro DOM/BOM API，可直接使用 `document`、`window` 等名称。
- a817d8e: 补充 HTML 标签的默认显示样式，`span`、`a` 使用行内布局，表单元素使用相应行内块布局，`template`、`datalist` 默认隐藏；应用样式仍可覆盖。
- d499ab2: 小程序 JavaScript 输出使用固定文件名，共享代码放入 `common/`。

### 升级说明

从 `0.7.2` 或 `0.7.3-beta.2` 升级时，将 `vite-plugin-taro` 更新到 `0.7.3`，重启开发或监听命令，并在发布前执行一次完整构建。从 `0.7.3-beta.2` 升级无需修改代码或配置。

从 `0.7.2` 升级时，如有脚本直接引用旧的 `assets/*-<hash>.js`，请按新的输出目录结构调整；原生页面路由无需修改。微信监听构建仍需设置 `projectConfigJson.setting.compileHotReLoad: false`，不要在开发者工具打开项目时手动删除输出目录。

无需额外安装 HTML 插件；已有的 `span` 行内显示补丁可移除，字体、颜色和边框等样式仍由应用自行配置。

## 0.7.3-beta.2

### 更新内容

- a817d8e: 为小程序中的 HTML 标签补充共享显示默认值：`span`、`a` 使用行内布局，`button`、`input`、`textarea`、`progress` 使用行内块布局，`template`、`datalist` 默认隐藏。应用样式仍可覆盖这些默认值，不改变应用的层叠层顺序。

### 升级说明

从 `0.7.3-beta.1` 升级时，将 `vite-plugin-taro` 更新到 `0.7.3-beta.2` 并重新启动开发服务器。无需安装额外的 HTML 插件；已有的 `span` 行内显示补丁可移除，字体、颜色和边框等样式仍由应用自行配置。

## 0.7.3-beta.1

### 更新内容

- 405d933: 微信和支付宝小程序支持 HTML 标签及 Taro DOM/BOM API，可直接使用 `document`、`window` 等名称。
- d499ab2: 小程序 JavaScript 输出使用固定文件名，共享代码放入 `common/`；监听构建不再逐轮清空输出目录。

### 升级说明

从 `0.7.3-beta.0` 升级到 `0.7.3-beta.1` 后，请重启开发或监听命令，并在发布前执行一次完整构建。如有脚本直接引用旧的 `assets/*-<hash>.js`，请按新的输出目录结构调整。原生页面路由无需修改。

## 0.7.3-beta.0

### 修复与改进

- a281f91、9a8fe85: 修复微信小程序 `vite build --watch` 重建输出目录后，开发者工具仍使用旧文件缓存的问题（#23）。支付宝、单次构建及开发服务器 HMR 行为不变；监听构建失败时不会保留上一轮完整产物。

### 升级说明

从 `0.7.2` 升级到 `0.7.3-beta.0`：安装 `vite-plugin-taro@0.7.3-beta.0` 后重启监听命令。微信监听构建仍需设置 `projectConfigJson.setting.compileHotReLoad: false`；不要在开发者工具打开项目时手动删除输出目录。正式发布前请运行不带 `--watch` 的完整构建。

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
