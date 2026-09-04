---
title: 条件编译
description: 使用条件指令编写微信、支付宝小程序和 Web 的目标专用源码。
---

目标专用源码可以使用条件块。

TypeScript、JavaScript 和 JSX/TSX 使用行注释：

```ts
// #ifdef wx
console.log('仅微信小程序')
// #endif

// #ifdef zfb
console.log('仅支付宝小程序')
// #endif

// #ifdef h5
console.log('仅 H5')
// #else
console.log('非 H5 目标')
// #endif
```

样式使用块注释：

```css
/* #ifdef wx */
.platform-panel {
    padding: 32rpx;
}
/* #endif */

/* #ifdef h5 */
.platform-panel {
    padding: 1rem;
}
/* #endif */
```

支持：

- `#ifdef wx`、`#ifdef zfb` 和 `#ifdef h5`；
- `#ifndef`；
- `#else`；
- `#endif`；
- 嵌套条件。

不支持 `#if` 和 `#elif`。

条件编译适用于项目中的 TypeScript、JavaScript、JSX/TSX、CSS、Sass、Less 和 Stylus，不处理 `node_modules`。

`tsc` 会把标记视为注释，因此仍会检查所有分支。每个分支都必须是合法的 TypeScript。
