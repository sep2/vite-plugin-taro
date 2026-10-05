# create-vite-taro

## 0.7.12-beta.0

### 变更

- 2c7a0dd3：新项目的 Skyline 配置默认设置 `disableABTest: true`，让符合条件的真机无需配置 We 分析 AB 实验即可使用 Skyline。
- e3d52ef2：新项目的微信页面显式设置 `config.glassEaselWebview: true`，并保留 App 顶层开关，避免开发者工具 WebView 模拟器忽略全局设置而未启用 glass-easel；其他目标配置不变。

### 升级说明

从 `0.7.11` 升级到 `0.7.12-beta.0`：新项目使用 `pnpm create vite-taro@0.7.12-beta.0 my-app`。

## 0.7.11

### 变更

- a1ddbbd8：新项目默认使用 Rolldown `1.2.12`，包含 macOS 文件监听保存事件丢失的修复；Vite 版本仍为 `8.3.1`。

### 升级说明

从 `0.7.10` 升级到 `0.7.11`：新项目使用 `pnpm create vite-taro@0.7.11 my-app`。

## 0.7.10

### 变更

- 1d3a0f4c: 新项目默认使用 Vite `8.3.1` 和 Rolldown `1.2.11`，并添加 Rolldown 版本覆盖，统一构建器与热更新运行时使用的版本。
- 3f8e2da2: 新项目的开发、构建和预览脚本不再强制设置 `NODE_ENV`，由 Vite 选择默认值，并保留外部传入的设置。

### 升级说明

从 `0.7.9` 升级到 `0.7.10`：新项目使用 `pnpm create vite-taro@0.7.10 my-app`。

## 0.7.10-beta.1

### 变更

- 1d3a0f4c: 新项目默认使用 Vite `8.3.1` 和 Rolldown `1.2.11`，并添加 Rolldown 版本覆盖，统一构建器与热更新运行时使用的版本。

### 升级说明

从 `0.7.10-beta.0` 升级到 `0.7.10-beta.1`：新项目使用 `pnpm create vite-taro@0.7.10-beta.1 my-app`。

## 0.7.10-beta.0

### 变更

- 3f8e2da2: 新项目的开发、构建和预览脚本不再强制设置 `NODE_ENV`，由 Vite 选择默认值，并保留外部传入的设置。

### 升级说明

从 `0.7.9` 升级到 `0.7.10-beta.0`：新项目使用 `pnpm create vite-taro@0.7.10-beta.0 my-app`。

## 0.7.9

### 变更

本包无面向用户的变更。

### 升级说明

从 `0.7.8` 升级到 `0.7.9`：新项目使用 `pnpm create vite-taro@0.7.9 my-app`。

## 0.7.8

### 变更

本包无面向用户的变更。

### 升级说明

从 `0.7.7` 升级到 `0.7.8`：新项目使用 `pnpm create vite-taro@0.7.8 my-app`。

## 0.7.7

### 变更

本包无面向用户的变更。

### 升级说明

从 `0.7.6` 升级到 `0.7.7`：新项目使用 `pnpm create vite-taro@0.7.7 my-app`。

## 0.7.6

### 修复

- e61bbe2: 修复默认模板按钮的原生边框与圆角不一致的问题，移除按钮边框和 `::after` 伪元素，保留原有圆角。

### 升级说明

从 `0.7.5` 升级到 `0.7.6`：新项目使用 `pnpm create vite-taro@0.7.6 my-app`。

## 0.7.5

### 变更

- 54b2ad3: 新增抖音小程序支持。

### 升级说明

从 `0.7.4` 升级到 `0.7.5`：新项目使用 `pnpm create vite-taro@0.7.5 my-app`。

## 0.7.5-beta.1

### 变更

本包无面向用户的变更。

### 升级说明

从 `0.7.5-beta.0` 升级到 `0.7.5-beta.1`：新项目使用 `pnpm create vite-taro@0.7.5-beta.1 my-app`。

## 0.7.5-beta.0

### 变更

- 54b2ad3: 新增抖音小程序支持。

### 升级说明

从 `0.7.4` 升级到 `0.7.5-beta.0`：新项目使用 `pnpm create vite-taro@0.7.5-beta.0 my-app`。已有项目无需重新生成，运行 `pnpm add -D vite-plugin-taro@0.7.5-beta.0` 更新插件。

## 0.7.4

### 更新内容

- 509b0da: 新建 pnpm 项目不再为 `core-js` 的捐赠提示脚本要求运行 `pnpm approve-builds`，其他依赖的构建脚本审批不变。

### 升级说明

从 `0.7.3` 升级到 `0.7.4`：新建项目请使用 pnpm 10.26+ 运行 `pnpm create vite-taro@0.7.4 my-app`。已有项目无需重新生成；更新插件时请参阅 `vite-plugin-taro` 的升级说明。

## 0.7.4-beta.0

### 更新内容

本包无面向用户的变更。

### 升级说明

从 `0.7.3` 升级到 `0.7.4-beta.0` 无需修改代码或配置。新建 beta 测试项目请运行 `pnpm create vite-taro@0.7.4-beta.0`；已有项目无需重新生成，更新 `vite-plugin-taro` 即可。

## 0.7.3

### 更新内容

- f9be2ab: 默认模板的 Footer、ApiCard 和 BotanicalSprig 改用 HTML 标签，保留原有布局与 Taro API 调用。

### 升级说明

使用 `pnpm create vite-taro@0.7.3 my-app` 创建新项目。已有项目从 `0.7.2` 或 `0.7.3-beta.2` 升级到 `0.7.3` 无需重新生成；升级插件时请参阅 `vite-plugin-taro` 的升级说明。

## 0.7.3-beta.2

### 更新内容

- f9be2ab: 默认模板的 Footer、ApiCard 和 BotanicalSprig 改用 HTML 标签，保留原有布局与 Taro API 调用，并更新快速开始示例。

### 升级说明

使用 `pnpm create vite-taro@0.7.3-beta.2 my-app` 创建新项目。已有项目无需重新生成，也无需修改代码或配置；模板调整仅影响新创建的项目。

## 0.7.3-beta.1

### 更新内容

本包无面向用户的变更。

### 升级说明

使用 `pnpm create vite-taro@0.7.3-beta.1` 创建项目。已有项目从 `0.7.3-beta.0` 升级插件至 `0.7.3-beta.1`，请参阅 `vite-plugin-taro` 的升级说明，无需重新生成项目。

## 0.7.3-beta.0

### 更新内容

本包无面向用户的变更。

### 升级说明

使用 `pnpm create vite-taro@0.7.3-beta.0` 创建项目。已有项目从 `0.7.2` 升级插件至 `0.7.3-beta.0`，请参阅 `vite-plugin-taro` 的升级说明，无需重新生成项目。

## 0.7.2

### 更新内容

- 与固定版本组同步升级至 `0.7.2`，新建项目使用 `vite-plugin-taro@0.7.2`，包含本次小程序 HMR 启动恢复修复。
- 脚手架实现无其他改动。

## 0.7.1

### Patch Changes

- 80819b8: Derive the scaffolded vite-plugin-taro dependency from the generator's own release version, including beta releases, instead of maintaining a separate version in the template.

## 0.7.1-beta.2

### Patch Changes

- 80819b8: Derive the scaffolded vite-plugin-taro dependency from the generator's own release version, including beta releases, instead of maintaining a separate version in the template.

Releases through 0.7.1-beta.1 are recorded in the [historical changelog](../../CHANGELOG.md).
