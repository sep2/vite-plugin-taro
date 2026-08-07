---
title: 微信原生组件
description: 在 React 中类型安全地使用微信原生组件，并让原生资源参与全自动分包。
---

使用 `defineNativeComponent()` 为已有的微信原生组件声明一个 React 接口。vpt 会自动复制原生文件、注册组件并规划分包。

## 在 React 中使用

假设原生组件入口是 `src/native-counter/counter.js`：

先为它定义一个 TypeScript 接口：

```tsx
// src/components/native-counter.tsx
import {
    defineNativeComponent,
    type NativeComponentEvent
} from 'virtual:taro/native'

type NativeCounterProps = {
    count: number
    onIncrement?: (event: NativeComponentEvent<{ value: number }>) => void
}

export const NativeCounter = defineNativeComponent<NativeCounterProps>(
    // 路径相对于当前文件，并指向原生组件的 .js 入口
    () => import('../native-counter/counter.js')
)
```

`() => import(...)` 只是供编译器识别原生组件入口的标记，不会导入原生代码。事实上，此文件会被编译器完全移除。

此文件可以放在任意位置，在 React 中使用这个接口即可：

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
- `.json`、`.wxml` 和 `.wxss` 必须与 `.js` 入口同名；
- 所有运行时依赖必须在该目录内，并使用相对路径；
- 原生文件不会经过 Vite 转换，因此不能使用 Vite alias；
- 每个原生组件的目录名必须唯一。

## TypeScript 类型

TypeScript 接口描述可以在 React 中传入的属性和事件：

```tsx
import type { NativeComponentEvent } from 'virtual:taro/native'
import type { Profile } from './profile.ts'

type NativeProfileProps = {
    profile: Profile
    onSelect?: (event: NativeComponentEvent<{ id: string }>) => void
}

export const NativeProfile = defineNativeComponent<NativeProfileProps>(
    () => import('../native-profile/profile.js')
)
```

是否必填由 TypeScript 接口决定：没有 `?` 的属性必填，带 `?` 的属性可选。字段可以使用任意 TypeScript 类型，包括导入的类型。类型声明必须与 `defineNativeComponent()` 位于同一个文件，以便编译器生成原生模板。

普通字段对应原生 `properties`。`onSelect` 对应 `triggerEvent('select')`，事件数据位于 `event.detail`。

没有字段时不需要声明类型：

```tsx
export const NativeDivider = defineNativeComponent(
    () => import('../native-divider/divider.js')
)
```

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

vpt 只输出实际使用的原生组件，并将其资源纳入主包和分包的位置规划。

`defineNativeComponent()` 及其接口文件会被编译为空，其中的 `import()` 只用于定位原生入口，不会创建分包。`React.lazy()` 需要运行时组件，因此按需加载时要增加一个普通 React 包装组件：

```text
src/pages/counter/
├── native-counter.tsx
├── native-counter-wrap.tsx
└── page.tsx
```

`native-counter.tsx` 只声明原生组件接口：

```tsx
// src/pages/counter/native-counter.tsx
import {
    defineNativeComponent,
    type NativeComponentEvent
} from 'virtual:taro/native'

type NativeCounterProps = {
    count: number
    onIncrement?: (event: NativeComponentEvent<{ value: number }>) => void
}

export const NativeCounter = defineNativeComponent<NativeCounterProps>(
    () => import('../../native-counter/counter.js')
)
```

`native-counter-wrap.tsx` 提供运行时组件：

```tsx
// src/pages/counter/native-counter-wrap.tsx
import { useState } from 'react'
import { NativeCounter } from './native-counter.tsx'

export default function NativeCounterWrap() {
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

`page.tsx` 动态导入包装组件：

```tsx
// src/pages/counter/page.tsx
import { lazy, Suspense, useState } from 'react'
import { Button, Text } from 'virtual:taro/components'

const NativeCounterWrap = lazy(() => import('./native-counter-wrap.tsx'))

export default function Page() {
    const [visible, setVisible] = useState(false)

    return (
        <>
            <Button onClick={() => setVisible(true)}>打开原生计数器</Button>
            {visible ? (
                <Suspense fallback={<Text>加载中…</Text>}>
                    <NativeCounterWrap />
                </Suspense>
            ) : null}
        </>
    )
}
```

首次渲染 `NativeCounterWrap` 时会触发动态导入，包装组件及其使用的原生资源随之参与全自动位置规划。

完整规划规则参见[全自动分包](/guides/automatic-subpackages/)。

## 同时构建微信 与 Web

Web 代码不能导入使用 `virtual:taro/native` 的接口文件。共享组件可以通过条件编译选择实现：

```tsx
// #ifdef h5
import { WebCounter } from './web-counter.tsx'
// #endif

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

确认原生 `properties`、`triggerEvent()` 名称与 TypeScript 字段一致。

### 原生组件内部找不到文件

将所有依赖放在原生组件目录内，并使用有效的相对路径。

## 示例

- [`native-comp-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/native-comp-demo)：属性与事件双向通信。
- [`towxml-stream-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/towxml-stream-demo)：Towxml、增量 adapter 和自动分包。
