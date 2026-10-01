# vite-plugin-taro

## 0.7.11

### 变更

- 04ef9b37、6294bab7：Vite、Rolldown 或 `vite-plugin-taro-runtime` 版本不匹配时改为输出兼容性警告，不再抛错阻止构建或开发服务器启动；运行时版本按 VPT 自身的发布版本检查。

### 修复

- a1ddbbd8：Rolldown 升级为 `1.2.12`，避免 macOS 文件监听器在监听路径未变化时被无谓重启并漏掉保存事件，改善小程序开发与监听构建的更新可靠性。

### 升级说明

从 `0.7.10` 升级到 `0.7.11`：运行 `pnpm add -D --save-exact vite-plugin-taro@0.7.11 vite@8.3.1 rolldown@1.2.12`。

**固定了 Rolldown 版本覆盖的项目**：pnpm 项目将 `pnpm-workspace.yaml` 中的 `overrides.rolldown` 更新为 `1.2.12`；npm / Bun 项目将 `package.json` 中的 `overrides.rolldown` 更新为 `1.2.12`；Yarn 项目将 `resolutions.rolldown` 更新为 `1.2.12`，使 Vite 与 VPT 使用同一版本。已使用 `$rolldown` 引用直接依赖的覆盖项无需改动。

## 0.7.10

### 变更

- 1d3a0f4c: Vite 依赖要求更新为 `8.3.1`，Rolldown 更新为 `1.2.11`；升级时需同步项目的构建依赖版本。
- 9790a683、d09e83fe: 微信、支付宝和抖音小程序的样式默认按 App 与页面拆分，不再将所有页面样式合并为全局样式；App 导入的样式全局生效，其余样式仅在引用它们的页面生效。开发与生产构建均遵循 Vite 的 `build.cssCodeSplit` 设置。
- 6d26fa6b: 小程序构建默认不再计算和显示 gzip 压缩体积。

### 修复

- 812de025: 修复部分页面热更新被误判为循环依赖，导致不必要的整包重编译和页面状态丢失的问题。
- 820e6a64、4012604c: 修复无实际变化的回调或持续快速编辑不断推迟小程序热更新的问题，更新不再等待编辑停止后才发布。
- dddbc265: 小程序热更新遇到原生 CSS 转换错误时保留受影响样式的最后有效版本，并继续更新有效 JavaScript 和其他样式，避免修复 CSS 后因更新中断而触发整包重编译；完整构建仍会报告并拒绝无效样式。
- f4c37fd4: 修复小程序开发服务快速重启后，开发者工具不再响应后续热更新的问题；新构建写入前不再提前删除现有产物，启动失败时保留旧文件（#33）。
- d059ca18: 修复微信小程序页面从临时语法错误中恢复后，热更新偶发触发整包重编译并丢失页面状态的问题（#34）。
- 9fc75d03: 修复小程序 `vite build --watch` 启动时清理开发者工具项目配置和本地偏好的问题。
- b7ffb919: 小程序开发构建的进度日志遵循 Vite 的 `logLevel`，在 `silent`、`warn` 或 `error` 级别下不再输出转换模块、渲染分块等进度信息。
- 4f8f8af0、da7d0e6b: 小程序热更新连接意外断开时提示恢复操作，完整重编译日志补充触发原因。

### 升级说明

从 `0.7.9` 升级到 `0.7.10`：运行 `pnpm add -D --save-exact vite-plugin-taro@0.7.10 vite@8.3.1 rolldown@1.2.11`。

**依赖跨页面全局样式的小程序需要调整**：页面及其依赖导入的样式不再自动影响其他页面。将需要全局共享的样式改为从 App 入口（如 `src/app.tsx`）导入；如需整体保留旧版行为，在 **Vite 顶层配置**中设置 `build: { cssCodeSplit: false }`，不要放入 `vpt()` 选项。H5 与原生组件自带样式不受此变更影响。

