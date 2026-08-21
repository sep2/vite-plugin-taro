---
title: 样式
description: 在 VPT 项目中使用 Tailwind CSS v4、CSS Modules 和全局 CSS。
---

VPT 可同时使用 Tailwind CSS v4、CSS Modules 和普通 CSS。样式也支持热更新，修改后立刻在开发者工具中能看到效果，不会丢失页面状态。

| 写法 | 适合场景 | 作用范围 |
| --- | --- | --- |
| Tailwind CSS | 直接在 JSX 中组合样式 | 全局工具类 |
| CSS Modules | 组件内部的复杂样式、动画和伪元素 | 类名自动隔离 |
| 普通 CSS | 页面基础样式、重置样式和共享规则 | 全局 |

## Tailwind CSS v4

`create-vite-taro` 默认启用 Tailwind CSS v4。该功能由 [weapp-tailwindcss](https://tw.icebreaker.top) 支持，感谢作者开源。

默认的 `src/app.css` 包含：

```css
@import "tailwindcss/theme.css";
@import "tailwindcss/preflight.css";
@import "tailwindcss/utilities.css";

@source "./";
```

- 三个 `@import` 分别引入主题、基础规则和工具类。
- `@source "./"` 扫描 `src` 中使用的 Tailwind 类名。
- vpt 为微信和 Web 分别生成可用的目标样式。

在 JSX 中直接使用 `className`：

```tsx
import { Text, View } from 'virtual:taro/components'

export function AccountSummary() {
    return (
        <View className="rounded-[24px] bg-emerald-950 p-5 shadow-xl">
            <Text className="text-sm font-medium text-emerald-100">本月余额</Text>
            <Text className="mt-2 block text-3xl font-bold text-white">¥ 8,260</Text>
        </View>
    )
}
```

任意值、颜色透明度和常见状态变体会经过同一套目标转换。

### 保持类名完整

Tailwind 根据源码中出现的完整类名生成样式。不要用字符串片段拼出类名：

```tsx
// 不要这样写：源码中不存在完整的 bg-*-500 类名。
const className = `bg-${tone}-500`
```

将所有可能的类名写成完整字符串：

```tsx
const toneClass = active ? 'bg-emerald-600' : 'bg-slate-300'

return <View className={`rounded-xl p-4 ${toneClass}`} />
```

从 `@source "./"` 以外的位置读取类名时，使用 Tailwind v4 的 `@source` 指令显式添加扫描目录。

### 自定义主题

推荐通过 `@theme` 设定项目的设计令牌（tokens）：

```css
@theme {
    --color-brand-500: #2a9d5b;
    --color-brand-950: #123a25;
    --font-display: Georgia, serif;
}
```

之后可以使用 `bg-brand-500`、`text-brand-950` 和 `font-display`。随着项目扩大，相同工具类会在不同组件中复用，样式体积主要随实际使用的规则增长；统一的颜色、间距、字号和圆角令牌也能减少任意值与重复 CSS。

## CSS Modules

若遇到复杂样式，推荐使用 CSS Modules。CSS Modules 会生成唯一的 class name，杜绝样式冲突和覆盖。

文件名使用 Vite 的 `*.module.css` 约定：

```css
/* profile-card.module.css */
.card {
    padding: 24px;
    border: 1px solid rgba(23, 103, 61, 0.16);
    border-radius: 20px;
    background: white;
}

.title {
    color: #17673d;
    font-size: 28px;
    font-weight: 700;
}
```

微信构建会把普通 CSS 中的 `px` 和 `rem` 转换为 `rpx`。

在组件中导入生成的类名映射：

```tsx
import { Text, View } from 'virtual:taro/components'
import styles from './profile-card.module.css'

export function ProfileCard() {
    return (
        <View className={styles.card}>
            <Text className={styles.title}>个人资料</Text>
        </View>
    )
}
```

### 与 Tailwind 一起使用

Tailwind 工具类可以与 CSS Modules 生成的类名组合：

```tsx
<View className={`${styles.card} flex items-center gap-3 p-4`}>
    <Text className={styles.title}>个人资料</Text>
</View>
```

Sass、Less 和 Stylus 也支持 Modules 文件约定，例如 `profile-card.module.scss`。

## 普通 CSS

普通 CSS 不会隔离选择器，适合放置全局重置、字体和根元素规则。建议将这些规则集中在 `app.css` 中。

```css
*,
*::before,
*::after {
    box-sizing: border-box;
}

page,
body {
    margin: 0;
    background: #f8faf7;
    color: #173e29;
}
```

`page` 是微信小程序的页面根元素，`body` 是 Web 的文档根元素。

目标专用规则可以使用条件指令：

```css
/* #ifdef wx */
.wx-only-surface {
    padding-bottom: env(safe-area-inset-bottom);
}
/* #endif */

/* #ifdef h5 */
.web-only-surface {
    min-height: 100dvh;
}
/* #endif */
```

支持的目标名是 `wx` 和 `h5`。

### Sass、Less 和 Stylus

VPT 仍支持 `.scss`、`.sass`、`.less` 和 `.styl`，但不推荐新项目使用。新项目请优先使用 Tailwind，复杂组件样式使用 CSS Modules。迁移现有预处理器样式时，需要安装对应的依赖，例如：

```sh
npm install --save-dev sass
```

然后像普通 CSS 一样导入：

```tsx
import './profile-card.scss'
```

PostCSS 配置使用 Vite 的 `css.postcss` 或项目根目录中的 PostCSS 配置文件。

## 样式热更新

运行 `npm run dev:wx` 时，以下修改会触发样式热更新：

- 修改已导入的 CSS、CSS Modules 或预处理器文件。
- 在 JSX 中新增、替换或删除 Tailwind 类名。
- 添加或删除组件对样式文件的导入。

VPT 会先写入新的 `dist/wx/assets/global.wxss`，再发布同一次代码更新，使样式与组件代码保持一致。Web 目标使用 Vite 自带的 CSS 热更新。

## 样式如何进入应用

样式文件必须由应用模块图导入。全局样式通常从 `src/app.tsx` 导入：

```tsx
import type { PropsWithChildren } from 'react'
import './app.css'

function App({ children }: PropsWithChildren) {
    return children
}

export default App
```

页面或组件也可以导入自己的样式；未被任何应用、页面或组件导入的样式不会进入构建结果。

### 微信与 Web 的区别

Web 目标沿用 Vite 的 CSS 行为。微信目标会收集应用和所有页面可达的样式，转换为一个全局文件：

```text
dist/wx/assets/global.wxss
```

这包含普通导入、CSS Modules、Tailwind 生成结果和动态导入分支中的样式。因此，微信目标不会等到动态组件加载时再加载它的 CSS。

:::note
原生组件自带的 `.wxss` 会继续跟随原生组件输出，不会合并到 React 应用的 `global.wxss` 中。
:::

## 常见问题

### Tailwind 类名没有生成

确认引入 Tailwind 的 CSS 文件仍由 `app.tsx` 导入，并保留 `@source "./"`。同时检查类名是否以完整字符串出现在扫描范围内。

### CSS Modules 导入没有类型

确认应用的 TypeScript 配置包含：

```json
{
    "compilerOptions": {
        "types": ["vite/client", "vite-plugin-taro/client"]
    }
}
```

### 微信与 Web 显示不同

检查所用属性和选择器是否受 WXSS 支持，并确认尺寸换算、默认元素样式和 Tailwind Preflight。不要依赖微信开发者工具的 PostCSS；模板将其关闭，样式转换由 vpt 完成。

### 修改样式后没有更新

确认运行的是 `dev:wx`，微信开发者工具打开的是当前项目的 `dist/wx`，并检查终端是否有 CSS 语法或 Tailwind 生成错误。修复错误并再次保存后会继续热更新。
