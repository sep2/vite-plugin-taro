---
'vite-plugin-taro': patch
---

9a8fe85: 修复微信小程序 `vite build --watch` 重建输出目录后，开发者工具仍使用旧文件缓存的问题（#23）。支付宝、单次构建及开发服务器 HMR 行为不变。

### 升级说明

从 `0.7.2` 升级到 `0.7.3-beta.0`：安装 `vite-plugin-taro@0.7.3-beta.0` 后重启监听命令。微信监听构建仍需设置 `projectConfigJson.setting.compileHotReLoad: false`；不要在开发者工具打开项目时手动删除输出目录。正式发布前请运行不带 `--watch` 的完整构建。
