# create-vite-taro

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
