---
title: 微信原生组件
description: 在 React 中以完整类型使用微信小程序原生自定义组件，并让组件参与全自动分包。
---

vpt 可以把一个微信原生自定义组件目录直接接入 React。原生组件继续使用 `Component()`、WXML、WXSS 和微信组件 JSON；React 通过一个静态 facade 传入属性并接收事件。构建时，vpt 会复制原生目录、生成模板声明和 `usingComponents`，并把原生文件纳入全自动分包规划。

:::note
原生组件仅适用于 `wx` 目标。构建 H5 的共享应用必须通过条件编译或独立入口提供 Web 实现。
:::

## 最小示例

### 1. 创建原生组件目录

创建一个以 `counter` 为入口的原生组件：

```text
src/native/native-counter/
├── counter.js
├── counter.json
├── counter.wxml
└── counter.wxss
```

`counter.json` 声明原生组件：

```json
{
    "component": true,
    "styleIsolation": "isolated"
}
```

`counter.js` 定义属性并发出事件：

```js
Component({
    properties: {
        count: {
            type: Number,
            value: 0
        }
    },

    methods: {
        increment() {
            this.triggerEvent('increment', {
                value: this.properties.count + 1
            })
        }
    }
})
```

`counter.wxml` 正常使用微信原生模板：

```xml
<view class="native-counter">
    <text>Native count: {{ count }}</text>
    <button bindtap="increment">Increment from native</button>
</view>
```

原生组件的 WXSS、WXS、图片、子组件和其他运行时文件都可以放在这个目录中。vpt 会递归复制整个目录，并保留相对路径。

### 2. 声明 React facade

创建 `src/pages/index/native-counter.tsx`：

```tsx
import { defineNativeComponent } from 'virtual:taro/native'

export const NativeCounter = defineNativeComponent(import('../../native/native-counter/counter.js'), {
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

这里的 `import('../../native/native-counter/counter.js')` 是 `defineNativeComponent()` 的**编译期组件入口引用**，不是运行时加载边界。它必须使用静态相对路径并明确指向原生 `.js` 入口。

schema 必须直接写在调用中，并同时包含 `properties` 与 `events`；没有属性或事件时也要写空对象：

```tsx
const NativeDivider = defineNativeComponent(import('../../native/native-divider/divider.js'), {
    properties: {},
    events: {}
})
```

### 3. 在 React 中渲染

facade 是一个带完整 TypeScript 类型的 React 组件：

```tsx
import { Button, Text, View } from 'virtual:taro/components'
import { useState } from 'react'
import { NativeCounter } from './native-counter'

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

## Schema 与 TypeScript 类型

schema 支持以下静态构造器。它只描述 React 桥接类型和生成模板需要暴露的字段，不会替你修改或校验原生 `Component()` 定义；原生侧仍需声明匹配的 `properties` 并发出匹配的事件。

| Schema | React 类型 |
| --- | --- |
| `String` | `string` |
| `Number` | `number` |
| `Boolean` | `boolean` |
| `Object` | `Readonly<Record<string, unknown>>` |
| `Array` | `readonly unknown[]` |
| 嵌套对象 | 按相同规则生成精确对象类型 |

优先使用嵌套对象表达已知结构：

```tsx
const NativeProfile = defineNativeComponent(import('../../native/native-profile/profile.js'), {
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

对应类型等价于：

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

schema 是构建宏，不是普通运行时对象，因此有意限制为完全静态的语法：

- 两个顶层字段只能是 `properties` 和 `events`；
- 不支持变量、函数调用、spread 或计算属性名；
- 属性与事件不能使用同一个名称；
- `import()` 参数必须是指向 `.js` 组件入口的静态相对路径。

不符合约束时，构建会在 facade 调用位置给出错误。

## 原生目录约定

`defineNativeComponent(import('./native-card/card.js'), ...)` 使用目录名 `native-card` 作为生成的原生标签名，使用入口 basename `card` 作为微信组件路径，并注册到：

```text
/components/native-card/card
```

入口的同名伴随文件由微信按正常规则读取：

```text
src/native/native-card/
├── card.js
├── card.json
├── card.wxml
└── card.wxss
```

需要遵守以下规则：

1. `import()` 必须明确指向真实的原生 `.js` 入口文件；
2. `.json`、`.wxml` 和可选 `.wxss` 与入口使用相同 basename；
3. vpt 会复制入口所在的整个目录，嵌套组件与运行时文件应放在该目录内；
4. 不同原生组件目录的 basename 必须在应用中保持唯一；
5. 原生文件按原样复制，不经过 Vite 的 JavaScript、CSS 或资源转换；
6. 原生运行时依赖应使用复制后仍然有效的相对路径。

React 导出名不需要等于目录名或入口名；目录 basename 决定原生标签与输出目录，入口 basename 决定 `usingComponents` 路径。

## 构建时会发生什么

当一个 facade 模块最终保留在产物中时，vpt 会：

1. 在编译期读取 `defineNativeComponent()` schema；
2. 递归收集并监听原生目录中的普通文件；
3. 把目录体积计入 facade 模块的分包规划权重；
4. 将原生目录原样输出到主包或 facade 所在的自动分包；
5. 在 Taro 的共享 WXML 模板中声明 schema 的属性和事件；
6. 自动写入页面 JSON 的 `usingComponents`；
7. 跨包加载时自动生成 `componentPlaceholder`，等待微信下载对应分包。

不需要手写页面的 `usingComponents`，也不要手动复制原生目录到 `dist/wx`。

生产构建后，可以在以下位置检查结果：

```text
# facade 位于主包
 dist/wx/components/native-counter/

