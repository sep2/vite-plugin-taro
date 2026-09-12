---
'vite-plugin-taro': patch
---

调整微信小程序 `vite build --watch` 的输出方式，避免删除、重建目录导致开发者工具继续使用旧的子文件缓存。

`vpt:wx-watch` 保留所有输出目录，每轮只清理文件，保持正常内容哈希文件名。输出完成后写入仅含随机 UUID 注释、未被应用引用的 `hmr/watch.js`，不改写 App 文件。该标记不是多文件原子更新保证；构建失败时不会保留上一轮完整产物。支付宝、单次生产构建及开发服务器 HMR 行为不变。

升级项目中的 `vite-plugin-taro` 后重启监听命令。微信监听构建仍需设置 `projectConfigJson.setting.compileHotReLoad: false`；不要在开发者工具打开项目时手动删除输出目录。正式发布前请运行不带 `--watch` 的完整构建。
