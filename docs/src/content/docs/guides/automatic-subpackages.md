---
title: 全自动分包
description: 使用动态导入，让 vpt 自动管理微信小程序的主包与分包。
---

开发者不再需要关心微信小程序的单包 2M 限制。

应用代码可按照标准 Web 规则互相引用。

在实际产物中，主包引用分包，分包引用主包，分包引用分包，循环依赖引用，全部都没有问题。

你唯一需要做的是决定“何时加载某功能”，而不是“这个功能该放哪个包”。

:::note
你不需要手动配置任何 `subPackages`。分包是全自动的。
:::

## 静态引用

需要随 App 或页面一起启动的代码照常使用静态 `import`：

```ts
import { initializeStore } from './store'

initializeStore()
```

从 App、页面及其依赖通过静态导入可达的模块会保留在主包。

## 按需加载

在功能入口使用 `import()`：

```ts
async function openReport() {
    const { createReport } = await import('./features/report')
    return await createReport()
}
```

只需要在功能入口使用一次动态 `import()`。这表明该模块可以被异步加载（和 Web 规则一致）。

该功能内部继续使用普通静态引用：

```ts
// features/report.ts
import { collectData } from './collect-data'
import { renderPdf } from './render-pdf'

export function createReport() {
    return renderPdf(collectData())
}
```

动态 `import()` 后面的**静态依赖也会参与全自动拆包**，**不需要**把每个文件都改成动态导入。

即使 **静态依赖超过 2M 大小限制也无所谓**。

实际上，vpt 会分析所有依赖的引用关系，重写并解耦它们，把它们放置在合适的位置。

## 使用 `React.lazy`

```tsx
import { lazy, Suspense } from 'react'
import { View } from 'virtual:taro/components'

const Report = lazy(() => import('./features/report.tsx'))

function ReportEntry() {
    return (
        <Suspense fallback={<View>正在加载报表…</View>}>
            <Report />
        </Suspense>
    )
}
```

`./features/report.tsx` 默认导出 React 组件。首次渲染 `<Report />` 时会触发动态导入。

## 如何异步加载页面

页面就是一个普通组件。

和 Web 一样，做个骨架屏，然后通过 `React.lazy()` 和 `<Suspense>` 去动态加载真正的页面组件。这个组件就会被自动分包。

当然，页面也可以是原生页面，只要按照 [微信原生组件](/guides/native-components/) 设置，也可以通过同样的 `<Suspense>` 去加载。

## 设计原则

适合按需加载的通常是大型编辑器、图表、报表、导出工具或其他低频功能。应在完整功能的入口使用 `import()`，而不是逐个动态导入小型工具模块。

功能内部保持静态导入，只有确实需要更晚加载的部分才继续使用下一层 `import()`。


## 拆分规则

全自动位置规划：指最终可能在主包，也可能在分包。当然，应用代码不需要关心这些分包信息。

| 源码关系                             | 结果                                               |
|--------------------------------------|----------------------------------------------------|
| App、页面及其静态依赖                | 微信要求同步启动，所以保留在主包                   |
| 仅通过动态 `import()` 到达的功能入口 | 参与全自动位置规划                                 |
| 动态 `import()` 后面的静态依赖       | 参与全自动位置规划；若同时也是启动依赖，则留在主包 |
| 按需功能内部的下一层动态 `import()`  | 参与全自动位置规划                                 |
| `import type`                        | 构建时移除，不影响位置规划                         |



## 原生组件与其他资源

微信原生组件会参与位置规划。vpt 会把原生组件目录的文件体积计入声明模块，并将目录输出到该模块最终所属的主包或分包。接入方式、类型 schema 和动态加载示例参见[微信原生组件](/guides/native-components/)。
只要整个原生组件的目录不超过 2M，可以完全交给 vpt 自动规划。

固定入口 `app.wxss`、它导入的 `assets/global.wxss`、图片、字体和其他普通构建资源暂不参与位置规划；对这些资源的自动规划已列入后续版本，敬请期待。


## 原理与实现

位置规划算法、跨分包加载方式和微信运行时原理参见[模块系统](/references/module-system/)。