**统一构建依赖版本**：Vite 与插件需要使用同一版本的 Rolldown。pnpm 项目在 `pnpm-workspace.yaml` 的 `overrides` 中设置 `rolldown: 1.2.11`；npm / Bun 项目在 `package.json` 的 `overrides` 中设置 `"rolldown": "1.2.11"`；Yarn 项目在 `package.json` 的 `resolutions` 中设置 `"rolldown": "1.2.11"`。合并已有配置，若已固定 Vite 版本，也需将对应覆盖项同步更新为 `8.3.1`。

## 0.7.10-beta.1

### 变更

- 1d3a0f4c: Vite 依赖要求更新为 `8.3.1`，Rolldown 更新为 `1.2.11`；升级时需同步项目的构建依赖版本。

### 修复

- f4c37fd4: 修复小程序开发服务快速重启后，开发者工具不再响应后续热更新的问题；新构建写入前不再提前删除现有产物，启动失败时保留旧文件（#33）。
- b7ffb919: 小程序开发构建的进度日志遵循 Vite 的 `logLevel`，在 `silent`、`warn` 或 `error` 级别下不再输出转换模块、渲染分块等进度信息。

### 升级说明

从 `0.7.10-beta.0` 升级到 `0.7.10-beta.1`：运行 `pnpm add -D --save-exact vite-plugin-taro@0.7.10-beta.1 vite@8.3.1 rolldown@1.2.11`。

Vite 与插件需要使用同一版本的 Rolldown。pnpm 项目在 `pnpm-workspace.yaml` 的 `overrides` 中设置 `rolldown: 1.2.11`；npm / Bun 项目在 `package.json` 的 `overrides` 中设置 `"rolldown": "1.2.11"`；Yarn 项目在 `package.json` 的 `resolutions` 中设置 `"rolldown": "1.2.11"`。合并已有配置，若已固定 Vite 版本，也需将对应覆盖项同步更新为 `8.3.1`。

## 0.7.10-beta.0

### 变更

- 9790a683、d09e83fe: 微信、支付宝和抖音小程序的样式默认按 App 与页面拆分，不再将所有页面样式合并为全局样式；App 导入的样式全局生效，其余样式仅在引用它们的页面生效。开发与生产构建均遵循 Vite 的 `build.cssCodeSplit` 设置。
- 6d26fa6b: 小程序构建默认不再计算和显示 gzip 压缩体积。

### 修复

- 812de025: 修复部分页面热更新被误判为循环依赖，导致不必要的整包重编译和页面状态丢失的问题。
- 820e6a64、4012604c: 修复无实际变化的回调或持续快速编辑不断推迟小程序热更新的问题，更新不再等待编辑停止后才发布。
- dddbc265: 小程序热更新遇到原生 CSS 转换错误时保留受影响样式的最后有效版本，并继续更新有效 JavaScript 和其他样式，避免修复 CSS 后因更新中断而触发整包重编译；完整构建仍会报告并拒绝无效样式。
- 9fc75d03: 修复小程序 `vite build --watch` 启动时清理开发者工具项目配置和本地偏好的问题。
- 4f8f8af0、da7d0e6b: 小程序热更新连接意外断开时提示恢复操作，完整重编译日志补充触发原因。

### 升级说明

从 `0.7.9` 升级到 `0.7.10-beta.0`：运行 `pnpm add -D vite-plugin-taro@0.7.10-beta.0`。

**依赖跨页面全局样式的小程序需要调整**：页面及其依赖导入的样式不再自动影响其他页面。将需要全局共享的样式改为从 App 入口（如 `src/app.tsx`）导入；如需整体保留旧版行为，在 **Vite 顶层配置**中设置 `build: { cssCodeSplit: false }`，不要放入 `vpt()` 选项。H5 与原生组件自带样式不受此变更影响。

## 0.7.9

### 修复

- 82c3f01: 修复小程序开发模式下 `publicDir` 静态资源未复制到输出目录，导致图标等资源缺失的问题；开发启动和完整重建均会同步这些资源。
- fd58c56: 修复小程序页面在首次打开前完成热更新后，首次进入时仍渲染旧页面内容的问题。

### 升级说明

