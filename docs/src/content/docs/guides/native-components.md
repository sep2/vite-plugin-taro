---
title: 微信原生组件
description: 通过类型安全的 React facade 使用微信原生组件，并让原生资源参与全自动分包。
---

当项目中已有微信原生组件时，用 `defineNativeComponent()` 声明一个 React facade 即可在 JSX 中使用它。vpt 会根据 facade 找到原生入口，复制运行时文件，生成模板声明和 `usingComponents`，并将原生资源纳入全自动分包。

:::note
原生组件仅适用于 `wx` 目标。构建 H5 时，需要通过条件编译或独立入口提供 Web 实现。
:::

## 在 React 中使用

假设项目已有原生组件入口 `src/native-counter/counter.js`，可以在任意位置定义 facade：

```tsx
// src/components/native-counter.tsx
import { defineNativeComponent } from 'virtual:taro/native'

export const NativeCounter = defineNativeComponent(
    import('../native-counter/counter.js'),
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

facade 可以放在项目中的任意位置，包括原生组件目录。`import()` 使用相对于 facade 文件的静态路径，并明确指向真实的原生 `.js` 入口。

这个 `import()` 是编译期入口引用，不会在运行时加载 JavaScript，也不会创建动态导入边界。

`NativeCounter` 是一个带完整 TypeScript 类型的 React 组件，可以直接在 JSX 中使用：

```tsx
import { Button, Text, View } from 'virtual:taro/components'
import { useState } from 'react'
import { NativeCounter } from '../../components/native-counter'

export default function CounterDemo() {
    const [count, setCount] = useState(0)

    return (
        <View className="flex flex-col gap-4 p-6">
            <Text>React count: {count}</Text>

            <NativeCounter
                count={count}
                onIncrement={(event) => {
                    setCount(event.detail.value)
                }}
            />

            <Button onClick={() => setCount((currentCount) => currentCount + 10)}>React +10</Button>
        </View>
    )
}
```

原生属性会成为必填 React props。原生事件 `increment` 会成为可选的 `onIncrement`，事件数据位于 `event.detail`。

不需要手写页面 `usingComponents`，也不需要把原生目录手动复制到 `dist/wx`。

## 原生组件目录

vpt 对原生组件的目录要求只有一个：组件入口、伴随文件、资源和运行时依赖必须位于同一个自包含目录中。例如：

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

vpt 会递归复制这个目录中的原生运行时文件并保留相对路径，因此可以包含 WXS、图片、字体、子组件和 CommonJS 模块。

目录需要满足以下规则：

1. facade 必须引用真实的 `.js` 入口文件；
2. `.json`、`.wxml` 和可选 `.wxss` 使用微信要求的入口 basename；
3. 原生运行时依赖必须位于入口目录内，并使用复制后仍然有效的相对路径；
4. 原生文件按原样复制，不经过 Vite 的 JavaScript、CSS 或资源转换；
5. 不要在原生文件中使用 Vite alias 或依赖 Vite 打包目录外的文件；
6. 不同原生组件目录的 basename 必须在应用中保持唯一。

目录 basename 决定生成的原生标签和输出目录，入口 basename 决定微信组件路径。以上面的组件为例，生成路径为：

```text
/components/native-counter/counter
```

React 导出名不需要与目录名或入口名相同。

## Schema 与类型

schema 描述 React 与原生组件之间的属性和事件边界：

```tsx
export const NativeProfile = defineNativeComponent(
    import('../native-profile/profile.js'),
{
    properties: {
        profile: {
            name: String,
            age: Number,
            flags: {
                verified: Boolean
            }
        }
    },
    events: {
        select: {
            id: String,
            source: String
        }
    }
})
```

对应的 React 类型等价于：

```ts
{
    profile: {
        name: string
        age: number
        flags: {
            verified: boolean
        }
    }
    onSelect?: (event: {
        detail: {
            id: string
            source: string
        }
    }) => void
}
```

支持以下静态构造器：

| Schema | React 类型 |
| --- | --- |
| `String` | `string` |
| `Number` | `number` |
| `Boolean` | `boolean` |
| `Object` | `Readonly<Record<string, unknown>>` |
| `Array` | `readonly unknown[]` |
| 嵌套对象 | 按相同规则生成精确对象类型 |

schema 是编译期语法，不是普通运行时对象，因此必须满足以下约束：

- schema 直接写在 `defineNativeComponent()` 调用中；
- 顶层同时包含 `properties` 和 `events`，没有字段时使用空对象；
- 不使用变量、函数调用、spread 或计算属性名；
- 属性与事件不能使用相同名称；
- `import()` 参数是指向 `.js` 入口的静态相对路径。

空 schema 示例：

```tsx
export const NativeDivider = defineNativeComponent(
    import('../native-divider/divider.js'),
{
    properties: {},
    events: {}
})
```

schema 只负责生成 React 类型和桥接模板，不会修改或校验原生 `Component()` 定义。原生侧仍需声明匹配的 `properties`，并通过 `triggerEvent()` 发出匹配的事件。

## 构建与全自动分包

只有最终保留在模块图中的 facade 才会生成原生组件输出。构建时，vpt 会：

1. 读取 facade 的入口和 schema；
2. 收集原生目录中的运行时文件及其体积；
3. 将原生资源计入 facade 的分包规划权重；
4. 输出原生文件并生成共享 WXML 模板声明；
5. 自动写入页面 JSON 的 `usingComponents`；
6. 跨包使用时生成 `componentPlaceholder`。

facade 位于主包时，原生组件输出到：

```text
dist/wx/components/native-counter/
```

facade 被规划到自动分包时，原生组件输出到：

```text
dist/wx/sub/<generated-name>/components/native-counter/
```

`defineNativeComponent(import(...))` 中的入口引用不会创建分包。要按需加载组件，需要在功能入口建立普通的 JavaScript 动态导入边界，例如：

```tsx
import { lazy, Suspense } from 'react'
import { Text } from 'virtual:taro/components'

