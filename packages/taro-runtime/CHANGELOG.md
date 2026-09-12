# vite-plugin-taro-runtime

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
