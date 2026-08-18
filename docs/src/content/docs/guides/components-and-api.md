---
title: 组件与 API
description: 在 VPT 中使用 Taro 组件与 API。
---

VPT 使用 Taro 4 的组件和 API 规范。

## 使用组件

组件从 `virtual:taro/components` 导入：

```tsx
import { Text, View } from 'virtual:taro/components'

export default function AccountCard() {
    return (
        <View className="rounded-2xl bg-slate-950 p-5">
            <Text className="text-xl font-bold text-white">账户概览</Text>
        </View>
    )
}
```

`create-vite-taro` 默认启用 Tailwind CSS v4。更多样式用法参见[样式](/guides/styles/)。

### JSX 约定

- 组件名使用 PascalCase，例如 `View`、`ScrollView` 和 `PageMeta`。
- 属性使用 camelCase，例如 `scrollY` 和 `hoverClass`。
- 样式类使用 `className`。
- 事件以 `on` 开头，例如 `onClick`、`onScroll` 和 `onChange`。
- 共享页面使用 Taro 组件，不要直接使用 `<div>`、`<span>` 等 Web 元素。

## 使用 API

Taro API 包括内置功能和对小程序能力的封装，统一挂载在 `Taro` 命名空间下。VPT 从 `virtual:taro/api` 提供这些接口：

```ts
import Taro from 'virtual:taro/api'

export async function confirmSave() {
    const result = await Taro.showModal({
        title: '保存修改',
        content: '确定保存当前修改吗？'
    })

    return result.confirm
}
```

异步 API 支持 Promise，可以使用 `await`，也可以传入 Taro 文档所列的回调函数。

:::caution
不要安装或直接导入 `@tarojs/components` 和 `@tarojs/taro`。
:::

## 平台支持

完整接口和平台支持见 Taro 的[组件文档](https://docs.taro.zone/docs/components-desc)与 [API 文档](https://docs.taro.zone/docs/apis/about/desc)。VPT 只需关注其中的微信小程序与 H5：

- 微信小程序专用细节可查阅[微信小程序开发文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)。
- 标记为小程序专用的组件或 API 不能用于 Web；共享代码应使用[条件编译](/guides/conditional-directives/)隔离。
