---
title: App 与页面
description: 学习如何用 App 包裹页面、共享状态，并正确使用应用和页面生命周期。
---

VPT 项目中有两类入口：

- **App** 是整个应用的外层组件，只创建一次，页面跳转时会保留状态；
- **页面**对应一个路由，例如首页、详情页和设置页。

不同于原版 Taro，VPT 允许渲染 App 返回的任意组件，行为更贴近 Web 标准。

## 用 App 包裹页面

在 App 中自由组合视图，并在需要的位置渲染 `children`：

```tsx title="src/app.tsx"
import type { PropsWithChildren } from 'react'
import { Text, View } from 'virtual:taro/components'
import './app.css'

function App({ children }: PropsWithChildren) {
    return (
        <View className="app-shell">
            <Text className="app-title">我的应用</Text>
            {children}
            <Text className="app-footer">示例页脚</Text>
        </View>
    )
}

export default App
```

App 可以只返回 `children`，也可以在它外面添加背景、标题、页脚、共享状态或其他公共组件。

无论什么情况，请始终渲染 `children`。

## 不要编写巨型 App

`app.tsx` 应只负责组合公共布局和共享状态。把较大的功能提取成独立组件，再在 App 中调用：

```tsx title="src/app.tsx"
import type { PropsWithChildren } from 'react'
import { AppShell } from './components/app-shell.tsx'

function App({ children }: PropsWithChildren) {
    return <AppShell>{children}</AppShell>
}

export default App
```

仅拆分文件可以让代码更清晰，但静态导入的组件及其依赖仍需随 App 启动。对于大型且不必立即显示的功能，
可以在提取出的组件中继续使用 `React.lazy()`：

```tsx title="src/components/app-shell.tsx"
import { lazy, Suspense, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { Button, View } from 'virtual:taro/components'

const AppTools = lazy(() => import('./app-tools.tsx'))

export function AppShell({ children }: PropsWithChildren) {
    const [toolsOpen, setToolsOpen] = useState(false)

    return (
        <View>
            {children}
            <Button onClick={() => setToolsOpen(true)}>打开工具</Button>
            {toolsOpen && (
                <Suspense fallback={<View>加载中…</View>}>
                    <AppTools />
                </Suspense>
            )}
        </View>
    )
}
```

工具组件及其依赖会等到首次打开时再加载。VPT 会自动规划这些动态模块的分包位置。这样可以减少启动时必须
加载和执行的代码。完整规则参见[全自动分包](/guides/automatic-subpackages/)。

App 中可以使用任意组件，包括[微信原生组件](/guides/native-components/)。

## 在页面之间共享状态

登录信息、主题和跨页面操作可以放在 App 的 Context 中，也可以使用 Jotai、Zustand 等状态管理库。可以把
Context 和 Provider 一起放在独立文件中，让 App 只负责组合它们。

```tsx title="src/app.tsx"
import type { PropsWithChildren } from 'react'
import { AppCountProvider } from './app-count-context.tsx'

function App({ children }: PropsWithChildren) {
    return <AppCountProvider>{children}</AppCountProvider>
}

export default App
```

```tsx title="src/app-count-context.tsx"
import { createContext, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'

export const AppCountContext = createContext({
    count: 0,
    increment: () => undefined
})

export function AppCountProvider({ children }: PropsWithChildren) {
    const [count, setCount] = useState(0)
    const contextValue = useMemo(
        () => ({
            count: count,
            increment: () => setCount((currentCount) => currentCount + 1)
        }),
        [count]
    )

    return <AppCountContext.Provider value={contextValue}>{children}</AppCountContext.Provider>
}
```

页面可以读取和更新同一个值：

```tsx title="src/pages/profile/index.tsx"
import { useContext } from 'react'
import { Button, Text, View } from 'virtual:taro/components'
import { AppCountContext } from '../../app-count-context.tsx'

function ProfilePage() {
    const appCount = useContext(AppCountContext)

    return (
        <View>
            <Text>{`全局计数：${appCount.count}`}</Text>
            <Button onClick={appCount.increment}>增加全局计数</Button>
        </View>
    )
}

export default ProfilePage
```

## App 生命周期

在 App 中使用应用生命周期：

```tsx title="src/app.tsx"
import type { PropsWithChildren } from 'react'
import { useDidHide, useDidShow, useLaunch } from 'virtual:taro/api'

function App({ children }: PropsWithChildren) {
    useLaunch(() => {
        console.log('应用启动')
    })

    useDidShow(() => {
        console.log('应用进入前台')
    })

    useDidHide(() => {
        console.log('应用进入后台')
    })

    return children
}
```

页面跳转不会再次调用 `useLaunch()`。应用进入后台再回到前台时，会调用对应的 `useDidHide()` 和
`useDidShow()`。

## 页面生命周期

在页面组件中使用页面生命周期：

```tsx title="src/pages/detail/index.tsx"
import { useDidHide, useDidShow, useLoad, useUnload } from 'virtual:taro/api'
import { View } from 'virtual:taro/components'

function DetailPage() {
    useLoad((options) => {
        console.log('页面加载', options)
    })

    useDidShow(() => {
        console.log('页面显示')
    })

    useDidHide(() => {
        console.log('页面隐藏')
    })

    useUnload(() => {
        console.log('页面卸载')
    })

    return <View>详情页</View>
}
```

常见跳转的行为如下：

| 操作 | 原页面 | 新页面 |
| --- | --- | --- |
| `navigateTo()` | 隐藏并保留状态 | 加载并显示 |
| `navigateBack()` | 下层页面恢复显示 | 顶层页面卸载 |
| `redirectTo()` | 当前页面卸载 | 新页面加载并显示 |
| `reLaunch()` | 原页面栈卸载 | 新页面加载并显示 |

页面隐藏不等于 React 组件卸载。通过 `navigateTo()` 打开新页面后，旧页面的 React 状态仍然存在，
`useEffect()` 的清理函数也不会仅因为页面隐藏而执行。

需要在隐藏时暂停的定时器、订阅或动画，应使用 `useDidHide()`；页面再次显示时，再通过 `useDidShow()` 恢复。

## 页面跳转和参数

使用 Taro 路由 API 打开页面：

```tsx
import Taro from 'virtual:taro/api'

Taro.navigateTo({
    url: '/pages/order/detail?id=42'
})
```

在目标页面中读取参数：

```tsx title="src/pages/order/detail.tsx"
import { useLoad } from 'virtual:taro/api'
import { View } from 'virtual:taro/components'

function OrderDetailPage() {
    useLoad((options) => {
        console.log('订单 ID', options.id)
    })

    return <View>订单详情</View>
}
```

目标页面必须已经在 `vpt({ pages })` 中声明。参见[配置选项](/guides/configuration/#pages)。

## 相关文档

- [配置选项](/guides/configuration/)：声明 App、页面路径和页面配置。
- [组件与 API](/guides/components-and-api/)：使用组件、生命周期和路由 API。
- [样式](/guides/styles/)：编写 App 和页面样式。
- [开发者工具热更新](/guides/hot-module-replacement/)：了解更新时保留的 App 和页面状态。
