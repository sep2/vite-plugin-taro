# vite-plugin-taro-runtime

## 0.7.5-beta.1

### 变更

本包无面向用户的变更。

### 升级说明

从 `0.7.5-beta.0` 升级到 `0.7.5-beta.1`：运行时随 `vite-plugin-taro@0.7.5-beta.1` 自动升级，无需单独操作。

## 0.7.5-beta.0

### 变更

- 24eb74a: 新增抖音小程序支持。

### 升级说明

从 `0.7.4` 升级到 `0.7.5-beta.0`：通常随插件自动升级；直接依赖本包的项目运行 `pnpm add vite-plugin-taro-runtime@0.7.5-beta.0`。

## 0.7.4

### 更新内容

本包无面向用户的变更。

### 升级说明

从 `0.7.3` 升级到 `0.7.4` 时，运行时随 `vite-plugin-taro@0.7.4` 自动安装，无需单独操作。若项目直接依赖本包，运行 `pnpm add vite-plugin-taro-runtime@0.7.4`。插件配置的迁移请参阅 `vite-plugin-taro` 的升级说明。

## 0.7.4-beta.0

### 更新内容

- f4bc02c: 修复 App 根节点初始化过早缓存组件别名，导致平台组件定义未完整生效的问题。

### 升级说明

从 `0.7.3` 升级到 `0.7.4-beta.0` 无需修改代码或配置；通常随 `vite-plugin-taro@0.7.4-beta.0` 自动升级。若项目直接依赖本包，请同步更新至 `vite-plugin-taro-runtime@0.7.4-beta.0`。本版本为 beta，建议先在测试项目验证。

## 0.7.3

### 更新内容

- 405d933: 提供微信和支付宝小程序 HTML 标签所需的运行时支持。

### 升级说明

运行时随 `vite-plugin-taro@0.7.3` 自动安装，无需单独升级。从 `0.7.2` 或 `0.7.3-beta.2` 升级到 `0.7.3` 无需修改运行时代码或配置；插件的升级注意事项请参阅 `vite-plugin-taro` 的升级说明。

## 0.7.3-beta.2

### 更新内容

本包无面向用户的变更。

### 升级说明

无需额外操作。从 `0.7.3-beta.1` 升级到 `0.7.3-beta.2` 无需修改代码或配置。

## 0.7.3-beta.1

### 更新内容

- 405d933: 提供微信和支付宝小程序 HTML 标签所需的运行时支持。

### 升级说明

无需额外操作。从 `0.7.3-beta.0` 升级到 `0.7.3-beta.1` 无需修改代码或配置。

## 0.7.3-beta.0

### 更新内容

本包无面向用户的变更。

### 升级说明

运行时随 `vite-plugin-taro@0.7.3-beta.0` 自动安装，无需单独升级。从 `0.7.2` 升级到 `0.7.3-beta.0` 无需修改运行时代码或配置；插件的微信监听构建注意事项请参阅 `vite-plugin-taro` 的升级说明。

## 0.7.2

### 更新内容

- 与 `vite-plugin-taro`、`create-vite-taro` 固定版本组同步升级至 `0.7.2`。
- 本包运行时实现无改动；小程序 HMR 启动恢复修复位于 `vite-plugin-taro`。

## 0.7.1

### Patch Changes

- Introduce the unified `vite-plugin-taro-runtime` package, consolidating the patched Taro runtime, React renderer, framework integration, and WX, Alipay, and H5 entries.
- Provide canonical runtime and type exports for plugin consumers.
- Remove the unused DingTalk SDK dependency.

## 0.7.1-beta.2

No changes in this release.

Releases through 0.7.1-beta.1 are recorded in the [historical changelog](../../CHANGELOG.md).