从 `0.7.8` 升级到 `0.7.9`：运行 `pnpm add -D vite-plugin-taro@0.7.9`。

## 0.7.8

### 修复

- 728c08e: 修复小程序开发模式下高阶组件名称被压缩后，React Fast Refresh 无法正确保留页面状态的问题。
- 46396c9: 修复微信开发者工具的项目配置在开发服务重启时被清理，导致后续热更新无法更新页面的问题。

### 升级说明

从 `0.7.7` 升级到 `0.7.8`：运行 `pnpm add -D vite-plugin-taro@0.7.8`。

## 0.7.7

### 修复

- 378387d: 修复抖音 iOS 环境中全局对象获取结果为 `undefined` 的问题。

### 升级说明

从 `0.7.6` 升级到 `0.7.7`：运行 `pnpm add -D vite-plugin-taro@0.7.7`。

## 0.7.6

### 修复

- 101e9b4: 小程序 `vite build --watch` 自动关闭微信、支付宝与抖音开发者工具的原生热重载，避免监听构建受到干扰；普通开发服务与单次构建不受影响。

### 升级说明

从 `0.7.5` 升级到 `0.7.6`：运行 `pnpm add -D vite-plugin-taro@0.7.6`。

## 0.7.5

### 变更

- 487e88e: 新增抖音小程序支持。
- f0b24f3: 小程序不再自动注入 Taro 的 `window`。

### 升级说明

从 `0.7.4` 升级到 `0.7.5`：运行 `pnpm add -D vite-plugin-taro@0.7.5`。

若小程序代码或依赖使用旧版自动注入的 Taro `window`，运行 `pnpm add vite-plugin-taro-runtime@0.7.5`，并在 Vite 顶层 `build.rolldownOptions.transform.inject` 中加入 `window: ['vite-plugin-taro-runtime/runtime/mini', 'window']`。H5 不受影响。

## 0.7.5-beta.1

### 修复

- 94a6ae8: 修复抖音小程序默认模板产生的重复属性编译警告。
- acbe3b0: 修复抖音小程序压缩构建后找不到分包模块的问题。

### 升级说明

从 `0.7.5-beta.0` 升级到 `0.7.5-beta.1`：运行 `pnpm add -D vite-plugin-taro@0.7.5-beta.1`。

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

- **使用 `URL` / `URLSearchParams` 的小程序（包括依赖中的用法）**：旧版的自动注入已移除。运行环境缺失这些 API 时，在 `vpt()` 选项中添加 `polyfills: ['web.url']`；仅需 `URLSearchParams` 时可选 `['web.url-search-params']`。无需另行安装 core-js。可通过裸 `URL` / `URLSearchParams` 或 `globalThis.URL` / `globalThis.URLSearchParams` 访问这些 API，无需额外配置。H5 不受此变更影响。
- **生产代码使用 `performance.now()` 的小程序**：确认运行环境提供该 API。若需保留旧版的替换行为，在 **Vite 顶层配置**添加 `define: { 'performance.now': 'Date.now' }`，并合并已有的 `define` 配置。

## 0.7.4-beta.0

### 更新内容

- 765a019: 新增小程序 `polyfills` 选项，可按需选择 core-js 模块补充 JavaScript / Web API，无需额外安装或手动导入。
- 8a78bd0: 小程序生产构建使用 Lightning CSS 压缩全局样式，减小样式产物体积。
- 6a7536e: 修复小程序原生代码块中的动态导入导致支付宝开发编译失败的问题。
- 79c51ac、65cecb6: 将 `performance.now` 兼容处理限定在开发服务中，并在非生产环境自动补充 `queueMicrotask`，避免影响生产环境原生 API。

### 升级说明

从 `0.7.3` 升级到 `0.7.4-beta.0`：运行 `pnpm add -D vite-plugin-taro@0.7.4-beta.0`，无需修改现有代码或配置。需要补充 URL API 时，在插件选项中添加 `polyfills: ['web.url']`，即可通过裸标识符或 `globalThis` 访问。本版本为 beta，建议先在测试项目验证。

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