const NativeCounterDemo = lazy(() => import('./native-counter-demo'))

export default function Index() {
    return (
        <Suspense fallback={<Text>Loading native component…</Text>}>
            <NativeCounterDemo />
        </Suspense>
    )
}
```

`native-counter-demo.tsx` 再静态导入 facade。这样 facade、原生资源和功能代码会一起参与位置规划。完整规则参见[全自动分包](/guides/automatic-subpackages/)。

## 同时构建 WX 与 H5

不要让 H5 模块图到达 `virtual:taro/native` facade。共享组件可以通过条件编译选择实现：

```tsx
import WebCounter from './web-counter'

// #ifdef wx
import { NativeCounter } from './native-counter'
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

facade 文件只需要被 WX 代码引用。条件语法详见[配置选项中的条件编译](/references/configuration/#条件编译)。

## 第三方组件与 adapter

第三方原生组件满足以下条件时，可以直接定义 facade：

- 有明确的 `.js` 组件入口；
- 运行文件位于同一个自包含目录；
- React 与原生侧的交互可以完全表达为属性和事件。

需要命令式状态或增量通信时，在第三方目录外增加一个很薄的原生 adapter：

```text
src/towxml-adapter/
├── towxml-adapter.js
├── towxml-adapter.json
├── towxml-adapter.wxml
├── towxml-adapter.wxss
└── towxml/
```

adapter 适合处理以下情况：

- 第三方组件依赖同一原生 CommonJS 模块实例中的状态；
- React 需要发送命令、增量数据或滚动信息；
- 第三方原生目录必须保持不修改。

不要从 React bundle 直接导入原生 CommonJS 状态模块。React 与原生组件不共享模块执行边界，导入后得到的状态未必是原生组件正在使用的实例。用属性和事件跨越边界，再由 adapter 调用原生 API。

## 属性传输与性能

属性会经过 React/Taro 到微信原生组件的数据桥。流式更新时，不要反复传递不断增长的完整字符串、数组或对象：

```tsx
// 不推荐：每次更新都重新传输全部 Markdown
<NativeMarkdown markdown={accumulatedMarkdown} />
```

长度为 `n` 的内容如果逐字符累积传输，总桥接数据量会达到 O(n²)。应改为传递有固定上限的有序数据块，并在原生 adapter 内累积：

```tsx
export const NativeMarkdown = defineNativeComponent(
    import('../markdown-adapter/markdown-adapter.js'),
{
    properties: {
        chunk: {
            sequence: Number,
            value: String
        },
        streamFinished: Boolean
    },
    events: {
        ready: {
            id: String
        }
    }
})
```

建议：

- 限制每次属性更新的大小；
- 使用单调递增的 `sequence` 去重并保证顺序；
- 等待原生 `ready` 事件后再发送数据；
- 对高频输入进行批量和节流；
- 将完整内容保存在普通 JavaScript 内存或原生状态中，而不是 JSX 属性中。

这样跨桥数据量可以保持 O(n)。[`towxml-stream-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/towxml-stream-demo) 展示了完整实现。

## 排查问题

### 找不到原生入口

确认路径相对于 facade 文件，并明确指向 `.js`：

```tsx
// 正确
import('../native-counter/counter.js')

// 错误：只指向目录
import('../native-counter')
```

### 页面没有注册组件

确认 facade 最终被页面或其依赖引用。未使用或被 tree-shaking 删除的 facade 不会输出原生组件。

然后检查页面 JSON 的 `usingComponents`，以及对应的 `dist/wx/components` 或自动分包目录。

### 属性或事件没有传递

确保原生 `properties`、`triggerEvent()` 名称与 facade schema 完全一致。新增字段时同时更新两侧声明。

### 原生组件内部找不到文件

vpt 只复制入口所在的自包含目录，不会处理 Vite alias，也不会把目录外依赖打包进来。将依赖移动到原生目录内，并使用有效的相对路径。

## 示例

- [`native-comp-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/native-comp-demo)：最小属性与事件双向通信。
- [`towxml-stream-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/towxml-stream-demo)：第三方 Towxml、增量 adapter、Tailwind React UI 和自动分包。