# facade 被规划到自动分包
 dist/wx/sub/<generated-name>/components/native-counter/
```

## 与全自动分包一起使用

facade 参数中指向原生 `.js` 入口的 `import()` 不会创建分包。要按需加载原生组件，应在功能入口建立正常的 JavaScript 动态导入边界，例如使用 `React.lazy()`：

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

`native-counter-demo.tsx` 再静态导入 facade。这样原生目录会跟随该功能参与位置规划，并在需要时从自动分包加载。完整规则参见[全自动分包](/guides/automatic-subpackages/)。

## 同时构建 WX 与 H5

不要让 H5 模块图到达 `virtual:taro/native` facade。共享组件可以用条件编译选择实现：

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

facade 文件本身只需要被 WX 代码引用。条件语法详见[配置选项中的条件编译](/references/configuration/#条件编译)。

## 第三方原生组件与 adapter

如果第三方组件已经满足以下条件，可以直接声明 facade，不需要 adapter：

- 可以明确指向组件的 `.js` 入口，且运行文件位于同一自包含目录；
- 所有交互都能表达为原生属性和事件；
- 目录内依赖可以随目录一起复制。

以下情况适合增加一个很薄的原生 adapter：

- 第三方组件依赖同一原生 CommonJS 模块实例中的命令式状态；
- React 需要发送命令、增量数据或桥接滚动信息；
- 必须保持第三方目录完全不修改。

推荐结构：

```text
src/native/towxml-adapter/
├── towxml-adapter.js       # 属性、事件和增量数据桥
├── towxml-adapter.json
├── towxml-adapter.wxml
├── towxml-adapter.wxss
└── towxml/                 # 未修改的第三方原生目录
```

React 声明的是 `towxml-adapter` facade；adapter 再通过自己的同名 JSON 和 WXML 使用内部第三方组件。

不要从 React 直接导入第三方原生目录中的 CommonJS 状态模块。React bundle 与原生组件并不共享同一个模块执行边界，导入后得到的状态未必是原生组件正在读取的实例。用属性和事件跨越边界，adapter 内部再调用第三方原生 API。

## 属性传输与性能

原生组件属性会经过 React/Taro 到微信原生组件的数据桥。不要在流式更新中反复传递不断增长的完整字符串、数组或对象：

```tsx
// 不推荐：每次更新都重新传输全部 Markdown
<NativeMarkdown markdown={accumulatedMarkdown} />
```

长度为 `n` 的内容如果逐字符累积传输，总桥接数据量会达到 O(n²)，微信开发者工具也会提示“属性值数据量过大”。

更好的方式是传递有序的小块，并在原生 adapter 内累积：

```tsx
const NativeMarkdown = defineNativeComponent(import('../../native/markdown-adapter/markdown-adapter.js'), {
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

建议同时做到：

- 每个属性更新保持固定上限；
- 用单调递增的 `sequence` 去重并保证顺序；
- 等待原生 `ready` 事件后再发送数据；
- 对高频输入进行批量和节流，而不是每个字符触发一次 React render；
- 完整内容保存在普通 JavaScript 内存或原生状态中，不要放进 JSX 属性。

这样跨桥数据量可以保持 O(n)。[`towxml-stream-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/towxml-stream-demo) 展示了分块 Markdown、ready 握手、停止命令和滚动虚拟化的完整实现。

## 调试清单

### 构建提示找不到目录

确认 `import()` 相对于 facade 文件，并明确指向原生 `.js` 入口：

```tsx
// 正确：任意微信组件 basename
import('../../native/native-counter/counter.js')

// 另一个组件入口
import('../../native/towxml/towxml.js')

// 错误：只指向目录
import('../../native/native-counter')
```

### 页面没有注册组件

确认 facade 模块确实被页面或其依赖引用。未使用、被 tree-shaking 删除的 facade 不会输出原生目录。

然后检查生成页面 JSON 中的 `usingComponents`，以及对应的 `dist/wx/components` 或自动分包目录。

### 属性或事件没有传递

原生 `properties`、`triggerEvent()` 名称与 facade schema 必须完全一致。新增字段后同时更新两侧声明。

### 第三方组件内部找不到文件

vpt 保留原生目录内部的相对路径，但不会替原生文件处理 Vite alias 或把目录外依赖打进来。把所需运行时文件放进被复制的目录，或增加一个自包含 adapter。

## 示例

- [`native-comp-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/native-comp-demo)：最小属性与事件双向通信。
- [`towxml-stream-demo`](https://github.com/sep2/vite-plugin-taro/tree/main/packages/towxml-stream-demo)：未修改的第三方 Towxml、增量 adapter、Tailwind React UI 和自动分包。
