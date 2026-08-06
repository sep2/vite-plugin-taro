---
title: Skyline 模式
description: 配置、调试和发布使用 Skyline 渲染引擎的微信小程序。
---

Skyline 是微信小程序的新一代渲染引擎。它减少了传统 WebView 渲染中的跨线程通信，并提供面向复杂交互和高性能动画的渲染能力。

`create-vite-taro` 的默认模板已经生成 Skyline 所需配置。无需安装额外依赖，也没有专用的 vpt 选项；相关设置直接写在 `vitePluginTaro()` 的 `appJson`、页面配置和 `projectConfigJson` 中。

## 默认配置

模板在 `vite.config.ts` 中包含：

```ts
vitePluginTaro({
    // ...
    appJson: {
        lazyCodeLoading: 'requiredComponents',
        renderer: 'skyline',
        componentFramework: 'glass-easel',
        rendererOptions: {
            skyline: {
                defaultDisplayBlock: true,
                defaultContentBox: true
            }
        },
        window: {
            navigationStyle: 'custom'
        }
    },
    projectConfigJson: {
        // ...
        setting: {
            compileHotReLoad: true,
            skylineRenderEnable: false
        }
    }
})
```

| 配置 | 作用 |
| --- | --- |
| `renderer: 'skyline'` | 为页面选择 Skyline 渲染引擎。 |
| `componentFramework: 'glass-easel'` | 使用支持 Skyline 的组件框架。 |
| `lazyCodeLoading: 'requiredComponents'` | 按需注入页面所需组件。 |
| `defaultDisplayBlock` | 将 Skyline 节点的默认布局从 `flex` 调整为 `block`。 |
| `defaultContentBox` | 将默认盒模型从 `border-box` 调整为 `content-box`，更接近 Web。 |
| `navigationStyle: 'custom'` | 由应用绘制导航栏，而不是使用微信默认导航栏。 |
| `skylineRenderEnable` | 控制微信开发者工具是否开启 Skyline 渲染调试。 |

## 开发模式与 Skyline 调试

默认模板把 `skylineRenderEnable` 设为 `false`，让日常开发继续使用微信开发者工具的热更新。应用输出仍然包含 Skyline 配置，但开发者工具模拟器不会强制使用 Skyline 渲染。

需要检查 Skyline 的实际布局和组件行为时，将它改为 `true`：

```ts
projectConfigJson: {
    // ...
    setting: {
        compileHotReLoad: true,
        skylineRenderEnable: true
    }
}
```

重新打开微信项目后，在开发者工具的“详情 → 本地设置”中确认已开启 Skyline 渲染调试，并把调试基础库设为 **3.1.0 或更高版本**。模拟器左上角应显示当前 renderer 为 `skyline`。

:::caution[微信开发者工具限制]
微信开发者工具的 Skyline 渲染调试目前不支持热更新。这是微信开发者工具自身的限制，不是 vpt 的限制；vpt 不会因为应用配置了 Skyline 而关闭热更新。模板默认关闭 `skylineRenderEnable`，是为了在日常开发中继续使用热更新，需要检查 Skyline 兼容性时再按需开启。
:::

## 全局开启或按页面开启

### 全局开启

把 `renderer` 和 `componentFramework` 放在 `appJson` 中，所有页面都会请求 Skyline。默认模板使用这种方式：

```ts
appJson: {
    renderer: 'skyline',
    componentFramework: 'glass-easel',
    rendererOptions: {
        skyline: {
            defaultDisplayBlock: true,
            defaultContentBox: true
        }
    }
}
```

### 按页面开启

如果正在逐步迁移，可以只为部分页面配置 Skyline。保留 `appJson.rendererOptions`，并把渲染设置放进目标页面：

```ts
pages: [
    {
        path: 'pages/index/index',
        config: {
            renderer: 'skyline',
            componentFramework: 'glass-easel',
            navigationStyle: 'custom'
        }
    },
    {
        path: 'pages/settings/index',
        config: {}
    }
],
appJson: {
    lazyCodeLoading: 'requiredComponents',
    rendererOptions: {
        skyline: {
            defaultDisplayBlock: true,
            defaultContentBox: true
        }
    }
}
```

这样首页使用 Skyline，设置页继续使用 WebView。业务组件和导入路径不需要因为渲染引擎不同而改变。

## 适配样式与组件

Skyline 尽量保持小程序上层语法不变，但不是浏览器 CSS 的完整实现。迁移时重点检查：

- 使用 `ScrollView` 实现滚动，并为滚动区域提供明确尺寸；`overflow: scroll` 不受支持。
- 不依赖 `inline`、完整的 `inline-block`、BFC 或浏览器层叠上下文。
- `position: sticky` 应改用微信提供的 `sticky-header` 或 `sticky-section` 能力。
- 检查属性选择器、通配选择器及不受支持的 CSS 属性。
- 在真机上检查文字、固定定位、阴影、渐变、动画和长列表。

模板启用 `defaultDisplayBlock` 与 `defaultContentBox`，可以减少常见的 Web 与 Skyline 布局差异，但不会让 Skyline 支持所有浏览器 CSS。完整差异请参考[微信 Skyline WXSS 文档](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/wxss.html)。

## 验证结果

1. 将 `skylineRenderEnable` 改为 `true`。
2. 运行微信开发模式并在开发者工具中打开 `dist/wx`。
3. 确认调试基础库不低于 3.1.0，模拟器显示 `skyline`。
4. 逐页检查布局、滚动、手势、弹层和自定义导航栏。
5. 使用预览或体验版在 Android 与 iOS 真机上测试。
6. 检查 WebView 回退时页面仍可正常使用。

微信基础库 3.0.2 开始支持 Skyline；默认模板使用的 `defaultContentBox` 需要基础库 3.1.0，因此项目应以 **3.1.0** 作为最低检查版本。OHOS 的支持版本要求更高，请以[微信 Skyline 起步文档](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/migration/)为准。

## 发布与灰度

配置 `renderer: 'skyline'` 不代表所有正式用户会立即使用 Skyline。微信支持通过 We 分析 AB 实验逐步放量，也允许开发版和体验版通过 “Switch Render” 在 `Auto`、`WebView` 与 `Skyline` 之间切换。

发布前应先用小范围用户验证稳定性、性能和 WebView 回退效果，再逐步扩大 Skyline 流量。具体流程请参考[微信 Skyline 迁移指南](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/migration/)。
