---
'vite-plugin-taro': minor
---

### 新增与改进

- 9fa90a01、15db5f26：微信、抖音新增原生 DOM 渲染链路，支持原生组件、事件与属性同步，并在 SDK 能力不可用时回退到模板渲染。
- 00abba00、054048ae：微信、抖音 DOM 模式支持 HTML 元素映射，保留语义样式、换行及点击事件。
- 4d15cdda、60465290、c863709e：统一页面挂载与原生生命周期衔接，支持 DOM 首屏预渲染和布局透明的微信 Page 根节点，复用首屏挂载状态并支持页面退出转场。
- ea96811a：抖音使用对象形式的页面初始数据，兼容共享页面配置中的预渲染声明。
- 0b39dbfa、b301d0d8：修复微信 ShareElement 转场 key 映射，并按显式配置转发 ScrollView padding。
- 63c09667、b5d472a5：支付宝自定义 tabBar 自动生成隐藏的原生占位组件；小程序 SystemJS 产物保留函数名称。

### 升级说明

从 `0.7.13` 升级到 `0.8.0-beta.0`：

```sh
pnpm add -D --save-exact vite-plugin-taro@0.8.0-beta.0
```

默认渲染模式仍为 `template`。微信、抖音项目如需启用原生 DOM 渲染，在 `vpt({ ... })` 中设置 `renderer: 'dom'`；保留 `renderer: 'template'` 或省略该选项即可继续使用递归模板与 setData。支付宝继续使用模板渲染，H5 使用浏览器渲染。运行时随插件自动升级到同版 beta；现有应用的组件与页面配置接口保持兼容。
