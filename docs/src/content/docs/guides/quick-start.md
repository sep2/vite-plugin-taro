---
title: 快速开始
description: 使用 create-vite-taro 创建并运行第一个微信小程序与 Web 应用。
---

新项目推荐使用 `create-vite-taro`。默认模板包含 Vite 8、React 19、Taro 4、TypeScript 和 Tailwind CSS v4。

## 创建项目

```sh
npm create vite-taro@latest my-app
cd my-app
npm install
```

也可以使用 pnpm：

```sh
pnpm --config.minimum-release-age=0 create vite-taro@latest my-app
cd my-app
pnpm install
```

## 配置微信 App ID

生成的项目包含 `.env.local`。将其中的环境变量设置为你的微信小程序 App ID：

```dotenv
VITE_PLUGIN_TARO_WECHAT_APP_ID=你的微信小程序AppID
```

未配置时，模板会使用 `touristappid`。

## 启动开发环境

### 微信小程序

```sh
npm run dev:wx
```

Vite 准备完成后，在微信开发者工具中打开 `dist/wx`。默认模板已经启用 `compileHotReLoad`，JavaScript 和 TypeScript 组件修改会通过 React Refresh 更新，并尽可能保留当前 App、页面、组件和输入状态。

### Web

```sh
npm run dev:h5
```

浏览器访问 Vite 输出的地址，默认为 <http://localhost:5173>。微信与 Web 开发服务器可以在两个终端中同时运行。

## 构建与检查

```sh
npm run build:wx     # 构建微信小程序到 dist/wx
npm run build:h5     # 构建 Web 应用到 dist/h5
npm run preview:h5   # 预览 Web 生产构建
npm run typecheck    # 使用 tsc 检查类型
```

## 使用 Taro 组件和 API

应用代码通过插件提供的虚拟模块使用 Taro：

```tsx
import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'

export default function IndexPage() {
    return (
        <View className="p-4">
            <Text>你好，Taro</Text>
            <Button onClick={() => Taro.showToast({ title: '成功' })}>显示提示</Button>
        </View>
    )
}
```

| 导入 | 用途 |
| --- | --- |
| `virtual:taro/components` | `View`、`Text`、`Button`、`Image`、`ScrollView` 等 Taro React 组件。 |
| `virtual:taro/api` | `Taro.navigateTo`、`Taro.getWindowInfo`、`Taro.useLaunch` 等 API 和 hooks。 |

应用无需安装或直接导入 `@tarojs/*` 包。组件和 API 的具体用法与 Taro 一致，可参考 [Taro 官方文档](https://docs.taro.zone)。

## 下一步

- 查看[配置选项](../../reference/configuration/)，了解页面、应用与微信项目配置。
- 查看仓库中的 [`loan-genius` 示例应用](https://github.com/sep2/vite-plugin-taro/tree/main/packages/loan-genius)。
- 了解[微信小程序 HMR 架构](https://github.com/sep2/vite-plugin-taro/blob/main/draft/hmr-architecture.zh.md)。
