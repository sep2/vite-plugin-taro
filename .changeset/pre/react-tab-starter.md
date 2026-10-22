---
'create-vite-taro': minor
---

### 新增与改进

- 46215180、7ba1fbe5、996bd652：默认模板提供首页、探索、关于三个 Tab 页面；各页面通过 React 渲染标签栏，并集中维护导航配置与跨端原生 tabBar 声明。
- b301d0d8：模板页面启用 ScrollView flex 布局，完善页面级导航与内容布局。
- ea96811a、9e85eb14：在微信 App 的 window 配置中声明 glassEaselWebview，并验证模板的跨端窗口配置。

### 升级说明

从 `0.7.13` 升级到 `0.8.0-beta.0`，使用新模板创建项目：

```sh
npm create vite-taro@0.8.0-beta.0 my-app
```

新项目自动依赖同版 beta 插件。现有项目不会被生成器覆盖；如需采用新标签栏示例，合并模板中的 `src/tab-pages.ts`、`src/components/tab-bar/` 及对应的页面和 `appJson.tabBar` 配置。现有项目仅升级插件时，无需迁移到新模板。
