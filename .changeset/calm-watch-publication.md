---
'vite-plugin-taro': patch
---

修复小程序 `vite build --watch` 连续修改源码时可能出现的过期入口、模块未定义及懒加载组件缺失问题。

监听构建保留输出目录并使用稳定文件名；依赖、分包及原生配套文件写入完成后，再原子发布带有新构建标识的 `app.js`。普通生产构建的清理及内容哈希行为不变，开发服务器的 HMR 协议也不变。

升级项目中的 `vite-plugin-taro` 后重启监听命令。微信监听构建仍需设置 `projectConfigJson.setting.compileHotReLoad: false`；不要在开发者工具打开项目时手动删除输出目录。正式发布前请运行不带 `--watch` 的完整构建。
