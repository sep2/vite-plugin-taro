---
"vite-plugin-taro": patch
---

a817d8e: 为小程序中的 HTML 标签补充共享显示默认值：`span`、`a` 使用行内布局，`button`、`input`、`textarea`、`progress` 使用行内块布局，`template`、`datalist` 默认隐藏。应用样式仍可覆盖这些默认值，不改变应用的层叠层顺序。

### 升级说明

将 `vite-plugin-taro` 升级到 `0.7.3-beta.2` 并重新启动开发服务器。无需安装额外的 HTML 插件；已有的 `span` 行内显示补丁可移除，字体、颜色和边框等样式仍由应用自行配置。
