---
title: 微信原生组件
description: 在 React 中类型安全地使用微信原生组件，并让原生资源参与全自动分包。
---

使用 `defineNativeComponent()` 为已有的微信原生组件声明一个 JSX 接口。vpt 会自动复制原生文件、注册组件并规划分包。

:::note
原生组件仅适用于 `wx`。H5 需要提供单独的 Web 实现。
:::

## 在 React 中使用

假设原生组件入口是 `src/native-counter/counter.js`：

先为它定义一个 JSX 接口：

```tsx
// src/components/native-counter.tsx
import { defineNativeComponent } from 'virtual:taro/native'

export const NativeCounter = defineNativeComponent(
    // 路径相对于当前文件，并指向原生组件的 .js 入口
    () => import('../native-counter/counter.js'),
{
    properties: {
        count: Number
    },
    events: {
        increment: {
            value: Number
        }
    }
})
```

此文件可以放在任意位置。`() => import(...)` 只是供编译器识别原生组件入口的标记，不会导入原生代码。事实上，此文件会被编译器完全移除。

然后在 JSX 中使用这个接口即可：

```tsx
// src/pages/index/index.tsx
import { useState } from 'react'
import { NativeCounter } from '../../components/native-counter.tsx'

export default function CounterDemo() {
    const [count, setCount] = useState(0)

    return (
        <NativeCounter
            count={count}
            onIncrement={(event) => {
                setCount(event.detail.value)
            }}
        />
    )
}
```

属性和事件都有完整类型，事件数据位于 `event.detail`。组件注册和文件复制由 vpt 自动完成。

`NativeCounter` 组件只存在于编译时，不是 React 运行时组件，也不会生成额外代码或带来性能开销。

## 原生组件目录

原生组件及其资源必须放在同一个目录中：

```text
src/native-counter/
├── counter.js
├── counter.json
├── counter.wxml
├── counter.wxss
├── assets/
│   └── background.png
└── child-component/
    ├── child.js
    ├── child.json
    └── child.wxml
```

vpt 会递归复制目录中的文件并保留相对路径。WXS、图片、字体、子组件和 CommonJS 模块都可以放在里面。

- `defineNativeComponent()` 必须指向真实的 `.js` 入口；
- `.json`、`.wxml` 和可选 `.wxss` 必须与 `.js` 入口同名；
- 所有运行时依赖必须在该目录内，并使用相对路径；
- 原生文件不会经过 Vite 转换，因此不能使用 Vite alias；
- 每个原生组件的目录名必须唯一。

## Schema 与类型

`properties` 定义 React props，`events` 定义事件：

```tsx
export const NativeProfile = defineNativeComponent(
    () => import('../native-profile/profile.js'),
{
    properties: {
        profile: {
            name: String,
            age: Number,
            verified: Boolean
        }
    },
    events: {
        select: {
            id: String
        }
    }
})
```

| Schema | React 类型 |
| --- | --- |
| `String` | `string` |
| `Number` | `number` |
| `Boolean` | `boolean` |
| `Object` | `Readonly<Record<string, unknown>>` |
| `Array` | `readonly unknown[]` |
| 嵌套对象 | 对应的精确对象类型 |

schema 必须直接写在调用中：

- 同时提供 `properties` 和 `events`；
- 没有字段时使用空对象；
- 不使用变量、函数调用、spread 或计算属性名；
- 属性和事件不能同名。

```tsx
export const NativeDivider = defineNativeComponent(
    () => import('../native-divider/divider.js'),
{
    properties: {},
    events: {}
})
```

原生组件中的 `properties` 和 `triggerEvent()` 名称必须与 schema 一致。

## 使用 Slot

在原生 WXML 中声明 slot：

```xml
<!-- src/native-counter/counter.wxml -->
<slot name="title"></slot>
```

命名 slot 需要在原生组件中启用 `multipleSlots`：

```js
// src/native-counter/counter.js
Component({
    options: {
        multipleSlots: true
    }
})
```

然后通过 Taro 的 `Slot` 传入内容：

```tsx
import { Slot, Text } from 'virtual:taro/components'

<NativeCounter count={count}>
    <Slot name="title">
        <Text>Title from React</Text>
    </Slot>
</NativeCounter>
```

完整示例见 [`native-comp-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/native-comp-demo)。

## 全自动分包

vpt 只输出实际使用的原生组件。原生文件会跟随使用该接口的代码进入主包或自动分包。

`defineNativeComponent()` 中的 `() => import(...)` 不会创建分包。需要按需加载时，使用普通的动态导入：

```tsx
import { lazy, Suspense } from 'react'
import { Text } from 'virtual:taro/components'

const NativeCounterDemo = lazy(() => import('./native-counter-demo.tsx'))

export default function Index() {
    return (
        <Suspense fallback={<Text>Loading…</Text>}>
            <NativeCounterDemo />
        </Suspense>
    )
}
```

`native-counter-demo.tsx` 再导入 `NativeCounter`。完整规则参见[全自动分包](/guides/automatic-subpackages/)。

## 同时构建 WX 与 H5

H5 代码不能导入使用 `virtual:taro/native` 的接口文件。共享组件可以通过条件编译选择实现：

```tsx
import WebCounter from './web-counter.tsx'

// #ifdef wx
import { NativeCounter } from './native-counter.tsx'
// #endif

export default function Counter(props: { count: number }) {
    // #ifdef wx
    return <NativeCounter count={props.count} />
    // #endif

    // #ifdef h5
    return <WebCounter count={props.count} />
    // #endif
}
```

条件语法详见[配置选项中的条件编译](/references/configuration/#条件编译)。

## 第三方组件

第三方组件只要有明确的 `.js` 入口、完整的运行目录，并通过属性和事件交互，就可以直接使用 `defineNativeComponent()`。

如果组件需要命令、增量数据或共享原生状态，可以增加一个很薄的原生 adapter：

```text
src/towxml-adapter/
├── towxml-adapter.js
├── towxml-adapter.json
├── towxml-adapter.wxml
├── towxml-adapter.wxss
└── towxml/
```

React 和原生组件不共享 CommonJS 模块实例。使用属性和事件通信，再由 adapter 调用原生 API。

## 属性传输

不要在流式更新中反复传递不断增长的完整内容：

```tsx
// 不推荐
<NativeMarkdown markdown={accumulatedMarkdown} />
```

应传递大小受限的有序数据块，并在原生组件中累积。对高频更新进行批量和节流，完整内容保存在 JavaScript 内存或原生状态中。

[`towxml-stream-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/towxml-stream-demo) 展示了分块 Markdown、ready 握手和滚动处理。

## 排查问题

### 找不到原生入口

路径必须相对于 `defineNativeComponent()` 所在文件，并指向 `.js`：

```tsx
// 正确
() => import('../native-counter/counter.js')

// 错误：只指向目录
() => import('../native-counter')
```

### 页面没有注册组件

确认接口被页面或其依赖使用。未使用的接口不会输出原生文件。

### 属性或事件没有传递

确认原生 `properties`、`triggerEvent()` 名称与 schema 一致。

### 原生组件内部找不到文件

将所有依赖放在原生组件目录内，并使用有效的相对路径。

## 示例

- [`native-comp-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/native-comp-demo)：属性与事件双向通信。
- [`towxml-stream-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/towxml-stream-demo)：Towxml、增量 adapter 和自动分包。
