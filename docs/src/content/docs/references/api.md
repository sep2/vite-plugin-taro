---
title: API 参考
description: VPT 支持的 Taro API、参数与平台差异。
tableOfContents:
    minHeadingLevel: 2
    maxHeadingLevel: 2
---

<!-- Adapted from NervJS/taro-docs, MIT License, Copyright (c) 2018. -->

应用代码从 `virtual:taro/api` 导入 API。通用写法参见[组件与 API](/guides/components-and-api/)。

## Hooks

### Taro.useDidShow(callback)

页面展示时的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useDidShow)

### Taro.useDidHide(callback)

页面隐藏时的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useDidHide)

### Taro.usePullDownRefresh(callback)

下拉刷新时的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/usePullDownRefresh)

### Taro.useReachBottom(callback)

上拉触底时的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useReachBottom)

### Taro.usePageScroll(callback)

页面滚动时的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/usePageScroll)

### Taro.useResize(callback)

页面尺寸改变时的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useResize)

### Taro.useShareAppMessage(callback)

页面转发时的回调。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useShareAppMessage)

### Taro.useTabItemTap(callback)

当前是 tab 页时，tab 被点击时的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useTabItemTap)

### Taro.useAddToFavorites(callback)

用户点击右上角菜单“收藏”按钮时的回调。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useAddToFavorites)

### Taro.useShareTimeline(callback)

用户点击右上角菜单“分享到朋友圈”按钮时的回调。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useShareTimeline)

### Taro.useSaveExitState(callback)

页面销毁前保留状态回调

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useSaveExitState)

### Taro.useLaunch(callback)

小程序初始化完成时的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useLaunch)

### Taro.useError(callback)

小程序发生脚本错误或 API 调用报错时触发的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useError)

### Taro.useUnhandledRejection(callback)

小程序有未处理的 Promise reject 时触发。也可以使用 Taro.onUnhandledRejection 绑定监听。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useUnhandledRejection)

### Taro.usePageNotFound(callback)

小程序要打开的页面不存在时触发的回调。

> Web: 多页面模式不支持该方法

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/usePageNotFound)

### Taro.useLoad(callback)

页面加载完成时的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useLoad)

### Taro.useUnload(callback)

页面卸载时的回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useUnload)

### Taro.useReady(callback)

页面初次渲染完成的回调。
此时页面已经准备妥当，可以和视图层进行交互。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useReady)

### Taro.useRouter(dynamic)

获取当前路由参数。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/useRouter)

### Taro.usePullIntercept(callback)

下拉中断时的回调。

**支持：** Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.hooks/usePullIntercept)

## 扩展

### eventCenter

事件中心

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.extend/eventCenter)

### Taro.getEnv()

获取环境变量

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.extend/getEnv)

### Taro.pxTransform(size)

尺寸转换

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.extend/pxTransform)

### Taro.initPxTransform(config)

尺寸转换初始化

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.extend/initPxTransform)

### Taro.getAppInfo()

小程序获取和 Taro 相关的 App 信息

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.extend/getAppInfo)

#### AppInfo

应用信息

| 参数 | 说明 |
| --- | --- |
| platform |  |
| taroVersion |  |
| designWidth |  |

### Taro.getRenderer()

获取当前页面渲染引擎类型

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.extend/getRenderer)

### requirePlugin

小程序引用插件 JS 接口

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.extend/requirePlugin)

### Taro.getCurrentInstance()

获取当前页面实例

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.extend/getCurrentInstance)

#### Current

| 参数 | 说明 |
| --- | --- |
| app |  |
| router |  |
| page |  |
| onReady |  |
| onHide |  |
| onShow |  |
| preloadData |  |

### Taro.getTabBar(page)

获取自定义 TabBar 对应的 React 组件实例

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.extend/getTabBar)

### Taro.interceptorify(promiseifyApi)

包裹 promiseify api 的洋葱圈模型

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/taro.extend/interceptorify)

#### promiseifyApi

```tsx
(requestParams: T) => Promise<R>
```

| 参数 | 说明 |
| --- | --- |
| requestParams |  |

#### InterceptorifyChain

| 参数 | 说明 |
| --- | --- |
| requestParams |  |
| proceed |  |

#### InterceptorifyInterceptor

```tsx
(chain: InterceptorifyChain<T, R>) => Promise<R>
```

| 参数 | 说明 |
| --- | --- |
| chain |  |

##### request

```tsx
(requestParams: T) => Promise<R>
```

| 参数 | 说明 |
| --- | --- |
| requestParams |  |

##### addInterceptor

```tsx
(interceptor: InterceptorifyInterceptor<T, R>) => void
```

| 参数 | 说明 |
| --- | --- |
| interceptor |  |

##### cleanInterceptors

```tsx
() => void
```

## 框架

### Taro.getApp(opts)

获取到小程序全局唯一的 App 实例。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/framework/getApp)

#### 参数

| 参数 | 说明 |
| --- | --- |
| allowDefault | 在 `App` 未定义时返回默认实现。当App被调用时，默认实现中定义的属性会被覆盖合并到App中。一般用于独立分包 |

#### Instance

```tsx
Option | T
```

### Taro.getCurrentPages()

获取当前页面栈。数组中第一个元素为首页，最后一个元素为当前页面。
__注意：__
- __不要尝试修改页面栈，会导致路由以及页面状态错误。__
- 不要在 `App.onLaunch` 的时候调用 `getCurrentPages()`，此时 `page` 还没有生成。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/framework/getCurrentPages)

## 基础

### env

环境变量

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/env)

### Taro.canIUse(schema)

判断小程序的 API，回调，参数，组件等是否在当前版本可用。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/canIUse)

### Taro.canIUseWebp()

判断能否使用 WebP 格式

> 在小程序平台中仅在 android 和 devtools 设备时可用

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/canIUseWebp)

### Taro.base64ToArrayBuffer(base64)

将 Base64 字符串转成 ArrayBuffer 数据。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/base64ToArrayBuffer)

### Taro.arrayBufferToBase64(buffer)

将 ArrayBuffer 数据转成 Base64 字符串。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/arrayBufferToBase64)

### Taro.openSystemBluetoothSetting(option)

跳转系统蓝牙设置页

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/openSystemBluetoothSetting)

#### 参数

| 参数 | 说明 |
| --- | --- |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

### Taro.openAppAuthorizeSetting(option)

跳转系统微信授权管理页

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/openAppAuthorizeSetting)

#### 参数

| 参数 | 说明 |
| --- | --- |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

### Taro.getWindowInfo()

获取窗口信息

> Web: 不支持 statusBarHeight、safeArea

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getWindowInfo)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| pixelRatio | 设备像素比 |
| screenWidth | 屏幕宽度，单位px |
| screenHeight | 屏幕高度，单位px |
| windowWidth | 可使用窗口宽度，单位px |
| windowHeight | 可使用窗口高度，单位px |
| statusBarHeight | 状态栏的高度，单位px |
| safeArea | 在竖屏正方向下的安全区域 |

### Taro.getSystemSetting()

获取设备设置

> Web: 不支持 bluetoothEnabled、locationEnabled、wifiEnabled

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getSystemSetting)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| bluetoothEnabled | 蓝牙的系统开关 |
| locationEnabled | 地理位置的系统开关 |
| wifiEnabled | Wi-Fi 的系统开关 |
| deviceOrientation | 设备方向 |

#### DeviceOrientation

设备方向合法值

| 参数 | 说明 |
| --- | --- |
| portrait | 竖屏 |
| landscape | 横屏 |

### Taro.getSystemInfoSync()

[Taro.getSystemInfo](./getSystemInfo) 的同步版本

> 微信小程序: 小程序可以在微信和企业微信中调用此接口，但是在企业微信中调用此接口时，会额外返回一个 environment 字段（微信中不返回），如此字段值为 wxwork，则表示当前小程序运行在企业微信环境中。
>
> Web: 不支持 version、statusBarHeight、fontSizeSetting、SDKVersion

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getSystemInfoSync)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| brand | 设备品牌 |
| model | 设备型号 |
| pixelRatio | 设备像素比 |
| screenWidth | 屏幕宽度，单位px |
| screenHeight | 屏幕高度，单位px |
| windowWidth | 可使用窗口宽度，单位px |
| windowHeight | 可使用窗口高度，单位px |
| statusBarHeight | 状态栏的高度，单位px |
| language | 微信设置的语言 |
| version | 微信版本号 |
| system | 操作系统及版本 |
| platform | 客户端平台 |
| fontSizeSetting | 用户字体大小（单位px）。以微信客户端「我-设置-通用-字体大小」中的设置为准 |
| SDKVersion | 客户端基础库版本 |
| benchmarkLevel | 设备性能等级（仅Android小游戏）。取值为：-2 或 0（该设备无法运行小游戏），-1（性能未知），>=1（设备性能值，该值越高，设备性能越好，目前最高不到50） |
| albumAuthorized | 允许微信使用相册的开关（仅 iOS 有效） |
| cameraAuthorized | 允许微信使用摄像头的开关 |
| locationAuthorized | 允许微信使用定位的开关 |
| microphoneAuthorized | 允许微信使用麦克风的开关 |
| notificationAuthorized | 允许微信通知的开关 |
| notificationAlertAuthorized | 允许微信通知带有提醒的开关（仅 iOS 有效） |
| notificationBadgeAuthorized | 允许微信通知带有标记的开关（仅 iOS 有效） |
| notificationSoundAuthorized | 允许微信通知带有声音的开关（仅 iOS 有效） |
| phoneCalendarAuthorized | 允许微信使用日历的开关 |
| bluetoothEnabled | 蓝牙的系统开关 |
| locationEnabled | 地理位置的系统开关 |
| wifiEnabled | Wi-Fi 的系统开关 |
| safeArea | 在竖屏正方向下的安全区域 |
| locationReducedAccuracy | `true` 表示模糊定位，`false` 表示精确定位，仅 iOS 支持 |
| theme | 系统当前主题，取值为light或dark，全局配置"darkmode":true时才能获取，否则为 undefined （不支持小游戏） |
| host | 当前小程序运行的宿主环境 |
| enableDebug | 是否已打开调试。可通过右上角菜单或 [Taro.setEnableDebug](https://docs.taro.zone/docs/apis/base/debug/setEnableDebug) 打开调试。 |
| deviceOrientation | 设备方向 |
| environment | 小程序当前运行环境 |

#### Theme

系统主题合法值

| 参数 | 说明 |
| --- | --- |
| dark | 深色主题 |
| light | 浅色主题 |

#### Host

| 参数 | 说明 |
| --- | --- |
| appId | 宿主 app 对应的 appId |

#### DeviceOrientation

设备方向合法值

| 参数 | 说明 |
| --- | --- |
| portrait | 竖屏 |
| landscape | 横屏 |

### Taro.getSystemInfoAsync(res)

异步获取系统信息。需要一定的微信客户端版本支持，在不支持的客户端上，会使用同步实现来返回。

> 微信小程序: 小程序可以在微信和企业微信中调用此接口，但是在企业微信中调用此接口时，会额外返回一个 environment 字段（微信中不返回），如此字段值为 wxwork，则表示当前小程序运行在企业微信环境中。
>
> Web: 不支持 version、statusBarHeight、fontSizeSetting、SDKVersion

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getSystemInfoAsync)

#### 参数

| 参数 | 说明 |
| --- | --- |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 返回值

| 参数 | 说明 |
| --- | --- |
| brand | 设备品牌 |
| model | 设备型号 |
| pixelRatio | 设备像素比 |
| screenWidth | 屏幕宽度，单位px |
| screenHeight | 屏幕高度，单位px |
| windowWidth | 可使用窗口宽度，单位px |
| windowHeight | 可使用窗口高度，单位px |
| statusBarHeight | 状态栏的高度，单位px |
| language | 微信设置的语言 |
| version | 微信版本号 |
| system | 操作系统及版本 |
| platform | 客户端平台 |
| fontSizeSetting | 用户字体大小（单位px）。以微信客户端「我-设置-通用-字体大小」中的设置为准 |
| SDKVersion | 客户端基础库版本 |
| benchmarkLevel | 设备性能等级（仅Android小游戏）。取值为：-2 或 0（该设备无法运行小游戏），-1（性能未知），>=1（设备性能值，该值越高，设备性能越好，目前最高不到50） |
| albumAuthorized | 允许微信使用相册的开关（仅 iOS 有效） |
| cameraAuthorized | 允许微信使用摄像头的开关 |
| locationAuthorized | 允许微信使用定位的开关 |
| microphoneAuthorized | 允许微信使用麦克风的开关 |
| notificationAuthorized | 允许微信通知的开关 |
| notificationAlertAuthorized | 允许微信通知带有提醒的开关（仅 iOS 有效） |
| notificationBadgeAuthorized | 允许微信通知带有标记的开关（仅 iOS 有效） |
| notificationSoundAuthorized | 允许微信通知带有声音的开关（仅 iOS 有效） |
| phoneCalendarAuthorized | 允许微信使用日历的开关 |
| bluetoothEnabled | 蓝牙的系统开关 |
| locationEnabled | 地理位置的系统开关 |
| wifiEnabled | Wi-Fi 的系统开关 |
| safeArea | 在竖屏正方向下的安全区域 |
| locationReducedAccuracy | `true` 表示模糊定位，`false` 表示精确定位，仅 iOS 支持 |
| theme | 系统当前主题，取值为light或dark，全局配置"darkmode":true时才能获取，否则为 undefined （不支持小游戏） |
| host | 当前小程序运行的宿主环境 |
| enableDebug | 是否已打开调试。可通过右上角菜单或 [Taro.setEnableDebug](https://docs.taro.zone/docs/apis/base/debug/setEnableDebug) 打开调试。 |
| deviceOrientation | 设备方向 |
| environment | 小程序当前运行环境 |

#### Theme

系统主题合法值

| 参数 | 说明 |
| --- | --- |
| dark | 深色主题 |
| light | 浅色主题 |

#### Host

| 参数 | 说明 |
| --- | --- |
| appId | 宿主 app 对应的 appId |

#### DeviceOrientation

设备方向合法值

| 参数 | 说明 |
| --- | --- |
| portrait | 竖屏 |
| landscape | 横屏 |

### Taro.getSystemInfo(res)

获取系统信息，支持 `Promise` 化使用。

> 微信小程序: 小程序可以在微信和企业微信中调用此接口，但是在企业微信中调用此接口时，会额外返回一个 environment 字段（微信中不返回），如此字段值为 wxwork，则表示当前小程序运行在企业微信环境中。
>
> Web: 不支持 version、statusBarHeight、fontSizeSetting、SDKVersion

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getSystemInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 返回值

| 参数 | 说明 |
| --- | --- |
| brand | 设备品牌 |
| model | 设备型号 |
| pixelRatio | 设备像素比 |
| screenWidth | 屏幕宽度，单位px |
| screenHeight | 屏幕高度，单位px |
| windowWidth | 可使用窗口宽度，单位px |
| windowHeight | 可使用窗口高度，单位px |
| statusBarHeight | 状态栏的高度，单位px |
| language | 微信设置的语言 |
| version | 微信版本号 |
| system | 操作系统及版本 |
| platform | 客户端平台 |
| fontSizeSetting | 用户字体大小（单位px）。以微信客户端「我-设置-通用-字体大小」中的设置为准 |
| SDKVersion | 客户端基础库版本 |
| benchmarkLevel | 设备性能等级（仅Android小游戏）。取值为：-2 或 0（该设备无法运行小游戏），-1（性能未知），>=1（设备性能值，该值越高，设备性能越好，目前最高不到50） |
| albumAuthorized | 允许微信使用相册的开关（仅 iOS 有效） |
| cameraAuthorized | 允许微信使用摄像头的开关 |
| locationAuthorized | 允许微信使用定位的开关 |
| microphoneAuthorized | 允许微信使用麦克风的开关 |
| notificationAuthorized | 允许微信通知的开关 |
| notificationAlertAuthorized | 允许微信通知带有提醒的开关（仅 iOS 有效） |
| notificationBadgeAuthorized | 允许微信通知带有标记的开关（仅 iOS 有效） |
| notificationSoundAuthorized | 允许微信通知带有声音的开关（仅 iOS 有效） |
| phoneCalendarAuthorized | 允许微信使用日历的开关 |
| bluetoothEnabled | 蓝牙的系统开关 |
| locationEnabled | 地理位置的系统开关 |
| wifiEnabled | Wi-Fi 的系统开关 |
| safeArea | 在竖屏正方向下的安全区域 |
| locationReducedAccuracy | `true` 表示模糊定位，`false` 表示精确定位，仅 iOS 支持 |
| theme | 系统当前主题，取值为light或dark，全局配置"darkmode":true时才能获取，否则为 undefined （不支持小游戏） |
| host | 当前小程序运行的宿主环境 |
| enableDebug | 是否已打开调试。可通过右上角菜单或 [Taro.setEnableDebug](https://docs.taro.zone/docs/apis/base/debug/setEnableDebug) 打开调试。 |
| deviceOrientation | 设备方向 |
| environment | 小程序当前运行环境 |

#### Theme

系统主题合法值

| 参数 | 说明 |
| --- | --- |
| dark | 深色主题 |
| light | 浅色主题 |

#### Host

| 参数 | 说明 |
| --- | --- |
| appId | 宿主 app 对应的 appId |

#### DeviceOrientation

设备方向合法值

| 参数 | 说明 |
| --- | --- |
| portrait | 竖屏 |
| landscape | 横屏 |

### Taro.getSkylineInfoSync()

获取当前运行环境对于 Skyline 渲染引擎 的支持情况
基础库 2.26.2 开始支持

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getSkylineInfoSync)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| isSupported | 当前运行环境是否支持 Skyline 渲染引擎 |
| version | 当前运行环境 Skyline 渲染引擎 的版本号，形如 0.9.7 |
| reason | 当前运行环境不支持 Skyline 渲染引擎 的原因，仅在 isSupported 为 false 时出现 |

### Taro.getSkylineInfo(option)

获取当前运行环境对于 Skyline 渲染引擎 的支持情况
基础库 2.26.2 开始支持

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getSkylineInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 返回值

| 参数 | 说明 |
| --- | --- |
| isSupported | 当前运行环境是否支持 Skyline 渲染引擎 |
| version | 当前运行环境 Skyline 渲染引擎 的版本号，形如 0.9.7 |
| reason | 当前运行环境不支持 Skyline 渲染引擎 的原因，仅在 isSupported 为 false 时出现 |

### Taro.getRendererUserAgent(option)

获取 Webview 小程序的 UserAgent
基础库 2.26.3 开始支持

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getRendererUserAgent)

#### 参数

| 参数 | 说明 |
| --- | --- |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 返回值

| 参数 | 说明 |
| --- | --- |
| userAgent |  |

### Taro.getDeviceInfo()

获取设备基础信息

> Web: 不支持 abi、benchmarkLevel

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getDeviceInfo)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| abi | 应用二进制接口类型（仅 Android 支持） |
| deviceAbi | 设备二进制接口类型（仅 Android 支持） |
| benchmarkLevel | 设备性能等级（仅Android小游戏）。取值为：-2 或 0（该设备无法运行小游戏），-1（性能未知），>=1（设备性能值，该值越高，设备性能越好，目前最高不到50） |
| brand | 设备品牌 |
| model | 设备型号 |
| system | 操作系统及版本 |
| platform | 客户端平台 |
| CPUType | 设备 CPU 型号（仅 Android 支持） |

### Taro.getAppBaseInfo()

获取微信APP基础信息

> Web: 不支持 SDKVersion、host、version

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getAppBaseInfo)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| SDKVersion | 客户端基础库版本 |
| enableDebug | 是否已打开调试。可通过右上角菜单或 [Taro.setEnableDebug](https://docs.taro.zone/docs/apis/base/debug/setEnableDebug) 打开调试。 |
| host | 当前小程序运行的宿主环境 |
| language | 微信设置的语言 |
| version | 微信版本号 |
| theme | 系统当前主题，取值为light或dark，全局配置"darkmode":true时才能获取，否则为 undefined （不支持小游戏） |

#### Theme

系统主题合法值

| 参数 | 说明 |
| --- | --- |
| dark | 深色主题 |
| light | 浅色主题 |

#### Host

| 参数 | 说明 |
| --- | --- |
| appId | 宿主 app 对应的 appId |

### Taro.getAppAuthorizeSetting()

获取微信APP授权设置

- 'authorized' 表示已经获得授权，无需再次请求授权；
- 'denied' 表示请求授权被拒绝，无法再次请求授权；（此情况需要引导用户[打开系统设置](https://developers.weixin.qq.com/miniprogram/dev/api/base/system/wx.openAppAuthorizeSetting.html)，在设置页中打开权限）
- 'non determined' 表示尚未请求授权，会在微信下一次调用系统相应权限时请求；（仅 iOS 会出现。此种情况下引导用户打开系统设置，不展示开关）

> Web: 暂未支持设置权限

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/system/getAppAuthorizeSetting)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| albumAuthorized | 允许微信使用相册的开关（仅 iOS 有效） |
| bluetoothAuthorized | 允许微信使用蓝牙的开关（仅 iOS 有效） |
| cameraAuthorized | 允许微信使用摄像头的开关 |
| locationAuthorized | 允许微信使用定位的开关 |
| locationReducedAccuracy | 定位准确度。true 表示模糊定位，false 表示精确定位（仅 iOS 有效） |
| microphoneAuthorized | 允许微信使用麦克风的开关 |
| notificationAuthorized | 允许微信通知的开关 |
| notificationAlertAuthorized | 允许微信通知带有提醒的开关（仅 iOS 有效） |
| notificationBadgeAuthorized | 允许微信通知带有标记的开关（仅 iOS 有效） |
| notificationSoundAuthorized | 允许微信通知带有声音的开关（仅 iOS 有效） |
| phoneCalendarAuthorized | 允许微信读写日历的开关 |

#### Authorized

授权合法值

| 参数 | 说明 |
| --- | --- |
| authorized | 表示已经获得授权，无需再次请求授权 |
| denied | 表示请求授权被拒绝，无法再次请求授权 （此情况需要引导用户打开[打开系统设置](https://developers.weixin.qq.com/miniprogram/dev/api/base/system/wx.openAppAuthorizeSetting.html)，在设置页中打开权限） |
| not determined | 表示尚未请求授权，会在微信下一次调用系统相应权限时请求 （仅 iOS 会出现。此种情况下引导用户[打开系统设置](https://developers.weixin.qq.com/miniprogram/dev/api/base/system/wx.openAppAuthorizeSetting.html)，不展示开关） |

### Taro.updateWeChatApp(option)

更新客户端版本。当判断用户小程序所在客户端版本过低时，可使用该接口跳转到更新微信页面。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/update/updateWeChatApp)

#### 参数

| 参数 | 说明 |
| --- | --- |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

### Taro.getUpdateManager()

获取**全局唯一**的版本更新管理器，用于管理小程序更新。
关于小程序的更新机制，可以查看[运行机制](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/operating-mechanism.html)文档。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/update/getUpdateManager)

### UpdateManager

UpdateManager 对象，用来管理更新，可通过 Taro.getUpdateManager 接口获取实例。

**Tips**
- 微信开发者工具上可以通过「编译模式」下的「下次编译模拟更新」开关来调试
- 小程序开发版/体验版没有「版本」概念，所以无法在开发版/体验版上测试更版本更新情况

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/update/UpdateManager)

##### applyUpdate

强制小程序重启并使用新版本。在小程序新版本下载完成后（即收到 `onUpdateReady` 回调）调用。

```tsx
() => void
```

##### onCheckForUpdate

监听向微信后台请求检查更新结果事件。微信在小程序冷启动时自动检查更新，不需由开发者主动触发。

```tsx
(callback: OnCheckForUpdateCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 向微信后台请求检查更新结果事件的回调函数 |

##### onUpdateReady

监听小程序有版本更新事件。客户端主动触发下载（无需开发者触发），下载成功后回调

```tsx
(callback: (res: TaroGeneral.CallbackResult) => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 小程序有版本更新事件的回调函数 |

##### onUpdateFailed

监听小程序更新失败事件。小程序有新版本，客户端主动触发下载（无需开发者触发），下载失败（可能是网络原因等）后回调

```tsx
(callback: (res: TaroGeneral.CallbackResult) => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 小程序更新失败事件的回调函数 |

##### OnCheckForUpdateCallback

向微信后台请求检查更新结果事件的回调函数

```tsx
(result: OnCheckForUpdateResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnCheckForUpdateResult

| 参数 | 说明 |
| --- | --- |
| hasUpdate | 是否有新版本 |

### Taro.getLaunchOptionsSync()

获取小程序启动时的参数。与 [`App.onLaunch`](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html#onlaunchobject-object) 的回调参数一致。

**注意**
部分版本在无`referrerInfo`的时候会返回 `undefined`，建议使用 `options.referrerInfo && options.referrerInfo.appId` 进行判断。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/life-cycle/getLaunchOptionsSync)

#### LaunchOptions

启动参数

| 参数 | 说明 |
| --- | --- |
| path | 启动小程序的路径 |
| query | 启动小程序的 query 参数 |
| scene | 启动小程序的[场景值](https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/scene.html) |
| shareTicket | shareTicket，详见[获取更多转发信息](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share.html) |
| referrerInfo | 来源信息。从另一个小程序、公众号或 App 进入小程序时返回。否则返回 `{}`。(参见后文注意) |
| forwardMaterials | 打开的文件信息数组，只有从聊天素材场景打开（scene为1173）才会携带该参数 |
| chatType | 从微信群聊/单聊打开小程序时，chatType 表示具体微信群聊/单聊类型 |
| apiCategory | API 类别 |

##### ReferrerInfo

来源信息

| 参数 | 说明 |
| --- | --- |
| appId | 来源小程序、公众号或 App 的 appId |
| extraData | 来源小程序传过来的数据，scene=1037或1038时支持 |

##### ForwardMaterial

ChatType 类型合法值

| 参数 | 说明 |
| --- | --- |
| type | 文件的mimetype类型 |
| name | 文件名 |
| path | 文件路径（如果是webview则是url） |
| size | 文件大小 |

##### ChatType

ChatType 类型合法值

| 参数 | 说明 |
| --- | --- |
| 1 | 微信联系人单聊 |
| 2 | 企业微信联系人单聊 |
| 3 | 普通微信群聊 |
| 4 | 企业微信互通群聊 |

##### ApiCategory

API 类别合法值

| 参数 | 说明 |
| --- | --- |
| default | 默认类别 |
| nativeFunctionalized | 原生功能化，视频号直播商品、商品橱窗等场景打开的小程序 |
| browseOnly | 仅浏览，朋友圈快照页等场景打开的小程序 |
| embedded | 内嵌，通过打开半屏小程序能力打开的小程序 |

### Taro.getEnterOptionsSync()

获取本次小程序启动时的参数。如果当前是冷启动，则返回值与 [`App.onLaunch`](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html#onLaunch-Object-object) 的回调参数一致；如果当前是热启动，则返回值与 [`App.onShow`](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html#onShow-Object-object) 一致。

**注意**
部分版本在无 `referrerInfo` 的时候会返回 `undefined`，建议使用 `options.referrerInfo && options.referrerInfo.appId` 进行判断。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/life-cycle/getEnterOptionsSync)

#### EnterOptions

启动参数

| 参数 | 说明 |
| --- | --- |
| path | 启动小程序的路径 |
| scene | 启动小程序的[场景值](https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/scene.html) |
| query | 启动小程序的 query 参数 |
| shareTicket | shareTicket，详见[获取更多转发信息](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share.html) |
| referrerInfo | 来源信息。从另一个小程序、公众号或 App 进入小程序时返回。否则返回 `{}`。(参见后文注意) |
| forwardMaterials | 打开的文件信息数组，只有从聊天素材场景打开（scene为1173）才会携带该参数 |
| chatType | 从微信群聊/单聊打开小程序时，chatType 表示具体微信群聊/单聊类型 |
| apiCategory | API 类别 |

##### ReferrerInfo

来源信息

| 参数 | 说明 |
| --- | --- |
| appId | 来源小程序、公众号或 App 的 appId |
| extraData | 来源小程序传过来的数据，scene=1037或1038时支持 |

##### ForwardMaterial

ChatType 类型合法值

| 参数 | 说明 |
| --- | --- |
| type | 文件的mimetype类型 |
| name | 文件名 |
| path | 文件路径（如果是webview则是url） |
| size | 文件大小 |

##### ChatType

ChatType 类型合法值

| 参数 | 说明 |
| --- | --- |
| 1 | 微信联系人单聊 |
| 2 | 企业微信联系人单聊 |
| 3 | 普通微信群聊 |
| 4 | 企业微信互通群聊 |

##### ApiCategory

API 类别合法值

| 参数 | 说明 |
| --- | --- |
| default | 默认类别 |
| nativeFunctionalized | 原生功能化，视频号直播商品、商品橱窗等场景打开的小程序 |
| browseOnly | 仅浏览，朋友圈快照页等场景打开的小程序 |
| embedded | 内嵌，通过打开半屏小程序能力打开的小程序 |

### Taro.onUnhandledRejection(callback)

监听未处理的 Promise 拒绝事件。该事件与 [`App.onUnhandledRejection`](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html#onUnhandledRejection-Object-object) 的回调时机与参数一致。

**注意**
- 所有的 unhandledRejection 都可以被这一监听捕获，但只有 Error 类型的才会在小程序后台触发报警。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/onUnhandledRejection)

#### 回调

```tsx
(res: Result<T>) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

#### 返回值

| 参数 | 说明 |
| --- | --- |
| reason | 拒绝原因，一般是一个 Error 对象 |
| promise | 被拒绝的 Promise 对象 |

### Taro.onThemeChange(callback)

监听系统主题改变事件。该事件与 [`App.onThemeChange`](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html#onThemeChange-Object-object) 的回调时机一致。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/onThemeChange)

#### 回调

系统主题改变事件的回调函数

```tsx
(res: Result) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

#### 返回值

| 参数 | 说明 |
| --- | --- |
| theme | 系统当前的主题，取值为`light`或`dark` |

#### ITheme

| 参数 | 说明 |
| --- | --- |
| light | 浅色主题 |
| dark | 深色主题 |

### Taro.onPageNotFound(callback)

监听小程序要打开的页面不存在事件。该事件与 [`App.onPageNotFound`](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html#onpagenotfoundobject-object) 的回调时机一致。

**注意**
- 开发者可以在回调中进行页面重定向，但必须在回调中**同步**处理，异步处理（例如 `setTimeout` 异步执行）无效。
- 若开发者没有调用 [Taro.onPageNotFound](https://docs.taro.zone/docs/apis/base/weapp/app-event/onPageNotFound) 绑定监听，也没有声明 `App.onPageNotFound`，当跳转页面不存在时，将推入微信客户端原生的页面不存在提示页面。
- 如果回调中又重定向到另一个不存在的页面，将推入微信客户端原生的页面不存在提示页面，并且不再第二次回调。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/onPageNotFound)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| isEntryPage | 是否本次启动的首个页面（例如从分享等入口进来，首个页面是开发者配置的分享页面） |
| path | 不存在页面的路径 |
| query | 打开不存在页面的 query 参数 |

#### 回调

小程序要打开的页面不存在事件的回调函数

```tsx
(res: Result) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.onError(callback)

监听小程序错误事件。如脚本错误或 API 调用报错等。该事件与 [`App.onError`](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html#onerrorstring-error) 的回调时机与参数一致。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/onError)

#### 回调

小程序错误事件的回调函数

```tsx
(error: string | ErrorEvent | Error) => void
```

| 参数 | 说明 |
| --- | --- |
| error | 错误信息，包含堆栈 |

### Taro.onAudioInterruptionEnd(callback)

监听音频中断结束事件。在收到 onAudioInterruptionBegin 事件之后，小程序内所有音频会暂停，收到此事件之后才可再次播放成功

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/onAudioInterruptionEnd)

### Taro.onAudioInterruptionBegin(callback)

监听音频因为受到系统占用而被中断开始事件。以下场景会触发此事件：闹钟、电话、FaceTime 通话、微信语音聊天、微信视频聊天。此事件触发后，小程序内所有音频会暂停。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/onAudioInterruptionBegin)

### Taro.onAppShow(callback)

监听小程序切前台事件。该事件与 [`App.onShow`](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html#onshowobject-object) 的回调参数一致。

**返回有效 referrerInfo 的场景**

| 场景值 | 场景                            | appId含义  |
| ------ | ------------------------------- | ---------- |
| 1020   | 公众号 profile 页相关小程序列表 | 来源公众号 |
| 1035   | 公众号自定义菜单                | 来源公众号 |
| 1036   | App 分享消息卡片                | 来源App    |
| 1037   | 小程序打开小程序                | 来源小程序 |
| 1038   | 从另一个小程序返回              | 来源小程序 |
| 1043   | 公众号模板消息                  | 来源公众号 |

**注意**

部分版本在无`referrerInfo`的时候会返回 `undefined`，建议使用 `options.referrerInfo && options.referrerInfo.appId` 进行判断。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/onAppShow)

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| path | 小程序切前台的路径 |
| query | 小程序切前台的 query 参数 |
| shareTicket | shareTicket，详见[获取更多转发信息](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share.html) |
| scene | 小程序切前台的[场景值](https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/scene.html) |
| referrerInfo | 来源信息。从另一个小程序、公众号或 App 进入小程序时返回。否则返回 `{}`。(参见后文注意) |
| forwardMaterials | 打开的文件信息数组，只有从聊天素材场景打开（scene为1173）才会携带该参数 |
| chatType | 从微信群聊/单聊打开小程序时，chatType 表示具体微信群聊/单聊类型 |
| apiCategory | API 类别 |

#### ResultReferrerInfo

来源信息。从另一个小程序、公众号或 App 进入小程序时返回。否则返回 `{}`。(参见后文注意)

| 参数 | 说明 |
| --- | --- |
| appId | 来源小程序、公众号或 App 的 appId |
| extraData | 来源小程序传过来的数据，scene=1037或1038时支持 |

#### ForwardMaterial

ChatType 类型合法值

| 参数 | 说明 |
| --- | --- |
| type | 文件的mimetype类型 |
| name | 文件名 |
| path | 文件路径（如果是webview则是url） |
| size | 文件大小 |

#### ChatType

ChatType 类型合法值

| 参数 | 说明 |
| --- | --- |
| 1 | 微信联系人单聊 |
| 2 | 企业微信联系人单聊 |
| 3 | 普通微信群聊 |
| 4 | 企业微信互通群聊 |

#### ApiCategory

API 类别合法值

| 参数 | 说明 |
| --- | --- |
| default | 默认类别 |
| nativeFunctionalized | 原生功能化，视频号直播商品、商品橱窗等场景打开的小程序 |
| browseOnly | 仅浏览，朋友圈快照页等场景打开的小程序 |
| embedded | 内嵌，通过打开半屏小程序能力打开的小程序 |

### Taro.onAppHide(callback)

监听小程序切后台事件。该事件与 [`App.onHide`](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html#onhide) 的回调时机一致。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/onAppHide)

### Taro.offUnhandledRejection(callback)

取消监听未处理的 Promise 拒绝事件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/offUnhandledRejection)

### Taro.offThemeChange(callback)

取消监听系统主题改变事件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/offThemeChange)

### Taro.offPageNotFound(callback)

取消监听小程序要打开的页面不存在事件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/offPageNotFound)

### Taro.offError(callback)

取消监听音频播放错误事件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/offError)

### Taro.offAudioInterruptionEnd(callback)

取消监听音频中断结束事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/offAudioInterruptionEnd)

### Taro.offAudioInterruptionBegin(callback)

取消监听音频因为受到系统占用而被中断开始事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/offAudioInterruptionBegin)

### Taro.offAppShow(callback)

取消监听小程序切前台事件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/offAppShow)

### Taro.offAppHide(callback)

取消监听小程序切后台事件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/weapp/app-event/offAppHide)

### Taro.setEnableDebug(res)

设置是否打开调试开关，此开关对正式版也能生效。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/debug/setEnableDebug)

#### 参数

| 参数 | 说明 |
| --- | --- |
| enableDebug | 是否打开调试 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### Promised

| 参数 | 说明 |
| --- | --- |
| errMsg | 调用结果 |

### Taro.getRealtimeLogManager()

获取实时日志管理器对象。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/debug/getRealtimeLogManager)

### Taro.getLogManager(res)

获取日志管理器对象。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/debug/getLogManager)

#### 参数

| 参数 | 说明 |
| --- | --- |
| level |  |

#### Level

| 参数 | 说明 |
| --- | --- |
| 0 | 表示会把 App、Page 的生命周期函数和 wx 命名空间下的函数调用写入日志 |
| 1 | 表示不会把 App、Page 的生命周期函数和 wx 命名空间下的函数调用写入日志 |

### console

向调试面板中打印日志。console 是一个全局对象，可以直接访问。在微信客户端中，向 vConsole 中输出日志。

**注意**
- 由于 vConsole 功能有限，以及不同客户端对 console 方法的支持情况有差异，建议开发者在小程序中只使用本文档中提供的方法。
- 部分内容展示的限制请参见调试

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/debug/console)

##### debug

向调试面板中打印 debug 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。 |

##### error

向调试面板中打印 error 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。 |

##### group

在调试面板中创建一个新的分组

**注意**
仅在工具中有效，在 vConsole 中为空函数实现。

```tsx
(label?: string) => void
```

| 参数 | 说明 |
| --- | --- |
| label | 分组标记 |

##### groupEnd

结束由 [console.group](#group) 创建的分组

**注意**
仅在工具中有效，在 vConsole 中为空函数实现。

```tsx
() => void
```

##### info

向调试面板中打印 info 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。 |

##### log

向调试面板中打印 log 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。 |

##### warn

向调试面板中打印 warn 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。 |

### LogManager

日志管理器实例，可以通过 Taro.getLogManager 获取。

使用说明
最多保存5M的日志内容，超过5M后，旧的日志内容会被删除。
对于小程序，用户可以通过使用 button 组件的 open-type="feedback" 来上传打印的日志。
对于小游戏，用户可以通过使用 Taro.createFeedbackButton 来创建上传打印的日志的按钮。
开发者可以通过小程序管理后台左侧菜单“反馈管理”页面查看相关打印日志。

基础库默认会把 App、Page 的生命周期函数和 wx 命名空间下的函数调用写入日志。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/debug/LogManager)

##### debug

写 debug 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。每次调用的参数的总大小不超过100Kb |

##### info

写 info 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。每次调用的参数的总大小不超过100Kb |

##### log

写 log 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。每次调用的参数的总大小不超过100Kb |

##### warn

写 warn 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。每次调用的参数的总大小不超过100Kb |

### RealtimeLogManager

实时日志管理器实例，可以通过 Taro.getRealtimeLogManager 获取。

使用说明
为帮助小程序开发者快捷地排查小程序漏洞、定位问题，我们推出了实时日志功能。从基础库2.7.1开始，开发者可通过提供的接口打印日志，日志汇聚并实时上报到小程序后台。
开发者可从小程序管理后台“开发->运维中心->实时日志”进入日志查询页面，查看开发者打印的日志信息。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/debug/RealtimeLogManager)

##### addFilterMsg

添加过滤关键字

```tsx
(msg: string) => void
```

| 参数 | 说明 |
| --- | --- |
| msg | 是 setFilterMsg 的添加接口。用于设置多个过滤关键字。 |

##### error

写 error 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。每次调用的参数的总大小不超过5Kb |

##### in

设置实时日志page参数所在的页面

```tsx
(pageInstance: any) => void
```

| 参数 | 说明 |
| --- | --- |
| pageInstance | page 实例 |

##### info

写 info 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。每次调用的参数的总大小不超过5Kb |

##### setFilterMsg

设置过滤关键字

```tsx
(msg: string) => void
```

| 参数 | 说明 |
| --- | --- |
| msg | 过滤关键字，最多不超过1Kb，可以在小程序管理后台根据设置的内容搜索得到对应的日志。 |

##### tag

获取给定标签的日志管理器实例，目前只支持在插件使用

```tsx
(tagName: string) => RealtimeTagLogManager
```

| 参数 | 说明 |
| --- | --- |
| tagName | 标签名 |

##### warn

写 warn 日志

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args | 日志内容，可以有任意多个。每次调用的参数的总大小不超过5Kb |

### RealtimeTagLogManager

给定标签的实时日志管理器实例，可以通过 给定标签的实时日志管理器实例，可以通过 [RealtimeLogManager.tag](./RealtimeLogManager#tag) 接口获取，目前只支持在插件使用。 接口获取，目前只支持在插件使用。

**使用说明**
RealtimeTagLogManager 功能和 [RealtimeLogManager](./RealtimeLogManager) 相似，但是为了让输出的实时日志更易于分析，其具有更严格的格式要求。
RealtimeTagLogManager 使用时需要传入标签，调用该实例所输出的日志均会被汇集到对应标签下，同时该实例的日志只支持 key-value 格式进行输出。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/debug/RealtimeTagLogManager)

##### addFilterMsg

添加过滤关键字

```tsx
(msg: string) => void
```

| 参数 | 说明 |
| --- | --- |
| msg | 是 setFilterMsg 的添加接口。用于设置多个过滤关键字。 |

##### error

写 error 日志

```tsx
(key: string, value: string | number | Object | any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| key | 日志的 key |
| value | 日志的 key |

##### info

写 info 日志

```tsx
(key: string, value: string | number | Object | any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| key | 日志的 key |
| value | 日志的 key |

##### setFilterMsg

设置过滤关键字

```tsx
(msg: string) => void
```

| 参数 | 说明 |
| --- | --- |
| msg | 过滤关键字，最多不超过1Kb，可以在小程序管理后台根据设置的内容搜索得到对应的日志。 |

##### warn

写 warn 日志

```tsx
(key: string, value: string | number | Object | any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| key | 日志的 key |
| value | 日志的 key |

### Taro.reportPerformance(id, value, dimensions)

小程序测速上报。使用前，需要在小程序管理后台配置。 详情参见[小程序测速](https://developers.weixin.qq.com/miniprogram/dev/framework/performanceReport/index.html)指南。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/performance/reportPerformance)

### Taro.preloadWebview(option)

预加载下个页面的 WebView

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/performance/preloadWebview)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.preloadSkylineView(option)

预加载下个页面所需要的 Skyline 运行环境

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/performance/preloadSkylineView)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.preloadAssets(option)

为视图层预加载媒体资源文件, 目前支持：font，image

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/performance/preloadAssets)

#### AssetsObjectType

| 参数 | 说明 |
| --- | --- |
| font | 字体 |
| image | 图片 |

#### AssetsObject

| 参数 | 说明 |
| --- | --- |
| type | 类型 |
| src | 资源地址 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| data |  |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getPerformance()

小程序测速上报。使用前，需要在小程序管理后台配置。 详情参见[小程序测速](https://developers.weixin.qq.com/miniprogram/dev/framework/performanceReport/index.html)指南。

**注意**
- 目前，当开启代码 [按需注入](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/lazyload.html) `时，evaluateScript` 将仅包含公有部分代码，页面和组件的代码注入的时间会包含在 `firstRender` 中（因为页面和组件的代码注入过程成为了首次渲染过程的一部分）。因此开启按需注入后，脚本耗时降低，渲染时间提高属于正常现象，优化效果可以关注整体启动耗时（`appLaunch`）来评估。
- `firstPaint` 和 `firstContentfulPaint` 指标在开启 `vconsole` 的情况下，由于绘制 `vconsoel` 的面板，会导致数据提前。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/performance/getPerformance)

### EntryList

EntryList 对象

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/performance/EntryList)

##### getEntries

该方法返回当前列表中的所有性能数据

```tsx
() => PerformanceEntry[]
```

##### getEntriesByName

获取当前列表中所有名称为 [name] 且类型为 [entryType] 的性能数据

```tsx
(name: string, entryType: string) => PerformanceEntry[]
```

| 参数 | 说明 |
| --- | --- |
| name |  |
| entryType |  |

##### getEntriesByType

获取当前列表中所有类型为 [entryType] 的性能数据

```tsx
(entryType: string) => PerformanceEntry[]
```

| 参数 | 说明 |
| --- | --- |
| entryType |  |

### Performance

Performance 对象，用于获取性能数据及创建性能监听器

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/performance/Performance)

##### createObserver

创建全局性能事件监听器

```tsx
(callback: TaroGeneral.TFunc) => PerformanceObserver
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### getEntries

该方法返回当前缓冲区中的所有性能数据

```tsx
() => PerformanceEntry[]
```

##### getEntriesByName

获取当前缓冲区中所有名称为 [name] 且类型为 [entryType] 的性能数据

```tsx
(name: string, entryType: string) => PerformanceEntry[]
```

| 参数 | 说明 |
| --- | --- |
| name |  |
| entryType |  |

##### getEntriesByType

获取当前缓冲区中所有类型为 [entryType] 的性能数据

```tsx
(entryType: string) => PerformanceEntry[]
```

| 参数 | 说明 |
| --- | --- |
| entryType |  |

##### setBufferSize

设置缓冲区大小，默认缓冲 30 条性能数据

```tsx
(size: number) => void
```

| 参数 | 说明 |
| --- | --- |
| size |  |

### PerformanceEntry

单条性能数据

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/performance/PerformanceEntry)

#### 方法

| 参数 | 说明 |
| --- | --- |
| entryType | 指标类型 |
| name | 指标名称 |
| startTime | 开始时间，不同指标的具体含义会有差异 |
| duration | 耗时 ms。仅对于表示阶段的指标有效。 |
| path | 页面路径。仅 render 和 navigation 类型指标有效。 |
| navigationStart | 路由真正响应开始时间。仅 navigation 类型指标有效。 |
| navigationType | 路由详细类型，与小程序路由方法对应。仅 navigation 类型指标有效。 |
| moduleName | 分包名，主包表示为 APP。仅 evaluateScript 指标有效。 |
| fileList | 注入文件列表。仅 evaluateScript 指标有效。 |
| viewLayerReadyTime | 渲染层代码注入完成时间。仅 firstRender 指标有效。 |
| initDataSendTime | 首次渲染参数从逻辑层发出的时间。仅 firstRender 指标有效。 |
| initDataRecvTime | 首次渲染参数在渲染层收到的时间。仅 firstRender 指标有效。 |
| viewLayerRenderStartTime | 渲染层执行渲染开始时间。仅 firstRender 指标有效。 |
| viewLayerRenderEndTime | 渲染层执行渲染结束时间。仅 firstRender 指标有效。 |

##### EntryType

entryType 的合法值

| 参数 | 说明 |
| --- | --- |
| navigation | 路由 |
| render | 渲染 |
| script | 脚本 |

##### EntryName

name 的合法值

| 参数 | 说明 |
| --- | --- |
| appLaunch | 小程序启动耗时。起点为用户点击小程序图标，或小程序被拉起的时间；终点为首页 onReady。(entryType: navigation) |
| route | 路由处理耗时。(entryType: navigation) |
| firstRender | 页面首次渲染耗时。起点为逻辑层收到路由事件，包括逻辑层页面与组件初始化、VD 同步、渲染层执行渲染的时间；终点为首页 onReady。(entryType: render) |
| firstPaint | [页面首次绘制](https://developer.mozilla.org/en-US/docs/Glossary/First_paint)。第一个像素渲染到屏幕上所用的时间。(entryType: render) |
| firstContentfulPaint | [页面首次内容绘制](https://developer.mozilla.org/en-US/docs/Glossary/First_contentful_paint)。第一块内容渲染到屏幕上所用的时间。(entryType: render) |
| evaluateScript | 逻辑层 JS 代码注入耗时。(entryType: script) |

### PerformanceObserver

PerformanceObserver 对象，用于监听性能相关事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/performance/PerformanceObserver)

#### 方法

| 参数 | 说明 |
| --- | --- |
| supportedEntryTypes | 获取当前支持的所有性能指标类型 |

##### disconnect

停止监听

```tsx
() => void
```

##### observe

开始监听

```tsx
(option: Option) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| type | 指标类型。不能和 entryTypes 同时使用 |
| entryTypes | 指标类型列表。不能和 type 同时使用。 |

###### EntryType

| 参数 | 说明 |
| --- | --- |
| navigation | 路由 |
| render | 渲染 |
| script | 脚本 |

### Taro.getUserCryptoManager()

获取用户加密模块

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/crypto/getUserCryptoManager)

### UserCryptoManager

用户加密模块

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/crypto/UserCryptoManager)

##### getLatestUserKey

获取最新的用户加密密钥

```tsx
(option: Option) => Promise<SuccessCallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getRandomValues

获取密码学安全随机数

```tsx
(option: Option) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| encryptKey | 用户加密密钥 |
| iv | 密钥初始向量 |
| version | 密钥版本 |
| expireTime | 密钥过期时间 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| length | 整数，生成随机数的字节数，最大 1048576 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| randomValues | 随机数内容，长度为传入的字节数 |

### Taro.getRandomValues(option)

获取密码学安全随机数

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/crypto/getRandomValues)

### env

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/env/env)

### Taro.preload(options)

跳转预加载 API

[查看 Taro 文档](https://docs.taro.zone/docs/apis/base/preload)

## 路由

### Taro.switchTab(option)

跳转到 tabBar 页面，并关闭其他所有非 tabBar 页面

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/route/switchTab)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 需要跳转的 tabBar 页面的路径（需在 app.json 的 [tabBar](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html#tabbar) 字段定义的页面），路径后不能带参数。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.reLaunch(option)

关闭所有页面，打开到应用内的某个页面

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/route/reLaunch)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 需要跳转的应用内页面路径，路径后可以带参数。参数与路径之间使用?分隔，参数键与参数值用=相连，不同参数用&分隔；如 'path?key=value&key2=value2' |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.redirectTo(option)

关闭当前页面，跳转到应用内的某个页面。但是不允许跳转到 tabbar 页面。

> Web: 未针对 tabbar 页面做限制处理

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/route/redirectTo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 需要跳转的应用内非 tabBar 的页面的路径, 路径后可以带参数。参数与路径之间使用 `?` 分隔，参数键与参数值用 `=` 相连，不同参数用 `&` 分隔；如 'path?key=value&key2=value2' |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.navigateTo(option)

保留当前页面，跳转到应用内的某个页面。但是不能跳到 tabbar 页面。使用 Taro.navigateBack 可以返回到原页面。小程序中页面栈最多十层。

> Web: 未针对 tabbar 页面做限制处理

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/route/navigateTo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 需要跳转的应用内非 tabBar 的页面的路径, 路径后可以带参数。参数与路径之间使用 `?` 分隔，参数键与参数值用 `=` 相连，不同参数用 `&` 分隔；如 'path?key=value&key2=value2' |
| events | 页面间通信接口，用于监听被打开页面发送到当前页面的数据。 |
| routeType | 2.29.2 自定义路由类型 |
| routeConfig | 3.4.0 自定义路由配置 |
| routeOptions | 3.4.0 自定义路由参数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.navigateBack(option)

关闭当前页面，返回上一页面或多级页面。可通过 getCurrentPages 获取当前的页面栈，决定需要返回几层。

> Web: 若入参 delta 大于现有页面数时，返回应用打开的第一个页面（如果想要返回首页请使用 reLaunch 方法）。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/route/navigateBack)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| delta | 返回的页面数，如果 delta 大于现有页面数，则返回到首页。 |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### EventChannel

页面间事件通信通道

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/route/EventChannel)

##### emit

触发一个事件

```tsx
(eventName: string, ...args: any) => void
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名称 |
| args | 事件参数 |

##### on

持续监听一个事件

```tsx
(eventName: string, fn: TaroGeneral.EventCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名称 |
| fn | 事件监听函数 |

##### once

监听一个事件一次，触发后失效

```tsx
(eventName: string, fn: TaroGeneral.EventCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名称 |
| fn | 事件监听函数 |

##### off

取消监听一个事件。给出第二个参数时，只取消给出的监听函数，否则取消所有监听函数

```tsx
(eventName: string, fn: TaroGeneral.EventCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名称 |
| fn | 事件监听函数 |

### router

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/route/router)

#### CustomRouteBuilder

```tsx
(routeContext: CustomRouteContext,routeOptions: Record<string, any>) => CustomRouteConfig
```

| 参数 | 说明 |
| --- | --- |
| routeContext |  |
| routeOptions |  |

#### SharedValue

| 参数 | 说明 |
| --- | --- |
| value |  |

#### CustomRouteContext

| 参数 | 说明 |
| --- | --- |
| primaryAnimation |  |
| primaryAnimationStatus |  |
| secondaryAnimation |  |
| secondaryAnimationStatus |  |
| userGestureInProgress |  |
| startUserGesture |  |
| stopUserGesture |  |
| didPop |  |

#### CustomRouteConfig

| 参数 | 说明 |
| --- | --- |
| opaque |  |
| maintainState |  |
| transitionDuration |  |
| reverseTransitionDuration |  |
| barrierColor |  |
| barrierDismissible |  |
| barrierLabel |  |
| canTransitionTo |  |
| canTransitionFrom |  |
| handlePrimaryAnimation |  |
| handleSecondaryAnimation |  |
| handlePreviousPageAnimation |  |
| allowEnterRouteSnapshotting |  |
| allowExitRouteSnapshotting |  |
| fullscreenDrag |  |
| popGestureDirection |  |

#### RouteAnimationHandler

```tsx
() => { [key: string]: any; }
```

#### router

自定义路由

##### addRouteBuilder

添加自定义路由配置

```tsx
(routeType: string, routeBuilder: CustomRouteBuilder) => void
```

| 参数 | 说明 |
| --- | --- |
| routeType | 路由类型 |
| routeBuilder | 路由动画定义函数 |

##### getRouteContext

获取页面对应的自定义路由上下文对象

```tsx
(instance: TaroGeneral.IAnyObject) => CustomRouteContext
```

| 参数 | 说明 |
| --- | --- |
| instance | 页面/自定义组件实例 |

##### removeRouteBuilder

移除自定义路由配置

```tsx
(routeType: string) => void
```

| 参数 | 说明 |
| --- | --- |
| routeType | 路由类型 |

## 跳转

### Taro.openBusinessView(option)

商户通过调用订单详情接口打开微信支付分小程序，引导用户查看订单详情（小程序端）

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/navigate/openBusinessView)

#### ScoreEnableExtraData

wxpayScoreEnable 业务参数

| 参数 | 说明 |
| --- | --- |
| apply_permissions_token | 用于跳转到微信侧小程序授权数据,跳转到微信侧小程序传入，有效期为1小时；apply_permissions_token可以从[《商户预授权API》](https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter6_1_2.shtml)接口的返回参数中获取。<br />示例值：1230000109 |

#### ScoreUsedExtraData

wxpayScoreUse 业务参数

| 参数 | 说明 |
| --- | --- |
| mch_id | 商户号：微信支付分配的商户号。<br />示例值：1230000109 |
| package | 可在【创建订单】接口的返回字段package中获取。<br />示例值：XXXXXXXX |
| timestamp | 时间戳：生成签名时间戳，单位秒。<br />示例值：1530097563 |
| nonce_str | 随机字符串：生成签名随机串。由数字、大小写字母组成，长度不超过32位。<br />示例值：zyx53Nkey8o4bHpxTQvd8m7e92nG5mG2 |
| sign_type | 签名方式：签名类型，仅支持HMAC-SHA256。<br />示例值：HMAC-SHA256 |
| sign | 签名：使用字段mch_id、service_id、out_order_no、timestamp、nonce_str、sign_type按照签名生成算法计算得出的签名值。<br />示例值：029B52F67573D7E3BE74904BF9AEA |

#### ScoreDetailExtraData

wxpayScoreDetail 业务参数

| 参数 | 说明 |
| --- | --- |
| mch_id | 商户号：微信支付分配的商户号。<br />示例值：1230000109 |
| service_id | 服务ID<br />示例值：88888888000011 |
| out_order_no | 商户服务订单号：商户系统内部服务订单号（不是交易单号）。<br />示例值：234323JKHDFE1243252 |
| timestamp | 时间戳：生成签名时间戳，单位秒。<br />示例值：1530097563 |
| nonce_str | 随机字符串：生成签名随机串。由数字、大小写字母组成，长度不超过32位。<br />示例值：zyx53Nkey8o4bHpxTQvd8m7e92nG5mG2 |
| sign_type | 签名方式：签名类型，仅支持HMAC-SHA256。<br />示例值：HMAC-SHA256 |
| sign | 签名：使用字段mch_id、service_id、out_order_no、timestamp、nonce_str、sign_type按照签名生成算法计算得出的签名值。<br />示例值：029B52F67573D7E3BE74904BF9AEA |

#### 参数

| 参数 | 说明 |
| --- | --- |
| businessType | 跳转类型：固定配置：wxpayScoreDetail<br />示例值：wxpayScoreDetail<br />memberof: Option |
| extraData | 业务参数：需要传递给支付分的业务数据 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

### Taro.openEmbeddedMiniProgram(option)

打开半屏小程序。接入指引请参考 [半屏小程序能力](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/openEmbeddedMiniProgram.html)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/navigate/openEmbeddedMiniProgram)

#### 参数

| 参数 | 说明 |
| --- | --- |
| appId | 要打开的小程序 appId |
| path | 打开的页面路径，如果为空则打开首页。path 中 ? 后面的部分会成为 query，在小程序的 `App.onLaunch`、`App.onShow` 和 `Page.onLoad` 的回调函数或小游戏的 [Taro.onShow](#) 回调函数、[Taro.getLaunchOptionsSync](https://docs.taro.zone/docs/apis/base/weapp/life-cycle/getLaunchOptionsSync) 中可以获取到 query 数据。对于小游戏，可以只传入 query 部分，来实现传参效果，如：传入 "?foo=bar"。 |
| extraData | 需要传递给目标小程序的数据，目标小程序可在 `App.onLaunch`，`App.onShow` 中获取到这份数据。如果跳转的是小游戏，可以在 [Taro.onShow](#)、[Taro.getLaunchOptionsSync](https://docs.taro.zone/docs/apis/base/weapp/life-cycle/getLaunchOptionsSync) 中可以获取到这份数据数据。 |
| envVersion | 要打开的小程序版本。仅在当前小程序为开发版或体验版时此参数有效。如果当前小程序是正式版，则打开的小程序必定是正式版。 |
| shortLink | 小程序链接，当传递该参数后，可以不传 appId 和 path。链接可以通过【小程序菜单】->【复制链接】获取。 |
| verify | 校验方式 。默认为binding |
| noRelaunchIfPathUnchanged | 不 reLaunch 目标小程序，直接打开目标跳转的小程序退后台时的页面，需满足以下条件：1. 目标跳转的小程序生命周期未被销毁；2. 且目标当次启动的path、query、apiCategory与上次启动相同。默认值为 false 。 |
| allowFullScreen | 打开的小程序是否支持全屏 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### Verify

| 参数 | 说明 |
| --- | --- |
| binding | 校验小程序管理后台的绑定关系 |
| unionProduct | 校验目标打开链接是否为小程序联盟商品。 |

#### EnvVersion

| 参数 | 说明 |
| --- | --- |
| develop | 开发版 |
| trial | 体验版 |
| release | 正式版 |

### Taro.navigateToMiniProgram(option)

打开另一个小程序

**使用限制**

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/navigate/navigateToMiniProgram)

###### 需要用户触发跳转
从 2.3.0 版本开始，若用户未点击小程序页面任意位置，则开发者将无法调用此接口自动跳转至其他小程序。
###### 需要用户确认跳转
从 2.3.0 版本开始，在跳转至其他小程序前，将统一增加弹窗，询问是否跳转，用户确认后才可以跳转其他小程序。如果用户点击取消，则回调 `fail cancel`。
###### 每个小程序可跳转的其他小程序数量限制为不超过 10 个
从 2.4.0 版本以及指定日期（具体待定）开始，开发者提交新版小程序代码时，如使用了跳转其他小程序功能，则需要在代码配置中声明将要跳转的小程序名单，限定不超过 10 个，否则将无法通过审核。该名单可在发布新版时更新，不支持动态修改。配置方法详见 [小程序全局配置](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html)。调用此接口时，所跳转的 appId 必须在配置列表中，否则回调 `fail appId "${appId}" is not in navigateToMiniProgramAppIdList`。

**关于调试**
- 在开发者工具上调用此 API 并不会真实的跳转到另外的小程序，但是开发者工具会校验本次调用跳转是否成功。[详情](https://developers.weixin.qq.com/miniprogram/dev/devtools/different.html#跳转小程序调试支持)
- 开发者工具上支持被跳转的小程序处理接收参数的调试。[详情](https://developers.weixin.qq.com/miniprogram/dev/devtools/different.html#跳转小程序调试支持)

#### 参数

| 参数 | 说明 |
| --- | --- |
| appId | 要打开的小程序 appId |
| path | 打开的页面路径，如果为空则打开首页。path 中 ? 后面的部分会成为 query，在小程序的 `App.onLaunch`、`App.onShow` 和 `Page.onLoad` 的回调函数或小游戏的 [Taro.onShow](#) 回调函数、[Taro.getLaunchOptionsSync](https://docs.taro.zone/docs/apis/base/weapp/life-cycle/getLaunchOptionsSync) 中可以获取到 query 数据。对于小游戏，可以只传入 query 部分，来实现传参效果，如：传入 "?foo=bar"。 |
| extraData | 需要传递给目标小程序的数据，目标小程序可在 `App.onLaunch`，`App.onShow` 中获取到这份数据。如果跳转的是小游戏，可以在 [Taro.onShow](#)、[Taro.getLaunchOptionsSync](https://docs.taro.zone/docs/apis/base/weapp/life-cycle/getLaunchOptionsSync) 中可以获取到这份数据数据。 |
| envVersion | 要打开的小程序版本。仅在当前小程序为开发版或体验版时此参数有效。如果当前小程序是正式版，则打开的小程序必定是正式版。 |
| shortLink | 小程序链接，当传递该参数后，可以不传 appId 和 path。链接可以通过【小程序菜单】->【复制链接】获取。 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### EnvVersion

| 参数 | 说明 |
| --- | --- |
| develop | 开发版 |
| trial | 体验版 |
| release | 正式版 |

### Taro.navigateBackMiniProgram(option)

返回到上一个小程序。只有在当前小程序是被其他小程序打开时可以调用成功

注意：**微信客户端 iOS 6.5.9，Android 6.5.10 及以上版本支持**

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/navigate/navigateBackMiniProgram)

#### 参数

| 参数 | 说明 |
| --- | --- |
| extraData | 需要返回给上一个小程序的数据，上一个小程序可在 `App.onShow` 中获取到这份数据。 [详情](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html)。 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

### Taro.exitMiniProgram(option)

退出当前小程序。必须有点击行为才能调用成功。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/navigate/exitMiniProgram)

#### 参数

| 参数 | 说明 |
| --- | --- |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

## 转发

### Taro.updateShareMenu(option)

更新转发属性

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/share/updateShareMenu)

#### 参数

| 参数 | 说明 |
| --- | --- |
| activityId | 动态消息的 activityId。通过 [updatableMessage.createActivityId](https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/updatable-message/updatableMessage.createActivityId.html) 接口获取 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| isUpdatableMessage | 是否是动态消息，详见[动态消息](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share/updatable-message.html) |
| success | 接口调用成功的回调函数 |
| templateInfo | 动态消息的模板信息 |
| withShareTicket | 是否使用带 shareTicket 的转发[详情](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share.html) |

#### UpdatableMessageFrontEndTemplateInfo

动态消息的模板信息

| 参数 | 说明 |
| --- | --- |
| parameterList | 参数列表 |

#### UpdatableMessageFrontEndParameter

参数列表

| 参数 | 说明 |
| --- | --- |
| name | 参数名 |
| value | 参数值 |

### Taro.showShareMenu(option)

显示当前页面的转发按钮

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/share/showShareMenu)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |
| withShareTicket | 是否使用带 shareTicket 的转发[详情](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share.html) |
| showShareItems | QQ小程序分享功能，支持分享到QQ、QQ空间、微信好友、微信朋友圈<br />微信： 微信支持：['wechatFriends', 'wechatMoment'] / ['shareAppMessage', 'shareTimeline'] |

### Taro.showShareImageMenu(option)

打开分享图片弹窗，可以将图片发送给朋友、收藏或下载

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/share/showShareImageMenu)

#### 参数

| 参数 | 说明 |
| --- | --- |
| path | 要分享的图片地址，必须为本地路径或临时路径 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

### Taro.shareVideoMessage(option)

转发视频到聊天

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/share/shareVideoMessage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| videoPath | 要分享的视频地址，必须为本地路径或临时路径 |
| thumbPath | 缩略图路径，若留空则使用视频首帧 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

### Taro.shareFileMessage(option)

转发文件到聊天

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/share/shareFileMessage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 要分享的视频地址，必须为本地路径或临时路径 |
| fileName | 自定义文件名，若留空则使用 filePath 中的文件名 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

### Taro.onCopyUrl(callback)

监听用户点击右上角菜单的「复制链接」按钮时触发的事件

> 本接口为 Beta 版本，暂只在 Android 平台支持。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/share/onCopyUrl)

#### 回调

用户点击右上角菜单的「复制链接」按钮时触发的事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| query | 用短链打开小程序时当前页面携带的查询字符串。小程序中使用时，应在进入页面时调用 `Taro.onCopyUrl` 自定义 `query`，退出页面时调用 `Taro.offCopyUrl`，防止影响其它页面。 |

### Taro.offCopyUrl(callback)

取消监听用户点击右上角菜单的「复制链接」按钮时触发的事件

> 本接口为 Beta 版本，暂只在 Android 平台支持。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/share/offCopyUrl)

### Taro.hideShareMenu(option)

隐藏当前页面的转发按钮

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/share/hideShareMenu)

#### 参数

| 参数 | 说明 |
| --- | --- |
| menus | 本接口为 Beta 版本，暂只在 Android 平台支持。需要隐藏的转发按钮名称列表，默认['shareAppMessage', 'shareTimeline']。按钮名称合法值包含 "shareAppMessage"、"shareTimeline" 两种 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

### Taro.getShareInfo(option)

获取转发详细信息

**Tips**
- 如需要展示群名称，可以使用[开放数据组件](https://docs.taro.zone/docs/components/open/open-data)

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/share/getShareInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| shareTicket | shareTicket |
| timeout | 超时时间，单位 ms |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| cloudID | 敏感数据对应的云 ID，开通[云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)的小程序才会返回，可通过云调用直接获取开放数据，详细见[云调用直接获取开放数据](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#method-cloud) |
| encryptedData | 包括敏感数据在内的完整转发信息的加密数据，详细见[加密数据解密算法](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html) |
| errMsg | 错误信息 |
| iv | 加密算法的初始向量，详细见[加密数据解密算法](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html) |

### Taro.authPrivateMessage(option)

验证私密消息

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/share/authPrivateMessage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| shareTicket | shareTicket |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| cloudID | 敏感数据对应的云 ID，开通[云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)的小程序才会返回，可通过云调用直接获取开放数据，详细见[云调用直接获取开放数据](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#method-cloud) |
| encryptedData | 包括敏感数据在内的完整转发信息的加密数据，详细见[加密数据解密算法](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html) |
| errMsg | 错误信息 |
| iv | 加密算法的初始向量，详细见[加密数据解密算法](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html) |

## 界面

### Taro.showToast(option)

显示消息提示框

**注意**
- Taro.showLoading 和 Taro.showToast 同时只能显示一个
- Taro.showToast 应与 Taro.hideToast 配对使用

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/interaction/showToast)

#### 参数

| 参数 | 说明 |
| --- | --- |
| title | 提示的内容 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| duration | 提示的延迟时间 |
| fail | 接口调用失败的回调函数 |
| icon | 图标<br />可选值：<br />- 'success': 显示成功图标，此时 title 文本最多显示 7 个汉字长度;<br />- 'error': 显示失败图标，此时 title 文本最多显示 7 个汉字长度;<br />- 'loading': 显示加载图标，此时 title 文本最多显示 7 个汉字长度;<br />- 'none': 不显示图标，此时 title 文本最多可显示两行 |
| image | 自定义图标的本地路径，image 的优先级高于 icon |
| mask | 是否显示透明蒙层，防止触摸穿透 |
| success | 接口调用成功的回调函数 |

### Taro.showModal(option)

显示模态对话框
**注意**
- Android 6.7.2 以下版本，点击取消或蒙层时，回调 fail, errMsg 为 "fail cancel"；
- Android 6.7.2 及以上版本 和 iOS 点击蒙层不会关闭模态弹窗，所以尽量避免使用「取消」分支中实现业务逻辑

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/interaction/showModal)

#### 参数

| 参数 | 说明 |
| --- | --- |
| cancelColor | 取消按钮的文字颜色，必须是 16 进制格式的颜色字符串 |
| cancelText | 取消按钮的文字，最多 4 个字符 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| confirmColor | 确认按钮的文字颜色，必须是 16 进制格式的颜色字符串 |
| confirmText | 确认按钮的文字，最多 4 个字符 |
| content | 提示的内容 |
| fail | 接口调用失败的回调函数 |
| showCancel | 是否显示取消按钮 |
| success | 接口调用成功的回调函数 |
| title | 提示的标题 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| cancel | 为 true 时，表示用户点击了取消（用于 Android 系统区分点击蒙层关闭还是点击取消按钮关闭） |
| confirm | 为 true 时，表示用户点击了确定按钮 |
| errMsg | 调用结果 |

### Taro.showLoading(option)

显示 loading 提示框。需主动调用 Taro.hideLoading 才能关闭提示框

**注意**
- Taro.showLoading 和 Taro.showToast 同时只能显示一个
- Taro.showLoading 应与 Taro.hideLoading 配对使用

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/interaction/showLoading)

#### 参数

| 参数 | 说明 |
| --- | --- |
| title | 提示的内容 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| mask | 是否显示透明蒙层，防止触摸穿透 |
| success | 接口调用成功的回调函数 |

### Taro.showActionSheet(option)

显示操作菜单

**注意**
- Android 6.7.2 以下版本，点击取消或蒙层时，回调 fail, errMsg 为 "fail cancel"；
- Android 6.7.2 及以上版本 和 iOS 点击蒙层不会关闭模态弹窗，所以尽量避免使用「取消」分支中实现业务逻辑

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/interaction/showActionSheet)

#### 参数

| 参数 | 说明 |
| --- | --- |
| alertText | 警示文案 |
| itemList | 按钮的文字数组，数组长度最大为 6 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| itemColor | 按钮的文字颜色 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tapIndex | 用户点击的按钮序号，从上到下的顺序，从0开始 |
| errMsg | 调用结果 |

### Taro.hideToast(option)

隐藏消息提示框

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/interaction/hideToast)

#### 参数

| 参数 | 说明 |
| --- | --- |
| noConflict | 目前 toast 和 loading 相关接口可以相互混用，此参数可用于取消混用特性 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.hideLoading(option)

隐藏 loading 提示框

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/interaction/hideLoading)

#### 参数

| 参数 | 说明 |
| --- | --- |
| noConflict | 目前 toast 和 loading 相关接口可以相互混用，此参数可用于取消混用特性 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.enableAlertBeforeUnload(option)

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/interaction/enableAlertBeforeUnload)

#### 参数

| 参数 | 说明 |
| --- | --- |
| message | 询问对话框内容 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.disableAlertBeforeUnload(option)

关闭小程序页面返回询问对话框

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/interaction/disableAlertBeforeUnload)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.showNavigationBarLoading(option)

在当前页面显示导航条加载动画

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/navigation-bar/showNavigationBarLoading)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setNavigationBarTitle(option)

动态设置当前页面的标题

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/navigation-bar/setNavigationBarTitle)

#### 参数

| 参数 | 说明 |
| --- | --- |
| title | 页面标题 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setNavigationBarColor(option)

设置页面导航条颜色

> Web: 不支持 animation 参数
>

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/navigation-bar/setNavigationBarColor)

#### 参数

| 参数 | 说明 |
| --- | --- |
| backgroundColor | 背景颜色值，有效值为十六进制颜色 |
| frontColor | 前景颜色值，包括按钮、标题、状态栏的颜色，仅支持 #ffffff 和 #000000 |
| animation | 动画效果 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### AnimationOption

动画效果

| 参数 | 说明 |
| --- | --- |
| duration | 动画变化时间，单位 ms |
| timingFunc | 动画变化方式<br />可选值：<br />- 'linear': 动画从头到尾的速度是相同的;<br />- 'easeIn': 动画以低速开始;<br />- 'easeOut': 动画以低速结束;<br />- 'easeInOut': 动画以低速开始和结束; |

### Taro.hideNavigationBarLoading(option)

在当前页面隐藏导航条加载动画

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/navigation-bar/hideNavigationBarLoading)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.hideHomeButton(option)

隐藏返回首页按钮。微信7.0.7版本起，当用户打开的小程序最底层页面是非首页时，默认展示“返回首页”按钮，开发者可在页面 onShow 中调用 hideHomeButton 进行隐藏。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/navigation-bar/hideHomeButton)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setBackgroundTextStyle(option)

动态设置下拉背景字体、loading 图的样式

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/background/setBackgroundTextStyle)

#### 参数

| 参数 | 说明 |
| --- | --- |
| textStyle | 下拉背景字体、loading 图的样式。<br />可选值：<br />- 'dark': dark 样式;<br />- 'light': light 样式; |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setBackgroundColor(option)

动态设置窗口的背景色

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/background/setBackgroundColor)

#### 参数

| 参数 | 说明 |
| --- | --- |
| backgroundColor | 窗口的背景色，必须为十六进制颜色值 |
| backgroundColorBottom | 底部窗口的背景色，必须为十六进制颜色值，仅 iOS 支持 |
| backgroundColorTop | 顶部窗口的背景色，必须为十六进制颜色值，仅 iOS 支持 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.showTabBarRedDot(option)

显示 tabBar 某一项的右上角的红点

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/tab-bar/showTabBarRedDot)

#### 参数

| 参数 | 说明 |
| --- | --- |
| index | tabBar 的哪一项，从左边算起 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.showTabBar(option)

显示 tabBar

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/tab-bar/showTabBar)

#### 参数

| 参数 | 说明 |
| --- | --- |
| animation | 是否需要动画效果 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setTabBarStyle(option)

动态设置 tabBar 的整体样式

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/tab-bar/setTabBarStyle)

#### 参数

| 参数 | 说明 |
| --- | --- |
| backgroundColor | tab 的背景色，HexColor |
| borderStyle | tabBar上边框的颜色， 仅支持 black/white |
| color | tab 上的文字默认颜色，HexColor |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| selectedColor | tab 上的文字选中时的颜色，HexColor |
| success | 接口调用成功的回调函数 |

### Taro.setTabBarItem(option)

动态设置 tabBar 某一项的内容，`2.7.0` 起图片支持临时文件和网络文件。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/tab-bar/setTabBarItem)

#### 参数

| 参数 | 说明 |
| --- | --- |
| index | tabBar 的哪一项，从左边算起 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| iconPath | 图片路径，icon 大小限制为 40kb，建议尺寸为 81px * 81px，当 postion 为 top 时，此参数无效 |
| selectedIconPath | 选中时的图片路径，icon 大小限制为 40kb，建议尺寸为 81px * 81px ，当 postion 为 top 时，此参数无效 |
| success | 接口调用成功的回调函数 |
| text | tab 上的按钮文字 |

### Taro.setTabBarBadge(option)

为 tabBar 某一项的右上角添加文本

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/tab-bar/setTabBarBadge)

#### 参数

| 参数 | 说明 |
| --- | --- |
| index | tabBar 的哪一项，从左边算起 |
| text | 显示的文本，超过 4 个字符则显示成 ... |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.removeTabBarBadge(option)

移除 tabBar 某一项右上角的文本

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/tab-bar/removeTabBarBadge)

#### 参数

| 参数 | 说明 |
| --- | --- |
| index | tabBar 的哪一项，从左边算起 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.hideTabBarRedDot(option)

隐藏 tabBar 某一项的右上角的红点

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/tab-bar/hideTabBarRedDot)

#### 参数

| 参数 | 说明 |
| --- | --- |
| index | tabBar 的哪一项，从左边算起 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.hideTabBar(option)

隐藏 tabBar

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/tab-bar/hideTabBar)

#### 参数

| 参数 | 说明 |
| --- | --- |
| animation | 是否需要动画效果 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.loadFontFace(option)

动态加载网络字体。文件地址需为下载类型。iOS 仅支持 https 格式文件地址。

注意：
1. 字体文件返回的 context-type 参考 [font](https://www.iana.org/assignments/media-types/media-types.xhtml#font)，格式不正确时会解析失败。
2. 字体链接必须是https（ios不支持http)
3. 字体链接必须是同源下的，或开启了cors支持，小程序的域名是`servicewechat.com`
4. canvas等原生组件不支持使用接口添加的字体
5. 工具里提示 Failed to load font 可以忽略

>
> Web: 不支持 global (默认全局加载)

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/fonts/loadFontFace)

#### 参数

| 参数 | 说明 |
| --- | --- |
| global | 是否全局生效 |
| family | 定义的字体名称 |
| source | 字体资源的地址。建议格式为 TTF 和 WOFF，WOFF2 在低版本的 iOS 上会不兼容。 |
| desc | 可选的字体描述符 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| status | 加载字体结果 |

#### DescOption

可选的字体描述符

| 参数 | 说明 |
| --- | --- |
| ascentOverride | Web |
| descentOverride | Web |
| featureSettings | Web |
| lineGapOverride | Web |
| stretch | Web |
| style | 字体样式，可选值为 normal / italic / oblique |
| unicodeRange | Web |
| variant | 设置小型大写字母的字体显示文本，可选值为 normal / small-caps / inherit |
| variationSettings | Web |
| weight | 字体粗细，可选值为 normal / bold / 100 / 200../ 900 |

### Taro.stopPullDownRefresh(option)

停止当前页面下拉刷新。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/pull-down-refresh/stopPullDownRefresh)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startPullDownRefresh(option)

开始下拉刷新。调用后触发下拉刷新动画，效果与用户手动下拉刷新一致。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/pull-down-refresh/startPullDownRefresh)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.pageScrollTo(option)

将页面滚动到目标位置，支持选择器和滚动距离两种方式定位

**selector 语法**
selector类似于 CSS 的选择器，但仅支持下列语法。

- ID选择器：#the-id
- class选择器（可以连续指定多个）：.a-class.another-class
- 子元素选择器：.the-parent > .the-child
- 后代选择器：.the-ancestor .the-descendant
- 跨自定义组件的后代选择器：.the-ancestor >>> .the-descendant
- 多选择器的并集：#a-node, .some-other-nodes

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/scroll/pageScrollTo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| duration | 滚动动画的时长，单位 ms |
| fail | 接口调用失败的回调函数 |
| scrollTop | 滚动到页面的目标位置，单位 px |
| selector | 选择器, css selector |
| offsetTop | 偏移距离，需要和 selector 参数搭配使用，可以滚动到 selector 加偏移距离的位置，单位 px |
| success | 接口调用成功的回调函数 |

### ScrollViewContext

增强 ScrollView 实例，可通过 [Taro.createSelectorQuery](https://docs.taro.zone/docs/apis/wxml/createSelectorQuery) 的 [NodesRef.node](https://docs.taro.zone/docs/apis/wxml/NodesRef#node) 方法获取。 仅在 `scroll-view` 组件开启 `enhanced` 属性后生效。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/scroll/ScrollViewContext)

#### 方法

| 参数 | 说明 |
| --- | --- |
| scrollEnabled | 滚动开关 |
| bounces | 设置滚动边界弹性 (仅在 iOS 下生效) |
| showScrollbar | 设置是否显示滚动条 |
| pagingEnabled | 分页滑动开关 |
| fastDeceleration | 设置滚动减速速率 |
| decelerationDisabled | 取消滚动惯性 (仅在 iOS 下生效) |

##### scrollTo

滚动至指定位置

> Web: 不支持 velocity 参数

```tsx
(object: Option) => void
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### scrollIntoView

滚动至指定位置

```tsx
(selector: string) => void
```

| 参数 | 说明 |
| --- | --- |
| selector | 元素选择器 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| top | 顶部距离 |
| left | 左边界距离 |
| velocity | 初始速度 |
| duration | 滚动动画时长 |
| animated | 是否启用滚动动画 |

### Taro.createAnimation(option)

创建一个动画实例 [animation](../Animation)。调用实例的方法来描述动画。最后通过动画实例的 export 方法导出动画数据传递给组件的 animation 属性。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/animation/createAnimation)

#### 参数

| 参数 | 说明 |
| --- | --- |
| duration | 动画持续时间，单位 ms |
| timingFunction | 动画的效果 |
| delay | 动画延迟时间，单位 ms |
| transformOrigin |  |
| unit | 单位<br />Web |

#### TimingFunction

| 参数 | 说明 |
| --- | --- |
| linear | 动画从头到尾的速度是相同的 |
| ease | 动画以低速开始，然后加快，在结束前变慢 |
| ease-in | 动画以低速开始 |
| ease-in-out | 动画以低速开始和结束 |
| ease-out | 动画以低速结束 |
| step-start | 动画第一帧就跳至结束状态直到结束 |
| step-end | 动画一直保持开始状态，最后一帧跳到结束状态 |

### Animation

动画对象

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/animation/Animation)

##### export

导出动画队列。**export 方法每次调用后会清掉之前的动画操作**。

```tsx
() => { actions: TaroGeneral.IAnyObject[]; }
```

##### step

表示一组动画完成。可以在一组动画中调用任意多个动画方法，一组动画中的所有动画会同时开始，一组动画完成后才会进行下一组动画。

```tsx
(option?: StepOption) => Animation
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### matrix

同 [transform-function matrix](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/matrix)

```tsx
(a: number, b: number, c: number, d: number, tx: number, ty: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| a |  |
| b |  |
| c |  |
| d |  |
| tx |  |
| ty |  |

##### matrix3d

同 [transform-function matrix3d](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/matrix3d)

```tsx
(a1: number, b1: number, c1: number, d1: number, a2: number, b2: number, c2: number, d2: number, a3: number, b3: number, c3: number, d3: number, a4: number, b4: number, c4: number, d4: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| a1 |  |
| b1 |  |
| c1 |  |
| d1 |  |
| a2 |  |
| b2 |  |
| c2 |  |
| d2 |  |
| a3 |  |
| b3 |  |
| c3 |  |
| d3 |  |
| a4 |  |
| b4 |  |
| c4 |  |
| d4 |  |

##### rotate

从原点顺时针旋转一个角度

```tsx
(angle: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| angle | 旋转的角度。范围 [-180, 180] |

##### rotate3d

从 固定 轴顺时针旋转一个角度

```tsx
(x: number, y?: number, z?: number, angle?: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| x | 旋转轴的 x 坐标 |
| y | 旋转轴的 y 坐标 |
| z | 旋转轴的 z 坐标 |
| angle | 旋转的角度。范围 [-180, 180] |

##### rotateX

从 X 轴顺时针旋转一个角度

```tsx
(angle: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| angle | 旋转的角度。范围 [-180, 180] |

##### rotateY

从 Y 轴顺时针旋转一个角度

```tsx
(angle: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| angle | 旋转的角度。范围 [-180, 180] |

##### rotateZ

从 Z 轴顺时针旋转一个角度

```tsx
(angle: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| angle | 旋转的角度。范围 [-180, 180] |

##### scale

缩放

```tsx
(sx: number, sy?: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| sx | 当仅有 sx 参数时，表示在 X 轴、Y 轴同时缩放sx倍数 |
| sy | 在 Y 轴缩放 sy 倍数 |

##### scale3d

缩放

```tsx
(sx: number, sy: number, sz: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| sx | x 轴的缩放倍数 |
| sy | y 轴的缩放倍数 |
| sz | z 轴的缩放倍数 |

##### scaleX

缩放 X 轴

```tsx
(scale: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| scale | X 轴的缩放倍数 |

##### scaleY

缩放 Y 轴

```tsx
(scale: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| scale | Y 轴的缩放倍数 |

##### scaleZ

缩放 Z 轴

```tsx
(scale: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| scale | Z 轴的缩放倍数 |

##### skew

对 X、Y 轴坐标进行倾斜

```tsx
(ax: number, ay: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| ax | 对 X 轴坐标倾斜的角度，范围 [-180, 180] |
| ay | 对 Y 轴坐标倾斜的角度，范围 [-180, 180] |

##### skewX

对 X 轴坐标进行倾斜

```tsx
(angle: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| angle | 倾斜的角度，范围 [-180, 180] |

##### skewY

对 Y 轴坐标进行倾斜

```tsx
(angle: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| angle | 倾斜的角度，范围 [-180, 180] |

##### translate

平移变换

```tsx
(tx?: number, ty?: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| tx | 当仅有该参数时表示在 X 轴偏移 tx，单位 px |
| ty | 在 Y 轴平移的距离，单位为 px |

##### translate3d

对 xyz 坐标进行平移变换

```tsx
(tx?: number, ty?: number, tz?: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| tx | 在 X 轴平移的距离，单位为 px |
| ty | 在 Y 轴平移的距离，单位为 px |
| tz | 在 Z 轴平移的距离，单位为 px |

##### translateX

对 X 轴平移

```tsx
(translation: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| translation | 在 X 轴平移的距离，单位为 px |

##### translateY

对 Y 轴平移

```tsx
(translation: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| translation | 在 Y 轴平移的距离，单位为 px |

##### translateZ

对 Z 轴平移

```tsx
(translation: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| translation | 在 Z 轴平移的距离，单位为 px |

##### opacity

设置透明度

```tsx
(value: number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| value | 透明度，范围 0-1 |

##### backgroundColor

设置背景色

```tsx
(value: string) => Animation
```

| 参数 | 说明 |
| --- | --- |
| value | 颜色值 |

##### width

设置宽度

```tsx
(value: string | number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| value | 长度值，如果传入 number 则默认使用 px，可传入其他自定义单位的长度值 |

##### height

设置高度

```tsx
(value: string | number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| value | 长度值，如果传入 number 则默认使用 px，可传入其他自定义单位的长度值 |

##### left

设置 left 值

```tsx
(value: string | number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| value | 长度值，如果传入 number 则默认使用 px，可传入其他自定义单位的长度值 |

##### right

设置 right 值

```tsx
(value: string | number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| value | 长度值，如果传入 number 则默认使用 px，可传入其他自定义单位的长度值 |

##### top

设置 top 值

```tsx
(value: string | number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| value | 长度值，如果传入 number 则默认使用 px，可传入其他自定义单位的长度值 |

##### bottom

设置 bottom 值

```tsx
(value: string | number) => Animation
```

| 参数 | 说明 |
| --- | --- |
| value | 长度值，如果传入 number 则默认使用 px，可传入其他自定义单位的长度值 |

##### StepOption

| 参数 | 说明 |
| --- | --- |
| delay | 动画延迟时间，单位 ms |
| duration | 动画持续时间，单位 ms |
| timingFunction | 动画的效果 |
| transformOrigin |  |

##### TimingFunction

| 参数 | 说明 |
| --- | --- |
| linear | 动画从头到尾的速度是相同的 |
| ease | 动画以低速开始，然后加快，在结束前变慢 |
| ease-in | 动画以低速开始 |
| ease-in-out | 动画以低速开始和结束 |
| ease-out | 动画以低速结束 |
| step-start | 动画第一帧就跳至结束状态直到结束 |
| step-end | 动画一直保持开始状态，最后一帧跳到结束状态 |

### Taro.setTopBarText(option)

动态设置置顶栏文字内容。只有当前小程序被置顶时能生效，如果当前小程序没有被置顶，也能调用成功，但是不会立即生效，只有在用户将这个小程序置顶后才换上设置的文字内容.

**注意**
- 调用成功后，需间隔 5s 才能再次调用此接口，如果在 5s 内再次调用此接口，会回调 fail，errMsg："setTopBarText: fail invoke too frequently"

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/sticky/setTopBarText)

#### 参数

| 参数 | 说明 |
| --- | --- |
| text | 置顶栏文字 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

### Taro.nextTick(callback)

延迟一部分操作到下一个时间片再执行。（类似于 setTimeout）

**说明**
因为自定义组件中的 setData 和 triggerEvent 等接口本身是同步的操作，当这几个接口被连续调用时，都是在一个同步流程中执行完的，因此若逻辑不当可能会导致出错。
一个极端的案例：当父组件的 setData 引发了子组件的 triggerEvent，进而使得父组件又进行了一次 setData，期间有通过 wx:if 语句对子组件进行卸载，就有可能引发奇怪的错误，所以对于不需要在一个同步流程内完成的逻辑，可以使用此接口延迟到下一个时间片再执行。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/custom-component/nextTick)

### Taro.getMenuButtonBoundingClientRect()

获取菜单按钮（右上角胶囊按钮）的布局位置信息。坐标信息以屏幕左上角为原点。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/menu/getMenuButtonBoundingClientRect)

#### Rect

菜单按钮的布局位置信息

| 参数 | 说明 |
| --- | --- |
| bottom | 下边界坐标，单位：px |
| height | 高度，单位：px |
| left | 左边界坐标，单位：px |
| right | 右边界坐标，单位：px |
| top | 上边界坐标，单位：px |
| width | 宽度，单位：px |

### Taro.setWindowSize(option)

设置窗口大小，该接口仅适用于 PC 平台，使用细则请参见指南

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/window/setWindowSize)

#### 参数

| 参数 | 说明 |
| --- | --- |
| width | 窗口宽度，以像素为单位 |
| height | 窗口高度，以像素为单位 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onWindowResize(callback)

监听窗口尺寸变化事件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/window/onWindowResize)

#### 回调

窗口尺寸变化事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| size |  |

#### Size

| 参数 | 说明 |
| --- | --- |
| windowHeight | 变化后的窗口高度，单位 px |
| windowWidth | 变化后的窗口宽度，单位 px |

### Taro.offWindowResize(callback)

取消监听窗口尺寸变化事件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/window/offWindowResize)

#### 回调

窗口尺寸变化事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.checkIsPictureInPictureActive()

返回当前是否存在小窗播放（小窗在 video/live-player/live-pusher 下可用）

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ui/window/checkIsPictureInPictureActive)

### worklet

worklet 对象，可以通过 wx.worklet 获取

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/skyline/worklet)

#### 方法

| 参数 | 说明 |
| --- | --- |
| scrollViewContext | ScrollView 实例，可在 worklet 函数内操作 scroll-view 组件。<br />[参考地址](https://developers.weixin.qq.com/miniprogram/dev/api/ui/worklet/base/worklet.scrollViewContext.html) |
| Easing |  |

##### cancelAnimation

取消由 SharedValue 驱动的动画

```tsx
(SharedValue: TaroGeneral.IAnyObject) => void
```

| 参数 | 说明 |
| --- | --- |
| SharedValue |  |

##### derived

衍生值 DerivedValue，可基于已有的 SharedValue 生成其它共享变量。

```tsx
(updaterWorklet: TaroGeneral.TFunc) => TaroGeneral.IAnyObject
```

| 参数 | 说明 |
| --- | --- |
| updaterWorklet |  |

##### shared

创建共享变量 SharedValue，用于跨线程共享数据和驱动动画。

```tsx
(initialValue: any) => TaroGeneral.IAnyObject
```

##### decay

基于滚动衰减的动画。

```tsx
(options?: Option, callback?: (flag: boolean) => void) => TaroGeneral.IAnyObject
```

| 参数 | 说明 |
| --- | --- |
| options | 动画配置<br />param: options 动画配置 |
| callback | 动画完成回调。动画被取消时，返回 fasle，正常完成时返回 true。<br />param: callback 动画完成回调。动画被取消时，返回 fasle，正常完成时返回 true。 |

##### spring

基于物理的动画。

```tsx
(toValue: string | number, options?: Option, callback?: (flag: boolean) => void) => TaroGeneral.IAnyObject
```

| 参数 | 说明 |
| --- | --- |
| toValue | 目标值<br />param: toValue 目标值 |
| options | 动画配置<br />param: options 动画配置 |
| callback | 动画完成回调。动画被取消时，返回 fasle，正常完成时返回 true。<br />param: callback 动画完成回调。动画被取消时，返回 fasle，正常完成时返回 true。 |

##### timing

基于时间的动画。

```tsx
(toValue: string | number, options?: Option, callback?: (flag: boolean) => void) => TaroGeneral.IAnyObject
```

| 参数 | 说明 |
| --- | --- |
| toValue | 目标值<br />param: toValue 目标值 |
| options | 动画配置<br />param: options 动画配置 |
| callback | 动画完成回调。动画被取消时，返回 fasle，正常完成时返回 true。<br />param: callback 动画完成回调。动画被取消时，返回 fasle，正常完成时返回 true。 |

##### delay

延迟执行动画。

```tsx
(delayMS: number, delayedAnimation: TaroGeneral.IAnyObject) => TaroGeneral.IAnyObject
```

| 参数 | 说明 |
| --- | --- |
| delayMS | 动画开始前等待的时间，单位：毫秒<br />param: delayMS 动画开始前等待的时间，单位：毫秒 |
| delayedAnimation | 动画对象<br />param: delayedAnimation 动画对象 |

##### repeat

重复执行动画。

```tsx
(delayedAnimation: TaroGeneral.IAnyObject, numberOfReps: number, reverse?: boolean, callback?: (flag: boolean) => void) => TaroGeneral.IAnyObject
```

| 参数 | 说明 |
| --- | --- |
| delayedAnimation |  |
| numberOfReps | 重复次数。为负值时一直循环，直到被取消动画。<br />param: numberOfReps 重复次数。为负值时一直循环，直到被取消动画。 |
| reverse | 反向运行动画，每周期结束动画由尾到头运行。该字段仅对 timing 和 spring 返回的动画对象生效。<br />param: reverse 反向运行动画，每周期结束动画由尾到头运行。该字段仅对 timing 和 spring 返回的动画对象生效。 |
| callback | 动画完成回调。动画被取消时，返回 fasle，正常完成时返回 true。<br />param: callback 动画完成回调。动画被取消时，返回 fasle，正常完成时返回 true。 |

##### sequence

组合动画序列，依次执行传入的动画。

```tsx
(...delayedAnimation: TaroGeneral.IAnyObject) => TaroGeneral.IAnyObject
```

| 参数 | 说明 |
| --- | --- |
| delayedAnimation |  |

##### runOnJS

worklet 函数运行在 UI 线程时，捕获的外部函数可能为 worklet 类型或普通函数，为了更明显的对其区分，要求必须使用 runOnJS 调回 JS 线程的普通函数。 有这样的要求是因为，调用其它 worklet 函数时是同步调用，但在 UI 线程执行 JS 线程的函数只能是异步，开发者容易混淆，试图同步获取 JS 线程的返回值。

```tsx
(fn: TaroGeneral.TFunc) => TaroGeneral.TFunc
```

| 参数 | 说明 |
| --- | --- |
| fn | worklet 类型函数<br />param: fn worklet 类型函数 |

##### runOnUI

在 UI 线程执行 worklet 函数

```tsx
(fn: TaroGeneral.TFunc) => TaroGeneral.TFunc
```

| 参数 | 说明 |
| --- | --- |
| fn | worklet 类型函数<br />param: fn worklet 类型函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| top | 顶部距离 |
| left | 左边界距离 |
| duration | 滚动动画时长 |
| animated | 是否启用滚动动画 |
| easingFunction | 动画曲线 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| velocity | 初速度 |
| deceleration | 衰减速率 |
| clamp | 边界值，长度为 2 的数组 |

###### bounce

简单的反弹效果

```tsx
(t: number) => any
```

| 参数 | 说明 |
| --- | --- |
| t |  |

###### ease

简单的惯性动画

```tsx
(t: number) => any
```

| 参数 | 说明 |
| --- | --- |
| t |  |

###### elastic

简单的弹性动画，类似弹簧来回摆动，高阶函数。默认弹性为 1，会稍微超出一次。弹性为 0 时 不会过冲

```tsx
(bounciness?: number) => any
```

| 参数 | 说明 |
| --- | --- |
| bounciness |  |

###### linear

线性函数

```tsx
(t: number) => any
```

| 参数 | 说明 |
| --- | --- |
| t |  |

###### quad

二次方函数

```tsx
(t: number) => any
```

| 参数 | 说明 |
| --- | --- |
| t |  |

###### cubic

立方函数

```tsx
(t: number) => any
```

| 参数 | 说明 |
| --- | --- |
| t |  |

###### poly

高阶函数，返回幂函数

```tsx
(n: number) => any
```

| 参数 | 说明 |
| --- | --- |
| n |  |

###### bezier

三次贝塞尔曲线，效果同 css transition-timing-function

```tsx
(x1: number, y1: number, x2: number, y2: number) => any
```

| 参数 | 说明 |
| --- | --- |
| x1 |  |
| y1 |  |
| x2 |  |
| y2 |  |

###### circle

圆形曲线

```tsx
(t: number) => any
```

| 参数 | 说明 |
| --- | --- |
| t |  |

###### sin

正弦函数

```tsx
(t: number) => any
```

| 参数 | 说明 |
| --- | --- |
| t |  |

###### exp

指数函数

```tsx
(t: number) => any
```

| 参数 | 说明 |
| --- | --- |
| t |  |

###### in

正向运行 easing function，高阶函数。

```tsx
(easing: (t: number) => any) => any
```

| 参数 | 说明 |
| --- | --- |
| easing |  |

###### out

反向运行 easing function，高阶函数。

```tsx
(easing: (t: number) => any) => any
```

| 参数 | 说明 |
| --- | --- |
| easing |  |

###### inOut

前半程正向，后半程反向，高阶函数。

```tsx
(easing: (t: number) => any) => any
```

| 参数 | 说明 |
| --- | --- |
| easing |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| damping | 阻尼系数 |
| mass | 重量系数，值越大移动越慢 |
| stiffness | 弹性系数 |
| overshootClamping | 动画是否可以在指定值上反弹 |
| restDisplacementThreshold | 弹簧静止时的位移 |
| restSpeedThreshold | 弹簧静止的速度 |
| velocity | 速度 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| duration | 动画时长 |
| easing | 动画曲线 |

## 网络

### Taro.request(option)

发起 HTTPS 网络请求。使用前请注意阅读[相关说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)。

**data 参数说明**
最终发送给服务器的数据是 String 类型，如果传入的 data 不是 String 类型，会被转换成 String 。转换规则如下：
- 对于 `GET` 方法的数据，会将数据转换成 query string（`encodeURIComponent(k)=encodeURIComponent(v)&encodeURIComponent(k)=encodeURIComponent(v)...`）
- 对于 `POST` 方法且 `header['content-type']` 为 `application/json` 的数据，会对数据进行 JSON 序列化
- 对于 `POST` 方法且 `header['content-type']` 为 `application/x-www-form-urlencoded` 的数据，会将数据转换成 query string `（encodeURIComponent(k)=encodeURIComponent(v)&encodeURIComponent(k)=encodeURIComponent(v)...）`

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/request/request)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 开发者服务器接口地址 |
| data | 请求的参数 |
| header | 设置请求的 header，header 中不能设置 Referer。<br />`content-type` 默认为 `application/json` |
| timeout | 超时时间，单位为毫秒 |
| method | HTTP 请求方法 |
| dataType | 返回的数据格式 |
| responseType | 响应的数据类型 |
| enableHttp2 | 开启 http2<br />微信 |
| enableQuic | 开启 quic<br />微信 |
| enableCache | 开启 cache<br />微信 |
| enableHttpDNS | 是否开启 HttpDNS 服务。如开启，需要同时填入 httpDNSServiceId 。 HttpDNS 用法详见 移动解析HttpDNS<br />微信 |
| httpDNSServiceId | HttpDNS 服务商 Id。 HttpDNS 用法详见 移动解析HttpDNS<br />微信 |
| enableChunked | 开启 transfer-encoding chunked。<br />微信 |
| forceCellularNetwork | wifi下使用移动网络发送请求<br />微信 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| jsonp | 设置是否使用 jsonp 方式获取数据<br />Web |
| jsonpCache | 设置 jsonp 请求 url 是否需要被缓存<br />Web |
| mode | 设置是否允许跨域请求<br />Web |
| credentials | 设置是否携带 Cookie<br />Web |
| cache | 设置缓存模式<br />Web |
| retryTimes | 设置请求重试次数<br />Web： 仅在 jsonp 模式下生效<br />Web |
| backup | 设置请求的兜底接口<br />Web： 仅在 jsonp 模式下生效<br />Web |
| signal | 设置请求中止信号<br />Web |
| dataCheck | 设置请求响应的数据校验函数，若返回 false，则请求兜底接口，若无兜底接口，则报请求失败<br />Web： 仅在 jsonp 模式下生效<br />Web |
| useStore | 设置请求是否使用缓存<br />Web： 仅在 jsonp 模式下生效<br />Web |
| storeCheckKey | 设置请求缓存校验的 key<br />Web： 仅在 jsonp 模式下生效<br />Web |
| storeSign | 设置请求缓存签名<br />Web： 仅在 jsonp 模式下生效<br />Web |
| storeCheck | 设置请求校验函数，一般不需要设置<br />Web |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| data | 开发者服务器返回的数据 |
| header | 开发者服务器返回的 HTTP Response Header |
| statusCode | 开发者服务器返回的 HTTP 状态码 |
| errMsg | 调用结果 |
| cookies | cookies |

#### DataType

返回的数据格式

| 参数 | 说明 |
| --- | --- |
| json | 返回的数据为 JSON，返回后会对返回的数据进行一次 JSON.parse<br />其他: 不对返回的内容进行 JSON.parse |

#### Method

HTTP 请求方法

| 参数 | 说明 |
| --- | --- |
| OPTIONS | HTTP 请求 OPTIONS |
| GET | HTTP 请求 GET |
| HEAD | HTTP 请求 HEAD |
| POST | HTTP 请求 POST |
| PUT | HTTP 请求 PUT |
| PATCH | HTTP 请求 PATCH |
| DELETE | HTTP 请求 DELETE |
| TRACE | HTTP 请求 TRACE |
| CONNECT | HTTP 请求 CONNECT |

#### ResponseType

响应的数据类型

| 参数 | 说明 |
| --- | --- |
| text | 响应的数据为文本 |
| arraybuffer | 响应的数据为 ArrayBuffer |

#### CorsMode

跨域策略

| 参数 | 说明 |
| --- | --- |
| no-cors | 跨域请求将获取不透明的响应 |
| cors | 允许跨域请求 |
| same-origin | 请求总是向当前的源发起的 |

#### Credentials

证书

| 参数 | 说明 |
| --- | --- |
| include | 不论是不是跨域的请求,总是发送请求资源域在本地的 cookies、 HTTP Basic authentication 等验证信息 |
| same-origin | 只有当URL与响应脚本同源才发送 cookies、 HTTP Basic authentication 等验证信息 |
| omit | 从不发送cookies |

#### Cache

缓存策略

| 参数 | 说明 |
| --- | --- |
| default | 浏览器从HTTP缓存中寻找匹配的请求 |
| no-cache | 浏览器在其HTTP缓存中寻找匹配的请求 |
| reload | 浏览器直接从远程服务器获取资源，不查看缓存，然后使用下载的资源更新缓存 |
| force-cache | 浏览器在其HTTP缓存中寻找匹配的请求 |
| only-if-cached | 浏览器在其HTTP缓存中寻找匹配的请求 |

#### ReferrerStrategy

referer 策略

| 参数 | 说明 |
| --- | --- |
| index | referer 值为 https://{appid}.hybrid.alipay-eco.com/{appid}/{version}/index.html |
| page | 保留 page（pages/xxx/yyy），referer 值为 https://{appid}.hybrid.alipay-eco.com/{appid}/{version}/index.html#{page} |
| querystring | 默认值。会将发起请求时所在页面的 URL 作为 referer 值，会保留 page（pages/xxx/yyy）和 querystring（x=1&y=2）并可能有框架添加的其他参数，referer 值为 https://{appid}.hybrid.alipay-eco.com/{appid}/{version}/index.html#{page}?{querysrtring}{框架其他参数} |

### RequestTask

网络请求任务对象

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/request/RequestTask)

##### abort

中断请求任务

```tsx
() => void
```

##### onHeadersReceived

监听 HTTP Response Header 事件。会比请求完成事件更早

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | HTTP Response Header 事件的回调函数 |

##### offHeadersReceived

取消监听 HTTP Response Header 事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | HTTP Response Header 事件的回调函数 |

##### onChunkReceived

监听 Transfer-Encoding Chunk Received 事件。当接收到新的chunk时触发。

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | Transfer-Encoding Chunk Received 事件的回调函数 |

##### offChunkReceived

移除 Transfer-Encoding Chunk Received 事件的监听函数

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | Transfer-Encoding Chunk Received 事件的回调函数 |

###### 回调

HTTP Response Header 事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

| 参数 | 说明 |
| --- | --- |
| header | 开发者服务器返回的 HTTP Response Header |

###### 回调

Transfer-Encoding Chunk Received 事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

开发者服务器每次返回新 chunk 时的 Response

| 参数 | 说明 |
| --- | --- |
| data | 返回的chunk buffer |

### Taro.addInterceptor(interceptor)

> 最低 Taro 版本: 1.2.16

可以使用拦截器在请求发出前或发出后做一些额外操作。

在调用 `Taro.request` 发起请求之前，调用 `Taro.addInterceptor` 方法为请求添加拦截器，拦截器的调用顺序遵循洋葱模型。
拦截器是一个函数，接受 chain 对象作为参数。chain 对象中含有 **requestParmas** 属性，代表请求参数。拦截器内最后需要调用 `chain.proceed(requestParams)` 以调用下一个拦截器或发起请求。

Taro 提供了两个内置拦截器 `logInterceptor` 与 `timeoutInterceptor`，分别用于打印请求的相关信息和在请求超时时抛出错误。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/request/addInterceptor)

### Taro.cleanInterceptors()

清除所有拦截器

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/request/cleanInterceptors)

### Taro.downloadFile(option)

下载文件资源到本地。客户端直接发起一个 HTTPS GET 请求，返回文件的本地临时路径，单次下载允许的最大文件为 50MB。使用前请注意阅读[相关说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)。

注意：请在服务端响应的 header 中指定合理的 `Content-Type` 字段，以保证客户端正确处理文件类型。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/download/downloadFile)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 下载资源的 url |
| filePath | 指定文件下载后存储的路径 |
| header | HTTP 请求的 Header，Header 中不能设置 Referer |
| timeout | 超时时间，单位为毫秒 |
| withCredentials | 是否应使用传出凭据 (cookie) 发送此请求<br />Web |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### FileSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| filePath | 用户文件路径。传入 filePath 时会返回，跟传入的 filePath 一致 |
| statusCode | 开发者服务器返回的 HTTP 状态码 |
| tempFilePath | 临时文件路径。没传入 filePath 指定文件存储路径时会返回，下载后的文件会存储到一个临时文件 |
| errMsg | 调用结果 |
| header | 开发者服务器返回的 HTTP Response Header<br />微信： 非官方文档标注属性<br />微信 |
| dataLength | 数据长度，单位 Byte<br />微信： 非官方文档标注属性<br />微信 |
| cookies | cookies<br />微信： 非官方文档标注属性<br />微信 |
| profile | 网络请求过程中一些调试信息 |

### DownloadTask

一个可以监听下载进度变化事件，以及取消下载任务的对象

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/download/DownloadTask)

##### abort

中断下载任务

```tsx
() => void
```

##### onProgressUpdate

监听下载进度变化事件

```tsx
(callback: OnProgressUpdateCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 下载进度变化事件的回调函数 |

##### offProgressUpdate

取消监听下载进度变化事件

```tsx
(callback: OnProgressUpdateCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 下载进度变化事件的回调函数 |

##### onHeadersReceived

监听 HTTP Response Header 事件。会比请求完成事件更早

```tsx
(callback: OnHeadersReceivedCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | HTTP Response Header 事件的回调函数 |

##### offHeadersReceived

取消监听 HTTP Response Header 事件

```tsx
(callback: OnHeadersReceivedCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | HTTP Response Header 事件的回调函数 |

##### OnHeadersReceivedCallback

HTTP Response Header 事件的回调函数

```tsx
(result: OnHeadersReceivedCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnProgressUpdateCallback

下载进度变化事件的回调函数

```tsx
(result: OnProgressUpdateCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnHeadersReceivedCallbackResult

| 参数 | 说明 |
| --- | --- |
| header | 开发者服务器返回的 HTTP Response Header |

##### OnProgressUpdateCallbackResult

| 参数 | 说明 |
| --- | --- |
| progress | 下载进度百分比 |
| totalBytesExpectedToWrite | 预期需要下载的数据总长度，单位 Bytes |
| totalBytesWritten | 已经下载的数据长度，单位 Bytes |

### Taro.uploadFile(option)

将本地资源上传到服务器。客户端发起一个 HTTPS POST 请求，其中 `content-type` 为 `multipart/form-data`。使用前请注意阅读[相关说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/upload/uploadFile)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 开发者服务器地址 |
| filePath | 要上传文件资源的路径 |
| name | 文件对应的 key，开发者在服务端可以通过这个 key 获取文件的二进制内容 |
| header | HTTP 请求 Header，Header 中不能设置 Referer |
| formData | HTTP 请求中其他额外的 form data |
| timeout | 超时时间，单位为毫秒 |
| fileName | 上传的文件名<br />Web |
| withCredentials | 是否应使用传出凭据 (cookie) 发送此请求<br />Web |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| data | 开发者服务器返回的数据 |
| statusCode | 开发者服务器返回的 HTTP 状态码 |
| errMsg | 调用结果 |
| header | 开发者服务器返回的 HTTP Response Header<br />微信： 非官方文档标注属性<br />微信 |
| cookies | cookies<br />微信： 非官方文档标注属性<br />微信 |

### UploadTask

一个可以监听上传进度变化事件，以及取消上传任务的对象

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/upload/UploadTask)

##### abort

中断上传任务

```tsx
() => void
```

##### onProgressUpdate

监听上传进度变化事件

```tsx
(callback: OnProgressUpdateCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 上传进度变化事件的回调函数 |

##### offProgressUpdate

取消监听上传进度变化事件

```tsx
(callback: OnProgressUpdateCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 上传进度变化事件的回调函数 |

##### onHeadersReceived

监听 HTTP Response Header 事件。会比请求完成事件更早

```tsx
(callback: OnHeadersReceivedCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | HTTP Response Header 事件的回调函数 |

##### offHeadersReceived

取消监听 HTTP Response Header 事件

```tsx
(callback: OnHeadersReceivedCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | HTTP Response Header 事件的回调函数 |

##### OnHeadersReceivedCallback

HTTP Response Header 事件的回调函数

```tsx
(result: OnHeadersReceivedCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnProgressUpdateCallback

上传进度变化事件的回调函数

```tsx
(result: OnProgressUpdateCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnHeadersReceivedCallbackResult

| 参数 | 说明 |
| --- | --- |
| header | 开发者服务器返回的 HTTP Response Header |

##### OnProgressUpdateCallbackResult

| 参数 | 说明 |
| --- | --- |
| progress | 上传进度百分比 |
| totalBytesExpectedToSend | 预期需要上传的数据总长度，单位 Bytes |
| totalBytesSent | 已经上传的数据长度，单位 Bytes |

### Taro.sendSocketMessage(option)

通过 WebSocket 连接发送数据。需要先 Taro.connectSocket，并在 Taro.onSocketOpen 回调之后才能发送。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/websocket/sendSocketMessage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| data | 需要发送的内容 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onSocketOpen(callback)

监听 WebSocket 连接打开事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/websocket/onSocketOpen)

#### 回调

WebSocket 连接打开事件的回调函数

```tsx
(result: OpenCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### OpenCallbackResult

| 参数 | 说明 |
| --- | --- |
| header | 连接成功的 HTTP 响应 Header |

### Taro.onSocketMessage(callback)

监听 WebSocket 接受到服务器的消息事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/websocket/onSocketMessage)

#### 回调

WebSocket 接受到服务器的消息事件的回调函数

```tsx
(result: CallbackResult<T>) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| data | 服务器返回的消息 |

### Taro.onSocketError(callback)

监听 WebSocket 错误事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/websocket/onSocketError)

#### 回调

WebSocket 错误事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |

### Taro.onSocketClose(callback)

监听 WebSocket 连接关闭事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/websocket/onSocketClose)

#### 回调

WebSocket 连接关闭事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| code | 一个数字值表示关闭连接的状态号，表示连接被关闭的原因。 |
| reason | 一个可读的字符串，表示连接被关闭的原因。 |

### Taro.connectSocket(option)

创建一个 WebSocket 连接。使用前请注意阅读[相关说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)。

**并发数**
- 1.7.0 及以上版本，最多可以同时存在 5 个 WebSocket 连接。
- 1.7.0 以下版本，一个小程序同时只能有一个 WebSocket 连接，如果当前已存在一个 WebSocket 连接，会自动关闭该连接，并重新创建一个 WebSocket 连接。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/websocket/connectSocket)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 开发者服务器 wss 接口地址 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| header | HTTP Header，Header 中不能设置 Referer |
| protocols | 子协议数组 |
| success | 接口调用成功的回调函数 |
| tcpNoDelay | 建立 TCP 连接的时候的 TCP_NODELAY 设置 |

### Taro.closeSocket(option)

关闭 WebSocket 连接

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/websocket/closeSocket)

#### 参数

| 参数 | 说明 |
| --- | --- |
| code | 一个数字值表示关闭连接的状态号，表示连接被关闭的原因。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| reason | 一个可读的字符串，表示连接被关闭的原因。这个字符串必须是不长于 123 字节的 UTF-8 文本（不是字符）。 |
| success | 接口调用成功的回调函数 |

### SocketTask

WebSocket 任务，可通过 [Taro.connectSocket()](https://docs.taro.zone/docs/apis/network/websocket/SocketTask) 接口创建返回。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/websocket/SocketTask)

#### 方法

| 参数 | 说明 |
| --- | --- |
| socketTaskId | websocket 当前的连接 ID。 |
| readyState | websocket 当前的连接状态。 |
| errMsg | websocket 接口调用结果。 |
| CONNECTING | websocket 状态值：连接中。 |
| OPEN | websocket 状态值：已连接。 |
| CLOSING | websocket 状态值：关闭中。 |
| CLOSED | websocket 状态值：已关闭。 |
| ws | 浏览器 websocket 实例。（Web独有） |

##### send

通过 WebSocket 连接发送数据

```tsx
(option: SendOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### close

关闭 WebSocket 连接

```tsx
(option: CloseOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### onOpen

监听 WebSocket 连接打开事件

```tsx
(callback: OnOpenCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | WebSocket 连接打开事件的回调函数 |

##### onClose

监听 WebSocket 连接关闭事件

```tsx
(callback: OnCloseCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | WebSocket 连接关闭事件的回调函数 |

##### onError

监听 WebSocket 错误事件

```tsx
(callback: OnErrorCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | WebSocket 错误事件的回调函数 |

##### onMessage

监听 WebSocket 接受到服务器的消息事件

```tsx
<T = any>(callback: OnMessageCallback<T>) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | WebSocket 接受到服务器的消息事件的回调函数 |

##### CloseOption

| 参数 | 说明 |
| --- | --- |
| code | 一个数字值表示关闭连接的状态号，表示连接被关闭的原因。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| reason | 一个可读的字符串，表示连接被关闭的原因。这个字符串必须是不长于 123 字节的 UTF-8 文本（不是字符）。 |
| success | 接口调用成功的回调函数 |

##### OnCloseCallback

WebSocket 连接关闭事件的回调函数

```tsx
(result: OnCloseCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnCloseCallbackResult

| 参数 | 说明 |
| --- | --- |
| code | 一个数字值表示关闭连接的状态号，表示连接被关闭的原因。 |
| reason | 一个可读的字符串，表示连接被关闭的原因。 |

##### OnErrorCallback

WebSocket 错误事件的回调函数

```tsx
(result: OnErrorCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnErrorCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |

##### OnMessageCallback

WebSocket 接受到服务器的消息事件的回调函数

```tsx
(result: OnMessageCallbackResult<T>) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnMessageCallbackResult

| 参数 | 说明 |
| --- | --- |
| data | 服务器返回的消息 |

##### OnOpenCallback

WebSocket 连接打开事件的回调函数

```tsx
(result: OnOpenCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnOpenCallbackResult

| 参数 | 说明 |
| --- | --- |
| header | 连接成功的 HTTP 响应 Header |

##### SendOption

| 参数 | 说明 |
| --- | --- |
| data | 需要发送的内容 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.stopLocalServiceDiscovery(option)

停止搜索 mDNS 服务

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/mdns/stopLocalServiceDiscovery)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 失败回调

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'task not found': 在当前没有处在搜索服务中的情况下调用 stopLocalServiceDiscovery; |

### Taro.startLocalServiceDiscovery(option)

开始搜索局域网下的 mDNS 服务。搜索的结果会通过 wx.onLocalService* 事件返回。

**注意**
1. wx.startLocalServiceDiscovery 是一个消耗性能的行为，开始 30 秒后会自动 stop 并执行 wx.onLocalServiceDiscoveryStop 注册的回调函数。
2. 在调用 wx.startLocalServiceDiscovery 后，在这次搜索行为停止后才能发起下次 wx.startLocalServiceDiscovery。停止本次搜索行为的操作包括调用 wx.stopLocalServiceDiscovery 和 30 秒后系统自动 stop 本次搜索。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/mdns/startLocalServiceDiscovery)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 失败回调

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'invalid param': serviceType 为空;<br />- 'scan task already exist': 在当前 startLocalServiceDiscovery 发起的搜索未停止的情况下，再次调用 startLocalServiceDiscovery; |

### Taro.onLocalServiceResolveFail(callback)

监听 mDNS 服务解析失败的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/mdns/onLocalServiceResolveFail)

#### 回调

mDNS 服务解析失败的事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| serviceName | 服务的名称 |
| serviceType | 服务的类型 |

### Taro.onLocalServiceLost(callback)

监听 mDNS 服务离开的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/mdns/onLocalServiceLost)

#### 回调

mDNS 服务离开的事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| serviceName | 服务的名称 |
| serviceType | 服务的类型 |

### Taro.onLocalServiceFound(callback)

监听 mDNS 服务发现的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/mdns/onLocalServiceFound)

#### 回调

mDNS 服务发现的事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| ip | 服务的 ip 地址 |
| port | 服务的端口 |
| serviceName | 服务的名称 |
| serviceType | 服务的类型 |

### Taro.onLocalServiceDiscoveryStop(callback)

监听 mDNS 服务停止搜索的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/mdns/onLocalServiceDiscoveryStop)

#### 回调

mDNS 服务停止搜索的事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.offLocalServiceResolveFail(callback)

取消监听 mDNS 服务解析失败的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/mdns/offLocalServiceResolveFail)

#### 回调

mDNS 服务解析失败的事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.offLocalServiceLost(callback)

取消监听 mDNS 服务离开的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/mdns/offLocalServiceLost)

#### 回调

mDNS 服务离开的事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.offLocalServiceFound(callback)

取消监听 mDNS 服务发现的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/mdns/offLocalServiceFound)

#### 回调

mDNS 服务发现的事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.offLocalServiceDiscoveryStop(callback)

取消监听 mDNS 服务停止搜索的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/mdns/offLocalServiceDiscoveryStop)

#### 回调

mDNS 服务停止搜索的事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.createTCPSocket()

创建一个 TCP Socket 实例。使用前请注意阅读[相关说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)。

**连接限制**

- 允许与局域网内的非本机 IP 通信
- 允许与配置过的服务器域名通信，详见[相关说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)
- 禁止与以下端口号连接：1024 以下 1099 1433 1521 1719 1720 1723 2049 2375 3128 3306 3389 3659 4045 5060 5061 5432 5984 6379 6000 6566 7001 7002 8000-8100 8443 8888 9200 9300 10051 10080 11211 27017 27018 27019
- 每 5 分钟内最多创建 20 个 TCPSocket

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/tcp/createTCPSocket)

### TCPSocket

一个 TCP Socket 实例，默认使用 IPv4 协议

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/tcp/TCPSocket)

##### connect

在给定的套接字上启动连接

```tsx
(option: Option) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### write

在 socket 上发送数据

```tsx
(data: string | ArrayBuffer) => void
```

| 参数 | 说明 |
| --- | --- |
| data | 要发送的数据 |

##### close

关闭连接

```tsx
() => void
```

##### onClose

监听关闭事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 当一个 socket 完全关闭就发出该事件的回调函数 |

##### offClose

取消监听当一个 socket 完全关闭就发出该事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 当一个 socket 完全关闭就发出该事件的回调函数 |

##### onConnect

监听当一个 socket 连接成功建立的时候触发该事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 当一个 socket 连接成功建立的时候触发该事件的回调函数 |

##### offConnect

取消监听当一个 socket 连接成功建立的时候触发该事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 当一个 socket 连接成功建立的时候触发该事件的回调函数 |

##### onError

监听当错误发生时触发

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 监听当错误发生时触发的回调函数 |

##### offError

取消监听当错误发生时触发

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 监听当错误发生时触发的回调函数 |

##### onMessage

监听当接收到数据的时触发该事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 当接收到数据的时触发该事件的回调函数 |

##### offMessage

取消监听当接收到数据的时触发该事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 当接收到数据的时触发该事件的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| address | 套接字要连接的地址 |
| port | 套接字要连接的端口 |

###### 回调

当一个 socket 完全关闭就发出该事件的回调函数

```tsx
(args: unknown[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args |  |

###### 回调

当一个 socket 连接成功建立的时候触发该事件的回调函数

```tsx
(args: unknown[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args |  |

###### 回调

监听当错误发生时触发的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |

###### 回调

当接收到数据的时触发该事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

| 参数 | 说明 |
| --- | --- |
| message | 收到的消息 |
| remoteInfo | 发送端地址信息 |
| localInfo | 接收端地址信息 |

###### RemoteInfo

发送端地址信息

| 参数 | 说明 |
| --- | --- |
| address | 发送消息的 socket 的地址 |
| family | 使用的协议族，为 IPv4 或者 IPv6 |
| port | 端口号 |
| size | message 的大小，单位：字节 |

###### LocalInfo

接收端地址信息

| 参数 | 说明 |
| --- | --- |
| address | 接收消息的 socket 的地址 |
| family | 使用的协议族，为 IPv4 或者 IPv6 |
| port | 端口号 |

### Taro.createUDPSocket()

创建一个 UDP Socket 实例。使用前请注意阅读[相关说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/udp/createUDPSocket)

### UDPSocket

一个 UDP Socket 实例，默认使用 IPv4 协议。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/network/udp/UDPSocket)

##### bind

绑定一个系统随机分配的可用端口，或绑定一个指定的端口号

```tsx
(port: number) => number
```

| 参数 | 说明 |
| --- | --- |
| port | 指定要绑定的端口号，不传则返回系统随机分配的可用端口 |

##### setTTL

设置 IP_TTL 套接字选项，用于设置一个 IP 数据包传输时允许的最大跳步数

```tsx
(ttl: number) => void
```

| 参数 | 说明 |
| --- | --- |
| ttl | ttl 参数可以是 0 到 255 之间 |

##### send

向指定的 IP 和 port 发送消息

```tsx
(option: Option) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### connect

预先连接到指定的 IP 和 port，需要配合 write 方法一起使用

```tsx
(option: Option) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### write

用法与 send 方法相同，如果没有预先调用 connect 则与 send 无差异（注意即使调用了 connect 也需要在本接口填入地址和端口参数）

```tsx
() => void
```

##### close

关闭 UDP Socket 实例，相当于销毁。 在关闭之后，UDP Socket 实例不能再发送消息，每次调用 `UDPSocket.send` 将会触发错误事件，并且 message 事件回调函数也不会再也执行。在 `UDPSocket` 实例被创建后将被 Native 强引用，保证其不被 GC。在 `UDPSocket.close` 后将解除对其的强引用，让 UDPSocket 实例遵从 GC。

```tsx
() => void
```

##### onClose

监听关闭事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 关闭事件的回调函数 |

##### offClose

取消监听关闭事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 关闭事件的回调函数 |

##### onError

监听错误事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 错误事件的回调函数 |

##### offError

取消监听错误事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 错误事件的回调函数 |

##### onListening

监听开始监听数据包消息的事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 监听开始监听数据包消息的事件 |

##### offListening

取消监听开始监听数据包消息的事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 监听开始监听数据包消息的事件 |

##### onMessage

监听收到消息的事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 收到消息的事件的回调函数 |

##### offMessage

取消监听收到消息的事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 收到消息的事件的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| address | 要发消息的地址 |
| port | 要发送消息的端口号 |

###### 回调

当一个 socket 完全关闭就发出该事件的回调函数

```tsx
(args: unknown[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args |  |

###### 回调

错误事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |

###### 回调

监听开始监听数据包消息的事件

```tsx
(args: unknown[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args |  |

###### 回调

收到消息的事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

| 参数 | 说明 |
| --- | --- |
| message | 收到的消息 |
| remoteInfo | 发送端地址信息 |
| localInfo | 接收端地址信息 |

###### RemoteInfo

发送端地址信息

| 参数 | 说明 |
| --- | --- |
| address | 发送消息的 socket 的地址 |
| family | 使用的协议族，为 IPv4 或者 IPv6 |
| port | 端口号 |

###### LocalInfo

接收端地址信息

| 参数 | 说明 |
| --- | --- |
| address | 接收消息的 socket 的地址 |
| family | 使用的协议族，为 IPv4 或者 IPv6 |
| port | 端口号 |
| size | message 的大小，单位：字节 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| address | 要发消息的地址。在基础库 <= 2.9.3 版本必须是和本机同网段的 IP 地址，或安全域名列表内的域名地址；之后版本可以是任意 IP 和域名 |
| port | 要发送消息的端口号 |
| message | 要发送的数据 |
| offset | 发送数据的偏移量，仅当 message 为 ArrayBuffer 类型时有效 |
| length | 发送数据的长度，仅当 message 为 ArrayBuffer 类型时有效 |

## 支付

### Taro.requestPayment(option)

发起微信支付。了解更多信息，请查看[微信支付接口文档](https://pay.weixin.qq.com/wiki/doc/api/wxa/wxa_api.php?chapter=7_3&index=1)

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/payment/requestPayment)

#### 参数

| 参数 | 说明 |
| --- | --- |
| timeStamp | 时间戳，从 1970 年 1 月 1 日 00:00:00 至今的秒数，即当前的时间 |
| nonceStr | 随机字符串，长度为32个字符以下 |
| package | 统一下单接口返回的 prepay_id 参数值，提交格式如：prepay_id=*** |
| signType | 签名算法 |
| paySign | 签名，具体签名方案参见 [小程序支付接口文档](https://pay.weixin.qq.com/wiki/doc/api/wxa/wxa_api.php?chapter=7_7&index=3) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### SignType

| 参数 | 说明 |
| --- | --- |
| MD5 | 仅在微信支付 v2 版本接口适用 |
| HMAC-SHA256 | 仅在微信支付 v2 版本接口适用 |
| RSA | 仅在微信支付 v3 版本接口适用 |

### Taro.requestOrderPayment(option)

创建自定义版交易组件订单，并发起支付。 仅接入了[自定义版交易组件](https://developers.weixin.qq.com/miniprogram/dev/framework/ministore/minishopopencomponent2/Introduction2)的小程序需要使用，普通小程序可直接使用 `Taro.requestPayment`。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/payment/requestOrderPayment)

#### 参数

| 参数 | 说明 |
| --- | --- |
| timeStamp | 时间戳，从 1970 年 1 月 1 日 00:00:00 至今的秒数，即当前的时间 |
| nonceStr | 随机字符串，长度为32个字符以下 |
| package | 统一下单接口返回的 prepay_id 参数值，提交格式如：prepay_id=*** |
| orderInfo | 订单信息，仅在需要校验的场景下需要传递，具体见[接口说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ministore/minishopopencomponent2/API/order/requestOrderPayment) |
| extUserUin | 外部 APP 用户 ID |
| signType | 签名算法 |
| paySign | 签名，具体签名方案参见 [小程序支付接口文档](https://pay.weixin.qq.com/wiki/doc/api/wxa/wxa_api.php?chapter=7_7&index=3) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### SignType

| 参数 | 说明 |
| --- | --- |
| MD5 | 仅在微信支付 v2 版本接口适用 |
| HMAC-SHA256 | 仅在微信支付 v2 版本接口适用 |
| RSA | 仅在微信支付 v3 版本接口适用 |

### Taro.faceVerifyForPay(option)

支付各个安全场景验证人脸

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/payment/faceVerifyForPay)

## 数据缓存

### Taro.setStorageSync(key, data)

Taro.setStorage 的同步版本

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/setStorageSync)

### Taro.setStorage(option)

将数据存储在本地缓存中指定的 key 中。会覆盖掉原来该 key 对应的内容。除非用户主动删除或因存储空间原因被系统清理，否则数据都一直可用。单个 key 允许存储的最大数据长度为 1MB，所有数据存储上限为 10MB。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/setStorage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| data | 需要存储的内容。只支持原生类型、Date、及能够通过`JSON.stringify`序列化的对象。 |
| key | 本地缓存中指定的 key |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.revokeBufferURL(url)

根据 URL 销毁存在内存中的数据

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/revokeBufferURL)

### Taro.removeStorageSync(key)

Taro.removeStorage 的同步版本

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/removeStorageSync)

### Taro.removeStorage(option)

从本地缓存中移除指定 key

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/removeStorage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| key | 本地缓存中指定的 key |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getStorageSync(key)

Taro.getStorage 的同步版本

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/getStorageSync)

### Taro.getStorageInfoSync()

Taro.getStorageInfo 的同步版本

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/getStorageInfoSync)

#### 参数

| 参数 | 说明 |
| --- | --- |
| currentSize | 当前占用的空间大小, 单位 KB |
| keys | 当前 storage 中所有的 key |
| limitSize | 限制的空间大小，单位 KB |

### Taro.getStorageInfo(option)

异步获取当前storage的相关信息

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/getStorageInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### SuccessCallbackOption

| 参数 | 说明 |
| --- | --- |
| currentSize | 当前占用的空间大小, 单位 KB |
| keys | 当前 storage 中所有的 key |
| limitSize | 限制的空间大小，单位 KB |

### Taro.getStorage(option)

从本地缓存中异步获取指定 key 的内容

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/getStorage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| key | 本地缓存中指定的 key |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| data | key对应的内容 |
| errMsg | 调用结果 |

### Taro.createBufferURL(buffer)

根据传入的 buffer 创建一个唯一的 URL 存在内存中

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/createBufferURL)

### Taro.clearStorageSync()

Taro.clearStorage 的同步版本

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/clearStorageSync)

### Taro.clearStorage(option)

清理本地数据缓存

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/clearStorage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.batchSetStorageSync(option)

将数据批量存储在本地缓存中指定的 key 中。
会覆盖掉原来该 key 对应的内容。除非用户主动删除或因存储空间原因被系统清理，否则数据都一直可用。
单个 key 允许存储的最大数据长度为 1MB，所有数据存储上限为 10MB。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/batchSetStorageSync)

#### 参数

| 参数 | 说明 |
| --- | --- |
| kvList | [{ key, value }] |

#### kv

| 参数 | 说明 |
| --- | --- |
| key | key 本地缓存中指定的 key |
| value | data 需要存储的内容。只支持原生类型、Date、及能够通过JSON.stringify序列化的对象。 |

### Taro.batchSetStorage(option)

将数据批量存储在本地缓存中指定的 key 中。会覆盖掉原来该 key 对应的内容。
除非用户主动删除或因存储空间原因被系统清理，否则数据都一直可用。
单个 key 允许存储的最大数据长度为 1MB，所有数据存储上限为 10MB。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/batchSetStorage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| kvList | [{ key, value }] |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### kv

| 参数 | 说明 |
| --- | --- |
| key | key 本地缓存中指定的 key |
| value | data 需要存储的内容。只支持原生类型、Date、及能够通过JSON.stringify序列化的对象。 |

### Taro.batchGetStorageSync(keyList)

从本地缓存中同步批量获取指定 key 的内容。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/batchGetStorageSync)

### Taro.batchGetStorage(option)

从本地缓存中异步批量获取指定 key 的内容。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/batchGetStorage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| keyList | 本地缓存中指定的 keyList |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setBackgroundFetchToken(option)

设置自定义登录态，在周期性拉取数据时带上，便于第三方服务器验证请求合法性

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/background-fetch/setBackgroundFetchToken)

#### 参数

| 参数 | 说明 |
| --- | --- |
| token | 自定义的登录态 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onBackgroundFetchData(option)

收到 backgroundFetch 数据时的回调

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/background-fetch/onBackgroundFetchData)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 回调

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| fetchType | 缓存数据类别，取值为 periodic 或 pre |
| fetchedData | 缓存数据 |
| timeStamp | 客户端拿到缓存数据的时间戳 |
| path | 小程序页面路径 |
| query | 传给页面的 query 参数 |
| scene | 进入小程序的场景值 |

### Taro.getBackgroundFetchToken(option)

获取设置过的自定义登录态。若无，则返回 fail。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/background-fetch/getBackgroundFetchToken)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| token | 自定义的登录态 |
| errMsg | 接口调用结果 |

### Taro.getBackgroundFetchData(option)

拉取 backgroundFetch 客户端缓存数据

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/background-fetch/getBackgroundFetchData)

#### 参数

| 参数 | 说明 |
| --- | --- |
| fetchType | 缓存数据类别<br />微信： 取值为 periodic |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| fetchedData | 缓存数据 |
| timeStamp | 客户端拿到缓存数据的时间戳 ms。(iOS 时间戳存在异常，8.0.27 修复) |
| path | 小程序页面路径 |
| query | 传给页面的 query 参数 |
| scene | 进入小程序的场景值 |

### Taro.createCacheManager(option)

创建缓存管理器

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/cache-manager/createCacheManager)

#### Mode

| 参数 | 说明 |
| --- | --- |
| weakNetwork | 弱网/离线使用缓存返回 |
| always | 总是使用缓存返回 |
| none | 不开启，后续可手动开启/停止使用缓存返回 |

#### Extra

| 参数 | 说明 |
| --- | --- |
| apiList | 需要缓存的 wx api 接口，不传则表示支持缓存的接口全都做缓存处理。返回的如果是缓存数据，开发者可通过 fromCache 标记区分 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| origin | 全局 origin |
| mode | 缓存模式 |
| maxAge | 全局缓存有效时间，单位为毫秒，默认为 7 天，最长不超过 30 天 |
| extra | 额外的缓存处理 |

### CacheManager

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/storage/cache-manager/CacheManager)

#### 方法

| 参数 | 说明 |
| --- | --- |
| mode | 当前缓存模式 |
| origin | 全局 origin |
| maxAge | 全局缓存有效时间 |
| state | 当前缓存管理器状态 |

##### addRule

添加规则

```tsx
(option: AddRuleOption) => string
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### addRules

批量添加规则

```tsx
(option: AddRulesOption) => string[]
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### clearCaches

清空所有缓存

```tsx
() => void
```

##### clearRules

清空所有规则，同时会删除对应规则下所有缓存

```tsx
() => void
```

##### deleteCache

删除缓存

```tsx
(id: string) => void
```

| 参数 | 说明 |
| --- | --- |
| id | 缓存 id |

##### deleteCaches

批量删除缓存

```tsx
(ids: string[]) => void
```

| 参数 | 说明 |
| --- | --- |
| ids | 缓存 id 列表 |

##### deleteRule

删除规则，同时会删除对应规则下所有缓存

```tsx
(id: string) => void
```

| 参数 | 说明 |
| --- | --- |
| id | 规则 id |

##### deleteRules

批量删除规则，同时会删除对应规则下所有缓存

```tsx
(ids: string[]) => void
```

| 参数 | 说明 |
| --- | --- |
| ids | 规则 id 列表 |

##### match

匹配命中的缓存规则，一般需要和 request 事件搭配使用

```tsx
(option: MatchOption) => MatchResult
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### off

取消事件监听

```tsx
(eventName: string, handler: TaroGeneral.EventCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名称 |
| handler | 事件监听函数 |

##### on

监听事件

```tsx
(eventName: keyof OnEventName, handler: TaroGeneral.EventCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名称 |
| handler | 事件监听函数 |

##### start

开启缓存，仅在 mode 为 none 时生效，调用后缓存管理器的 state 会置为 1

```tsx
() => void
```

##### stop

关闭缓存，仅在 mode 为 none 时生效，调用后缓存管理器的 state 会置为 0

```tsx
() => void
```

##### Mode

| 参数 | 说明 |
| --- | --- |
| weakNetwork | 默认值，弱网/离线使用缓存返回 |
| always | 总是使用缓存返回 |
| none | 不开启，后续可手动开启/停止使用缓存返回 |

##### State

| 参数 | 说明 |
| --- | --- |
| 0 | 不使用缓存返回 |
| 1 | 使用缓存返回 |
| 2 | 未知 |

##### DataSchema

| 参数 | 说明 |
| --- | --- |
| type | 需要匹配的 data 对象的参数类型<br />string、number、boolean、null、object、any（表示任意类型），<br />同时支持数组模式（数组模式则在类型后面加 []，如 string[] 表示字符串数组） |
| value | 需要匹配的 data 对象的参数值<br />当 type 为基本类型时，可以用 string/regexp 来匹配固定的值，<br />也可以通过 function 来确定值是否匹配，<br />如果传入的 type 是 object，那么表示需要嵌套匹配值是否正确，可以传入 Array |

##### DataRule

| 参数 | 说明 |
| --- | --- |
| name | 需要匹配的参数名 |
| schema |  |

##### RuleObject

| 参数 | 说明 |
| --- | --- |
| id | 规则 id，如果不填则会由基础库生成 |
| method | 请求方法，可选值 GET/POST/PATCH/PUT/DELETE，如果为空则表示前面提到的所有方法都能被匹配到 |
| url | uri 匹配规则，可参考规则字符串写法和正则写法 |
| maxAge | 缓存有效时间，单位为 ms，不填则默认取缓存管理器全局的缓存有效时间 |
| dataSchema | 匹配请求参数 |

##### AddRuleOption

| 参数 | 说明 |
| --- | --- |
| rule | 规则 |

##### AddRulesOption

| 参数 | 说明 |
| --- | --- |
| rules | 规则列表 |

##### MatchOption

| 参数 | 说明 |
| --- | --- |
| evt | request 事件对象 |

##### MatchResult

| 参数 | 说明 |
| --- | --- |
| ruleId | 命中的规则id |
| cacheId | 缓存id |
| data | 缓存内容，会带有 fromCache 标记，方便开发者区分内容是否来自缓存 |
| createTime | 缓存创建时间 |
| maxAge | 缓存有效时间 |

##### OnEventName

| 参数 | 说明 |
| --- | --- |
| request | 发生 wx.request 请求，只在缓存管理器开启阶段会触发 |
| enterWeakNetwork | 进入弱网/离线状态 |
| exitWeakNetwork | 离开弱网/离线状态 |

## 数据分析

### Taro.reportMonitor(name, value)

自定义业务数据监控上报接口。

**使用说明**
使用前，需要在「小程序管理后台-运维中心-性能监控-业务数据监控」中新建监控事件，配置监控描述与告警类型。每一个监控事件对应唯一的监控ID，开发者最多可以创建128个监控事件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/data-analysis/reportMonitor)

### Taro.reportEvent(eventId, data)

事件上报

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/data-analysis/reportEvent)

### Taro.reportAnalytics(eventName, data)

自定义分析数据上报接口。使用前，需要在小程序管理后台自定义分析中新建事件，配置好事件名与字段。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/data-analysis/reportAnalytics)

### Taro.getExptInfoSync(keys)

给定实验参数数组，获取对应的实验参数值

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/data-analysis/getExptInfoSync)

### Taro.getCommonConfig(option)

给定实验参数数组，获取对应的实验参数值

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/data-analysis/getCommonConfig)

#### 参数

| 参数 | 说明 |
| --- | --- |
| keys | 需要获取的数据指标的对象数组，每个string的格式约定：配置类型_分表key |
| mode | 0：通用配置模式 1：实验模式, 参数与返回结果的使用等效于接口wx.getExptInfoSync |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| errcode | 错误码 |
| errmsg | 错误信息 |
| conf_type | 配置类型, 1-表类型 2-kv类型 |
| conf | 根据conf_type来确定conf内容, conf_type为1时conf是一个json数组, 类似"[{xxx},{xxx}]", 每一项对应表类型每一行配置内容, 其中conf_type为2时conf是一个json对象，类似"{xxxx}" |
| expire_sec | 过期时间,单位秒. 0表示当次有效 |

## 画布

### Taro.createOffscreenCanvas(options)

创建离屏 canvas 实例

有两个版本的写法：

- createOffscreenCanvas(options) 从 2.16.1 起支持
- createOffscreenCanvas(width, height, this) 从 2.7.0 起支持)

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/createOffscreenCanvas)

#### 参数

| 参数 | 说明 |
| --- | --- |
| type | 创建的离屏 canvas 类型 |
| height | 画布高度 |
| width | 画布宽度 |
| compInst | 在自定义组件下，当前组件实例的 this，以操作组件内 [canvas](https://docs.taro.zone/docs/components/canvas) 组件 |

### Taro.createCanvasContext(canvasId, component)

创建 canvas 的绘图上下文 [CanvasContext](https://docs.taro.zone/docs/apis/canvas/CanvasContext) 对象

**Tip**: 需要指定 canvasId，该绘图上下文只作用于对应的 `<canvas/>`；另外，Web 端需要在 `useReady` 回调中执行它，否则会因为底层 canvas 渲染出来之前而去获取 CanvasContext，导致其底层的 context 为 `undefined`，从而不能正常绘图。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/createCanvasContext)

### Taro.canvasToTempFilePath(option, component)

把当前画布指定区域的内容导出生成指定大小的图片。在 `draw()` 回调里调用该方法才能保证图片导出成功。

**Bug & Tip：**

1.  `tip`: 在 `draw` 回调里调用该方法才能保证图片导出成功。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/canvasToTempFilePath)

#### 参数

| 参数 | 说明 |
| --- | --- |
| canvas | 画布标识，传入 [canvas](https://docs.taro.zone/docs/components/canvas) 组件实例 （canvas type="2d" 时使用该属性）。 |
| canvasId | 画布标识，传入 [canvas](https://docs.taro.zone/docs/components/canvas) 组件的 canvas-id |
| quality | 图片的质量，目前仅对 jpg 有效。取值范围为 (0, 1]，不在范围内时当作 1.0 处理。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| destHeight | 输出的图片的高度 |
| destWidth | 输出的图片的宽度 |
| fail | 接口调用失败的回调函数 |
| fileType | 目标文件的类型 |
| height | 指定的画布区域的高度 |
| success | 接口调用成功的回调函数 |
| width | 指定的画布区域的宽度 |
| x | 指定的画布区域的左上角横坐标 |
| y | 指定的画布区域的左上角纵坐标 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 生成文件的临时路径 |
| errMsg | 调用结果 |

#### FileType

| 参数 | 说明 |
| --- | --- |
| jpg | jpg 图片 |
| png | png 图片 |

#### CanvasProps

| 参数 | 说明 |
| --- | --- |
| type | 指定 canvas 类型，支持 2d 和 webgl |
| canvasId | canvas 组件的唯一标识符，若指定了 type 则无需再指定该属性 |
| disableScroll | 当在 canvas 中移动时且有绑定手势事件时，禁止屏幕滚动以及下拉刷新 |
| onTouchStart | 手指触摸动作开始 |
| onTouchMove | 手指触摸后移动 |
| onTouchEnd | 手指触摸动作结束 |
| onTouchCancel | 手指触摸动作被打断，如来电提醒，弹窗 |
| onLongTap | 手指长按 500ms 之后触发，触发了长按事件后进行移动不会触发屏幕的滚动 |
| onError | 当发生错误时触发 error 事件，detail = {errMsg: 'something wrong'} |

##### onErrorEventDetail

| 参数 | 说明 |
| --- | --- |
| errMsg |  |

### Taro.canvasPutImageData(option, component)

将像素数据绘制到画布。在自定义组件下，第二个参数传入自定义组件实例 this，以操作组件内 `<canvas>` 组件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/canvasPutImageData)

#### 参数

| 参数 | 说明 |
| --- | --- |
| canvasId | 画布标识，传入 [canvas](https://docs.taro.zone/docs/components/canvas) 组件的 canvas-id 属性。 |
| data | 图像像素点数据，一维数组，每四项表示一个像素点的 rgba |
| height | 源图像数据矩形区域的高度 |
| width | 源图像数据矩形区域的宽度 |
| x | 源图像数据在目标画布中的位置偏移量（x 轴方向的偏移量） |
| y | 源图像数据在目标画布中的位置偏移量（y 轴方向的偏移量） |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.canvasGetImageData(option, component)

获取 canvas 区域隐含的像素数据。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/canvasGetImageData)

#### 参数

| 参数 | 说明 |
| --- | --- |
| canvasId | 画布标识，传入 [canvas](https://docs.taro.zone/docs/components/canvas) 组件的 `canvas-id` 属性。 |
| height | 将要被提取的图像数据矩形区域的高度 |
| width | 将要被提取的图像数据矩形区域的宽度 |
| x | 将要被提取的图像数据矩形区域的左上角横坐标 |
| y | 将要被提取的图像数据矩形区域的左上角纵坐标 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| data | 图像像素点数据，一维数组，每四项表示一个像素点的 rgba |
| height | 图像数据矩形的高度 |
| width | 图像数据矩形的宽度 |
| errMsg | 调用结果 |

### Canvas

Canvas 实例，可通过 SelectorQuery 获取。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/Canvas)

#### 方法

| 参数 | 说明 |
| --- | --- |
| height | 画布高度 |
| width | 画布宽度 |

##### cancelAnimationFrame

取消由 requestAnimationFrame 添加到计划中的动画帧请求。支持在 2D Canvas 和 WebGL Canvas 下使用, 但不支持混用 2D 和 WebGL 的方法。

```tsx
(requestID: number) => void
```

| 参数 | 说明 |
| --- | --- |
| requestID |  |

##### createImageData

创建一个 ImageData 对象。仅支持在 2D Canvas 中使用。

```tsx
() => ImageData
```

##### createImage

创建一个图片对象。 支持在 2D Canvas 和 WebGL Canvas 下使用, 但不支持混用 2D 和 WebGL 的方法。

```tsx
() => Image
```

##### createPath2D

创建 Path2D 对象

```tsx
(path: Path2D) => Path2D
```

| 参数 | 说明 |
| --- | --- |
| path |  |

##### getContext

支持获取 2D 和 WebGL 绘图上下文

```tsx
(contextType: string) => RenderingContext
```

| 参数 | 说明 |
| --- | --- |
| contextType |  |

##### requestAnimationFrame

在下次进行重绘时执行。 支持在 2D Canvas 和 WebGL Canvas 下使用, 但不支持混用 2D 和 WebGL 的方法。

```tsx
(callback: (...args: any[]) => any) => number
```

| 参数 | 说明 |
| --- | --- |
| callback | 执行的 callback |

##### toDataURL

返回一个包含图片展示的 data URI 。可以使用 type 参数其类型，默认为 PNG 格式。

```tsx
(type: string, encoderOptions: number) => string
```

| 参数 | 说明 |
| --- | --- |
| type | 图片格式，默认为 image/png |
| encoderOptions | 在指定图片格式为 image/jpeg 或 image/webp的情况下，可以从 0 到 1 的区间内选择图片的质量。如果超出取值范围，将会使用默认值 0.92。其他参数会被忽略。 |

##### toTempFilePath

把当前画布指定区域保存为图片

```tsx
(oprion: Option) => void
```

| 参数 | 说明 |
| --- | --- |
| oprion |  |

### CanvasContext

canvas 组件的绘图上下文

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/CanvasContext)

#### 方法

| 参数 | 说明 |
| --- | --- |
| fillStyle | 填充颜色。用法同 [CanvasContext.setFillStyle()]。 |
| strokeStyle | 边框颜色。用法同 [CanvasContext.setFillStyle()]。 |
| shadowOffsetX | 阴影相对于形状在水平方向的偏移 |
| shadowOffsetY | 阴影相对于形状在竖直方向的偏移 |
| shadowBlur | 阴影的模糊级别 |
| shadowColor | 阴影的颜色 |
| lineWidth | 线条的宽度。用法同 [CanvasContext.setLineWidth()]。 |
| lineCap | 线条的端点样式。用法同 [CanvasContext.setLineCap()]。 |
| lineJoin | 线条的交点样式。用法同 [CanvasContext.setLineJoin()]。 |
| miterLimit | 最大斜接长度。用法同 [CanvasContext.setMiterLimit()]。 |
| lineDashOffset | 虚线偏移量，初始值为0 |
| font | 当前字体样式的属性。符合 [CSS font 语法](https://developer.mozilla.org/zh-CN/docs/Web/CSS/font) 的 DOMString 字符串，至少需要提供字体大小和字体族名。默认值为 10px sans-serif。 |
| globalAlpha | 全局画笔透明度。范围 0-1，0 表示完全透明，1 表示完全不透明。 |
| globalCompositeOperation | 在绘制新形状时应用的合成操作的类型。目前安卓版本只适用于 `fill` 填充块的合成，用于 `stroke` 线段的合成效果都是 `source-over`。<br />目前支持的操作有<br />- 安卓：xor, source-over, source-atop, destination-out, lighter, overlay, darken, lighten, hard-light<br />- iOS：xor, source-over, source-atop, destination-over, destination-out, lighter, multiply, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion, saturation, luminosity |

##### arc

创建一条弧线。

- 创建一个圆可以指定起始弧度为 0，终止弧度为 2 * Math.PI。
- 用 `stroke` 或者 `fill` 方法来在 `canvas` 中画弧线。

针对 arc(100, 75, 50, 0, 1.5 * Math.PI)的三个关键坐标如下：

- 绿色: 圆心 (100, 75)
- 红色: 起始弧度 (0)
- 蓝色: 终止弧度 (1.5 * Math.PI)

```tsx
(x: number, y: number, r: number, sAngle: number, eAngle: number, counterclockwise?: boolean, anticlockwise?: boolean) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 圆心的 x 坐标 |
| y | 圆心的 y 坐标 |
| r | 圆的半径 |
| sAngle | 起始弧度，单位弧度（在3点钟方向） |
| eAngle | 终止弧度 |
| counterclockwise | 弧度的方向是否是逆时针 |

##### arcTo

根据控制点和半径绘制圆弧路径。

```tsx
(x1: number, y1: number, x2: number, y2: number, radius: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x1 | 第一个控制点的 x 轴坐标 |
| y1 | 第一个控制点的 y 轴坐标 |
| x2 | 第二个控制点的 x 轴坐标 |
| y2 | 第二个控制点的 y 轴坐标 |
| radius | 圆弧的半径 |

##### beginPath

开始创建一个路径。需要调用 `fill` 或者 `stroke` 才会使用路径进行填充或描边

 - 在最开始的时候相当于调用了一次 `beginPath`。
 - 同一个路径内的多次 `setFillStyle`、`setStrokeStyle`、`setLineWidth`等设置，以最后一次设置为准。

```tsx
() => void
```

##### bezierCurveTo

创建三次方贝塞尔曲线路径。曲线的起始点为路径中前一个点。

针对 moveTo(20, 20) bezierCurveTo(20, 100, 200, 100, 200, 20) 的三个关键坐标如下：

- 红色：起始点(20, 20)
- 蓝色：两个控制点(20, 100) (200, 100)
- 绿色：终止点(200, 20)

```tsx
(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => void
```

| 参数 | 说明 |
| --- | --- |
| cp1x | 第一个贝塞尔控制点的 x 坐标 |
| cp1y | 第一个贝塞尔控制点的 y 坐标 |
| cp2x | 第二个贝塞尔控制点的 x 坐标 |
| cp2y | 第二个贝塞尔控制点的 y 坐标 |
| x | 结束点的 x 坐标 |
| y | 结束点的 y 坐标 |

##### clearRect

清除画布上在该矩形区域内的内容

```tsx
(x: number, y: number, width: number, height: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 矩形路径左上角的横坐标 |
| y | 矩形路径左上角的纵坐标 |
| width | 矩形路径的宽度 |
| height | 矩形路径的高度 |

##### clip

从原始画布中剪切任意形状和尺寸。一旦剪切了某个区域，则所有之后的绘图都会被限制在被剪切的区域内（不能访问画布上的其他区域）。可以在使用 `clip` 方法前通过使用 `save` 方法对当前画布区域进行保存，并在以后的任意时间通过`restore`方法对其进行恢复。

```tsx
() => void
```

##### closePath

关闭一个路径。会连接起点和终点。如果关闭路径后没有调用 `fill` 或者 `stroke` 并开启了新的路径，那之前的路径将不会被渲染。

```tsx
() => void
```

##### createCircularGradient

创建一个圆形的渐变颜色。起点在圆心，终点在圆环。返回的`CanvasGradient`对象需要使用 [CanvasGradient.addColorStop()](https://docs.taro.zone/docs/apis/canvas/CanvasGradient#addcolorstop) 来指定渐变点，至少要两个。

```tsx
(x: number, y: number, r: number) => CanvasGradient
```

| 参数 | 说明 |
| --- | --- |
| x | 圆心的 x 坐标 |
| y | 圆心的 y 坐标 |
| r | 圆的半径 |

##### createLinearGradient

创建一个线性的渐变颜色。返回的`CanvasGradient`对象需要使用 [CanvasGradient.addColorStop()](https://docs.taro.zone/docs/apis/canvas/CanvasGradient#addcolorstop) 来指定渐变点，至少要两个。

```tsx
(x0: number, y0: number, x1: number, y1: number) => CanvasGradient
```

| 参数 | 说明 |
| --- | --- |
| x0 | 起点的 x 坐标 |
| y0 | 起点的 y 坐标 |
| x1 | 终点的 x 坐标 |
| y1 | 终点的 y 坐标 |

##### createPattern

对指定的图像创建模式的方法，可在指定的方向上重复元图像

```tsx
(image: string, repetition: keyof Repetition) => CanvasPattern | Promise<CanvasPattern>
```

| 参数 | 说明 |
| --- | --- |
| image | 重复的图像源，仅支持包内路径和临时路径 |
| repetition | 如何重复图像 |

##### draw

将之前在绘图上下文中的描述（路径、变形、样式）画到 canvas 中。

> Web: 第二次调用 draw 前需要等待上一次 draw 调用结束后再调用，否则新的一次 draw 调用栈不会清空而导致结果异常。

```tsx
(reserve?: boolean, callback?: (...args: any[]) => any, useHardwareAccelerate?: boolean) => void | Promise<void>
```

| 参数 | 说明 |
| --- | --- |
| reserve | 本次绘制是否接着上一次绘制。即 reserve 参数为 false，则在本次调用绘制之前 native 层会先清空画布再继续绘制；若 reserve 参数为 true，则保留当前画布上的内容，本次调用 drawCanvas 绘制的内容覆盖在上面，默认 false。 |
| callback | 绘制完成后执行的回调函数 |

##### drawImage

绘制图像到画布

```tsx
{ (imageResource: string, dx: number, dy: number): void; (imageResource: string, dx: number, dy: number, dWidth: number, dHeight: number): void; (imageResource: string, sx: number, sy: number, sWidth: number, sHeight: number, dx: number, dy: number, dWidth: number, dHeight: number): void; }
```

| 参数 | 说明 |
| --- | --- |
| imageResource | 所要绘制的图片资源（网络图片要通过 getImageInfo / downloadFile 先下载） |
| sx | 需要绘制到画布中的，imageResource的矩形（裁剪）选择框的左上角 x 坐标 |
| sy | 需要绘制到画布中的，imageResource的矩形（裁剪）选择框的左上角 y 坐标 |
| sWidth | 需要绘制到画布中的，imageResource的矩形（裁剪）选择框的宽度 |
| sHeight | 需要绘制到画布中的，imageResource的矩形（裁剪）选择框的高度 |
| dx | imageResource的左上角在目标 canvas 上 x 轴的位置 |
| dy | imageResource的左上角在目标 canvas 上 y 轴的位置 |
| dWidth | 在目标画布上绘制imageResource的宽度，允许对绘制的imageResource进行缩放 |
| dHeight | 在目标画布上绘制imageResource的高度，允许对绘制的imageResource进行缩放 |

##### fill

对当前路径中的内容进行填充。默认的填充色为黑色。

```tsx
() => void
```

##### fillRect

填充一个矩形。用 [`setFillStyle`](https://docs.taro.zone/docs/apis/canvas/CanvasContext#setfillstyle) 设置矩形的填充色，如果没设置默认是黑色。

```tsx
(x: number, y: number, width: number, height: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 矩形路径左上角的横坐标 |
| y | 矩形路径左上角的纵坐标 |
| width | 矩形路径的宽度 |
| height | 矩形路径的高度 |

##### fillText

在画布上绘制被填充的文本

```tsx
(text: string, x: number, y: number, maxWidth?: number) => void
```

| 参数 | 说明 |
| --- | --- |
| text | 在画布上输出的文本 |
| x | 绘制文本的左上角 x 坐标位置 |
| y | 绘制文本的左上角 y 坐标位置 |
| maxWidth | 需要绘制的最大宽度，可选 |

##### lineTo

增加一个新点，然后创建一条从上次指定点到目标点的线。用 `stroke` 方法来画线条

```tsx
(x: number, y: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 目标位置的 x 坐标 |
| y | 目标位置的 y 坐标 |

##### measureText

测量文本尺寸信息。目前仅返回文本宽度(width)。同步接口。

```tsx
(text: string) => TextMetrics
```

| 参数 | 说明 |
| --- | --- |
| text | 要测量的文本 |

##### moveTo

把路径移动到画布中的指定点，不创建线条。用 `stroke` 方法来画线条

```tsx
(x: number, y: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 目标位置的 x 坐标 |
| y | 目标位置的 y 坐标 |

##### quadraticCurveTo

创建二次贝塞尔曲线路径。曲线的起始点为路径中前一个点。

针对 moveTo(20, 20) quadraticCurveTo(20, 100, 200, 20) 的三个关键坐标如下：

- 红色：起始点(20, 20)
- 蓝色：控制点(20, 100)
- 绿色：终止点(200, 20)

```tsx
(cpx: number, cpy: number, x: number, y: number) => void
```

| 参数 | 说明 |
| --- | --- |
| cpx | 贝塞尔控制点的 x 坐标 |
| cpy | 贝塞尔控制点的 y 坐标 |
| x | 结束点的 x 坐标 |
| y | 结束点的 y 坐标 |

##### rect

创建一个矩形路径。需要用 [`fill`](https://docs.taro.zone/docs/apis/canvas/CanvasContext#fill) 或者 [`stroke`](https://docs.taro.zone/docs/apis/canvas/CanvasContext#stroke) 方法将矩形真正的画到 `canvas` 中

```tsx
(x: number, y: number, width: number, height: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 矩形路径左上角的横坐标 |
| y | 矩形路径左上角的纵坐标 |
| width | 矩形路径的宽度 |
| height | 矩形路径的高度 |

##### reset

重置绘图上下文状态

```tsx
() => void
```

##### restore

恢复之前保存的绘图上下文

```tsx
() => void
```

##### rotate

以原点为中心顺时针旋转当前坐标轴。多次调用旋转的角度会叠加。原点可以用 `translate` 方法修改。

```tsx
(rotate: number) => void
```

| 参数 | 说明 |
| --- | --- |
| rotate | 旋转角度，以弧度计 degrees * Math.PI/180；degrees 范围为 0-360 |

##### save

保存绘图上下文。

```tsx
() => void
```

##### scale

在调用后，之后创建的路径其横纵坐标会被缩放。多次调用倍数会相乘。

```tsx
(scaleWidth: number, scaleHeight: number) => void
```

| 参数 | 说明 |
| --- | --- |
| scaleWidth | 横坐标缩放的倍数 (1 = 100%，0.5 = 50%，2 = 200%) |
| scaleHeight | 纵坐标轴缩放的倍数 (1 = 100%，0.5 = 50%，2 = 200%) |

##### setFillStyle

设置填充色。

```tsx
(color: string | CanvasGradient) => void
```

| 参数 | 说明 |
| --- | --- |
| color | 填充的颜色，默认颜色为 black。 |

##### setFontSize

设置字体的字号

```tsx
(fontSize: number) => void
```

| 参数 | 说明 |
| --- | --- |
| fontSize | 字体的字号 |

##### setGlobalAlpha

设置全局画笔透明度。

```tsx
(alpha: number) => void
```

| 参数 | 说明 |
| --- | --- |
| alpha | 透明度。范围 0-1，0 表示完全透明，1 表示完全不透明。 |

##### setLineCap

设置线条的端点样式

```tsx
(lineCap: keyof LineCap) => void
```

| 参数 | 说明 |
| --- | --- |
| lineCap | 线条的结束端点样式 |

##### setLineDash

设置虚线样式。

```tsx
(pattern: number[], offset: number) => void
```

| 参数 | 说明 |
| --- | --- |
| pattern | 一组描述交替绘制线段和间距（坐标空间单位）长度的数字 |
| offset | 虚线偏移量 |

##### setLineJoin

设置线条的交点样式

```tsx
(lineJoin: keyof LineJoin) => void
```

| 参数 | 说明 |
| --- | --- |
| lineJoin | 线条的结束交点样式 |

##### setLineWidth

设置线条的宽度

```tsx
(lineWidth: number) => void
```

| 参数 | 说明 |
| --- | --- |
| lineWidth | 线条的宽度，单位px |

##### setMiterLimit

设置最大斜接长度。斜接长度指的是在两条线交汇处内角和外角之间的距离。当 [CanvasContext.setLineJoin()](https://docs.taro.zone/docs/apis/canvas/CanvasContext#setlinejoin) 为 miter 时才有效。超过最大倾斜长度的，连接处将以 lineJoin 为 bevel 来显示。

```tsx
(miterLimit: number) => void
```

| 参数 | 说明 |
| --- | --- |
| miterLimit | 最大斜接长度 |

##### setShadow

设定阴影样式。

```tsx
(offsetX: number, offsetY: number, blur: number, color: string) => void
```

| 参数 | 说明 |
| --- | --- |
| offsetX | 阴影相对于形状在水平方向的偏移，默认值为 0。 |
| offsetY | 阴影相对于形状在竖直方向的偏移，默认值为 0。 |
| blur | 阴影的模糊级别，数值越大越模糊。范围 0- 100。，默认值为 0。 |
| color | 阴影的颜色。默认值为 black。 |

##### setStrokeStyle

设置描边颜色。

```tsx
(color: string | CanvasGradient) => void
```

| 参数 | 说明 |
| --- | --- |
| color | 描边的颜色，默认颜色为 black。 |

##### setTextAlign

设置文字的对齐

```tsx
(align: keyof Align) => void
```

| 参数 | 说明 |
| --- | --- |
| align | 文字的对齐方式 |

##### setTextBaseline

设置文字的竖直对齐

```tsx
(textBaseline: keyof TextBaseline) => void
```

| 参数 | 说明 |
| --- | --- |
| textBaseline | 文字的竖直对齐方式 |

##### setTransform

使用矩阵重新设置（覆盖）当前变换的方法

```tsx
{ (scaleX: number, skewX: number, skewY: number, scaleY: number, translateX: number, translateY: number): void; (scaleX: number, skewY: number, skewX: number, scaleY: number, translateX: number, translateY: number): void; (scaleX: number, scaleY: number, skewX: number, skewY: number, translateX: number, translateY: ...
```

| 参数 | 说明 |
| --- | --- |
| scaleX | 水平缩放 |
| skewX | 水平倾斜 |
| skewY | 垂直倾斜 |
| scaleY | 垂直缩放 |
| translateX | 水平移动 |
| translateY | 垂直移动 |

##### stroke

画出当前路径的边框。默认颜色色为黑色。

```tsx
() => void
```

##### strokeRect

画一个矩形(非填充)。 用 [`setStrokeStyle`](https://docs.taro.zone/docs/apis/canvas/CanvasContext#setstrokestyle) 设置矩形线条的颜色，如果没设置默认是黑色。

```tsx
(x: number, y: number, width: number, height: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 矩形路径左上角的横坐标 |
| y | 矩形路径左上角的纵坐标 |
| width | 矩形路径的宽度 |
| height | 矩形路径的高度 |

##### strokeText

给定的 (x, y) 位置绘制文本描边的方法

```tsx
(text: string, x: number, y: number, maxWidth?: number) => void
```

| 参数 | 说明 |
| --- | --- |
| text | 要绘制的文本 |
| x | 文本起始点的 x 轴坐标 |
| y | 文本起始点的 y 轴坐标 |
| maxWidth | 需要绘制的最大宽度，可选 |

##### transform

使用矩阵多次叠加当前变换的方法
使用矩阵叠加当前变换。矩阵由方法的参数进行描述，可以缩放、旋转、移动和倾斜上下文

```tsx
{ (scaleX: number, skewX: number, skewY: number, scaleY: number, translateX: number, translateY: number): void; (scaleX: number, skewY: number, skewX: number, scaleY: number, translateX: number, translateY: number): void; (scaleX: number, scaleY: number, skewX: number, skewY: number, translateX: number, translateY: ...
```

| 参数 | 说明 |
| --- | --- |
| scaleX | 水平缩放 |
| skewX | 水平倾斜 |
| skewY | 垂直倾斜 |
| scaleY | 垂直缩放 |
| translateX | 水平移动 |
| translateY | 垂直移动 |

##### translate

对当前坐标系的原点 (0, 0) 进行变换。默认的坐标系原点为页面左上角。

```tsx
(x: number, y: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 水平坐标平移量 |
| y | 竖直坐标平移量 |

##### Repetition

参数 repetition 可选值

| 参数 | 说明 |
| --- | --- |
| repeat | 水平竖直方向都重复 |
| repeat-x | 水平方向重复 |
| repeat-y | 竖直方向重复 |
| no-repeat | 不重复 |

##### LineCap

参数 lineCap 可选值

| 参数 | 说明 |
| --- | --- |
| butt | 向线条的每个末端添加平直的边缘。 |
| round | 向线条的每个末端添加圆形线帽。 |
| square | 向线条的每个末端添加正方形线帽。 |

##### LineJoin

参数 lineJoin 可选值

| 参数 | 说明 |
| --- | --- |
| bevel | 斜角 |
| round | 圆角 |
| miter | 尖角 |

##### Align

参数 align 可选值

| 参数 | 说明 |
| --- | --- |
| left | 左对齐 |
| center | 居中对齐 |
| right | 右对齐 |

##### TextBaseline

参数 textBaseline 可选值

| 参数 | 说明 |
| --- | --- |
| top | 顶部对齐 |
| bottom | 底部对齐 |
| middle | 居中对齐 |
| normal |  |
| hanging | 文本基线为悬挂基线。<br />Web |
| alphabetic | 文本基线是标准的字母基线<br />Web |
| ideographic | 文字基线是表意字基线。如果字符本身超出了alphabetic 基线，那么ideograhpic基线位置在字符本身的底部。<br />Web |

### CanvasGradient

创建 canvas 的绘图上下文 CanvasContext 对象

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/CanvasGradient)

##### addColorStop

添加颜色的渐变点。小于最小 stop 的部分会按最小 stop 的 color 来渲染，大于最大 stop 的部分会按最大 stop 的 color 来渲染

```tsx
(stop: number, color: string) => void
```

| 参数 | 说明 |
| --- | --- |
| stop | 表示渐变中开始与结束之间的位置，范围 0-1。 |
| color | 渐变点的颜色。 |

### Color

颜色。可以用以下几种方式来表示 canvas 中使用的颜色：

- RGB 颜色： 如 `'rgb(255, 0, 0)'`
- RGBA 颜色：如 `'rgba(255, 0, 0, 0.3)'`
- 16 进制颜色： 如 `'#FF0000'`
- 预定义的颜色： 如 `'red'`

其中预定义颜色有以下148个：
*注意**: Color Name 大小写不敏感

| Color Name           | HEX     |
| -------------------- | ------- |
| AliceBlue            | #F0F8FF |
| AntiqueWhite         | #FAEBD7 |
| Aqua                 | #00FFFF |
| Aquamarine           | #7FFFD4 |
| Azure                | #F0FFFF |
| Beige                | #F5F5DC |
| Bisque               | #FFE4C4 |
| Black                | #000000 |
| BlanchedAlmond       | #FFEBCD |
| Blue                 | #0000FF |
| BlueViolet           | #8A2BE2 |
| Brown                | #A52A2A |
| BurlyWood            | #DEB887 |
| CadetBlue            | #5F9EA0 |
| Chartreuse           | #7FFF00 |
| Chocolate            | #D2691E |
| Coral                | #FF7F50 |
| CornflowerBlue       | #6495ED |
| Cornsilk             | #FFF8DC |
| Crimson              | #DC143C |
| Cyan                 | #00FFFF |
| DarkBlue             | #00008B |
| DarkCyan             | #008B8B |
| DarkGoldenRod        | #B8860B |
| DarkGray             | #A9A9A9 |
| DarkGrey             | #A9A9A9 |
| DarkGreen            | #006400 |
| DarkKhaki            | #BDB76B |
| DarkMagenta          | #8B008B |
| DarkOliveGreen       | #556B2F |
| DarkOrange           | #FF8C00 |
| DarkOrchid           | #9932CC |
| DarkRed              | #8B0000 |
| DarkSalmon           | #E9967A |
| DarkSeaGreen         | #8FBC8F |
| DarkSlateBlue        | #483D8B |
| DarkSlateGray        | #2F4F4F |
| DarkSlateGrey        | #2F4F4F |
| DarkTurquoise        | #00CED1 |
| DarkViolet           | #9400D3 |
| DeepPink             | #FF1493 |
| DeepSkyBlue          | #00BFFF |
| DimGray              | #696969 |
| DimGrey              | #696969 |
| DodgerBlue           | #1E90FF |
| FireBrick            | #B22222 |
| FloralWhite          | #FFFAF0 |
| ForestGreen          | #228B22 |
| Fuchsia              | #FF00FF |
| Gainsboro            | #DCDCDC |
| GhostWhite           | #F8F8FF |
| Gold                 | #FFD700 |
| GoldenRod            | #DAA520 |
| Gray                 | #808080 |
| Grey                 | #808080 |
| Green                | #008000 |
| GreenYellow          | #ADFF2F |
| HoneyDew             | #F0FFF0 |
| HotPink              | #FF69B4 |
| IndianRed            | #CD5C5C |
| Indigo               | #4B0082 |
| Ivory                | #FFFFF0 |
| Khaki                | #F0E68C |
| Lavender             | #E6E6FA |
| LavenderBlush        | #FFF0F5 |
| LawnGreen            | #7CFC00 |
| LemonChiffon         | #FFFACD |
| LightBlue            | #ADD8E6 |
| LightCoral           | #F08080 |
| LightCyan            | #E0FFFF |
| LightGoldenRodYellow | #FAFAD2 |
| LightGray            | #D3D3D3 |
| LightGrey            | #D3D3D3 |
| LightGreen           | #90EE90 |
| LightPink            | #FFB6C1 |
| LightSalmon          | #FFA07A |
| LightSeaGreen        | #20B2AA |
| LightSkyBlue         | #87CEFA |
| LightSlateGray       | #778899 |
| LightSlateGrey       | #778899 |
| LightSteelBlue       | #B0C4DE |
| LightYellow          | #FFFFE0 |
| Lime                 | #00FF00 |
| LimeGreen            | #32CD32 |
| Linen                | #FAF0E6 |
| Magenta              | #FF00FF |
| Maroon               | #800000 |
| MediumAquaMarine     | #66CDAA |
| MediumBlue           | #0000CD |
| MediumOrchid         | #BA55D3 |
| MediumPurple         | #9370DB |
| MediumSeaGreen       | #3CB371 |
| MediumSlateBlue      | #7B68EE |
| MediumSpringGreen    | #00FA9A |
| MediumTurquoise      | #48D1CC |
| MediumVioletRed      | #C71585 |
| MidnightBlue         | #191970 |
| MintCream            | #F5FFFA |
| MistyRose            | #FFE4E1 |
| Moccasin             | #FFE4B5 |
| NavajoWhite          | #FFDEAD |
| Navy                 | #000080 |
| OldLace              | #FDF5E6 |
| Olive                | #808000 |
| OliveDrab            | #6B8E23 |
| Orange               | #FFA500 |
| OrangeRed            | #FF4500 |
| Orchid               | #DA70D6 |
| PaleGoldenRod        | #EEE8AA |
| PaleGreen            | #98FB98 |
| PaleTurquoise        | #AFEEEE |
| PaleVioletRed        | #DB7093 |
| PapayaWhip           | #FFEFD5 |
| PeachPuff            | #FFDAB9 |
| Peru                 | #CD853F |
| Pink                 | #FFC0CB |
| Plum                 | #DDA0DD |
| PowderBlue           | #B0E0E6 |
| Purple               | #800080 |
| RebeccaPurple        | #663399 |
| Red                  | #FF0000 |
| RosyBrown            | #BC8F8F |
| RoyalBlue            | #4169E1 |
| SaddleBrown          | #8B4513 |
| Salmon               | #FA8072 |
| SandyBrown           | #F4A460 |
| SeaGreen             | #2E8B57 |
| SeaShell             | #FFF5EE |
| Sienna               | #A0522D |
| Silver               | #C0C0C0 |
| SkyBlue              | #87CEEB |
| SlateBlue            | #6A5ACD |
| SlateGray            | #708090 |
| SlateGrey            | #708090 |
| Snow                 | #FFFAFA |
| SpringGreen          | #00FF7F |
| SteelBlue            | #4682B4 |
| Tan                  | #D2B48C |
| Teal                 | #008080 |
| Thistle              | #D8BFD8 |
| Tomato               | #FF6347 |
| Turquoise            | #40E0D0 |
| Violet               | #EE82EE |
| Wheat                | #F5DEB3 |
| White                | #FFFFFF |
| WhiteSmoke           | #F5F5F5 |
| Yellow               | #FFFF00 |
| YellowGreen          | #9ACD32 |

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/Color)

### Image

图片对象

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/Image)

#### 方法

| 参数 | 说明 |
| --- | --- |
| src | 图片的 URL |
| height | 图片的真实高度 |
| width | 图片的真实宽度 |
| referrerPolicy | origin: 发送完整的referrer; no-referrer: 不发送。<br />格式固定为 https://servicewechat.com/{appid}/{version}/page-frame.html，其中 {appid} 为小程序的 appid，{version} 为小程序的版本号，版本号为 0 表示为开发版、体验版以及审核版本，版本号为 devtools 表示为开发者工具，其余为正式版本 |
| onerror | 图片加载发生错误后触发的回调函数 |
| onload | 图片加载完成后触发的回调函数 |

### ImageData

ImageData 对象

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/ImageData)

#### 方法

| 参数 | 说明 |
| --- | --- |
| width | 使用像素描述 ImageData 的实际宽度 |
| height | 使用像素描述 ImageData 的实际高度 |
| data | 一维数组，包含以 RGBA 顺序的数据，数据使用 0 至 255（包含）的整数表示 |

### OffscreenCanvas

离屏 canvas 实例，可通过 Taro.createOffscreenCanvas 创建。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/OffscreenCanvas)

#### 方法

| 参数 | 说明 |
| --- | --- |
| width | 画布宽度 |
| height | 画布高度 |

##### createImage

创建一个图片对象。支持在 2D Canvas 和 WebGL Canvas 下使用, 但不支持混用 2D 和 WebGL 的方法

> 注意不允许混用 webgl 和 2d 画布创建的图片对象，使用时请注意尽量使用 canvas 自身的 createImage 创建图片对象。

```tsx
() => Image
```

##### getContext

该方法返回 OffscreenCanvas 的绘图上下文

> 当前仅支持获取 WebGL 绘图上下文

```tsx
(contextType: "webgl" | "2d") => RenderingContext
```

| 参数 | 说明 |
| --- | --- |
| contextType |  |

### Path2D

Canvas 2D API 的接口 Path2D 用来声明路径，此路径稍后会被CanvasRenderingContext2D 对象使用。CanvasRenderingContext2D 接口的 路径方法 也存在于 Path2D 这个接口中，允许你在 canvas 中根据需要创建可以保留并重用的路径。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/Path2D)

##### addPath

添加路径到当前路径。

```tsx
(path: Path2D) => void
```

| 参数 | 说明 |
| --- | --- |
| path | 添加的 Path2D 路径 |

##### arc

添加一段圆弧路径

```tsx
(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise: boolean) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 圆心横坐标 |
| y | 圆心纵坐标 |
| radius | 圆形半径，必须为正数 |
| startAngle | 圆弧开始角度 |
| endAngle | 圆弧结束角度 |
| counterclockwise | 是否逆时针绘制。如果传 true, 则会从 endAngle 开始绘制到 startAngle |

##### arcTo

通过给定控制点添加一段圆弧路径

```tsx
(x1: number, y1: number, x2: number, y2: number, radius: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x1 | 第一个控制点横坐标 |
| y1 | 第一个控制点纵坐标 |
| x2 | 第二个控制点横坐标 |
| y2 | 第二个控制点纵坐标 |
| radius | 圆形半径，必须为非负数 |

##### bezierCurveTo

添加三次贝塞尔曲线路径

```tsx
(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => void
```

| 参数 | 说明 |
| --- | --- |
| cp1x | 第一个控制点横坐标 |
| cp1y | 第一个控制点纵坐标 |
| cp2x | 第二个控制点横坐标 |
| cp2y | 第二个控制点纵坐标 |
| x | 结束点横坐标 |
| y | 结束点纵坐标 |

##### closePath

闭合路径到起点

```tsx
() => void
```

##### ellipse

添加椭圆弧路径

```tsx
(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise: boolean) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 椭圆圆心横坐标 |
| y | 椭圆圆心纵坐标 |
| radiusX | 椭圆长轴半径，必须为非负数 |
| radiusY | 椭圆短轴半径，必须为非负数 |
| rotation | 椭圆旋转角度 |
| startAngle | 圆弧开始角度 |
| endAngle | 圆弧结束角度 |
| counterclockwise | 是否逆时针绘制。如果传 true, 则会从 endAngle 开始绘制到 startAngle |

##### lineTo

添加直线路径

```tsx
(x: number, y: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 结束点横坐标 |
| y | 结束点纵坐标 |

##### moveTo

移动路径开始点

```tsx
(x: number, y: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 横坐标 |
| y | 纵坐标 |

##### quadraticCurveTo

添加二次贝塞尔曲线路径

```tsx
(cpx: number, cpy: number, x: number, y: number) => void
```

| 参数 | 说明 |
| --- | --- |
| cpx | 控制点横坐标 |
| cpy | 控制点纵坐标 |
| x | 结束点横坐标 |
| y | 结束点纵坐标 |

##### rect

添加方形路径

```tsx
(x: number, y: number, width: number, height: number) => void
```

| 参数 | 说明 |
| --- | --- |
| x | 开始点横坐标 |
| y | 开始点纵坐标 |
| width | 方形宽度，正数向右，负数向左 |
| height | 方形高度，正数向下，负数向上 |

### RenderingContext

Canvas 绘图上下文。

****

- 通过 Canvas.getContext('2d') 接口可以获取 CanvasRenderingContext2D 对象，实现了 [HTML Canvas 2D Context](https://www.w3.org/TR/2dcontext/) 定义的属性、方法。
- 通过 Canvas.getContext('webgl') 或 OffscreenCanvas.getContext('webgl') 接口可以获取 WebGLRenderingContext 对象，实现了 [WebGL 1.0](https://www.khronos.org/registry/webgl/specs/latest/1.0/) 定义的所有属性、方法、常量。
- CanvasRenderingContext2D 的 drawImage 方法 2.10.0 起支持传入通过 SelectorQuery 获取的 video 对象，2.29.0 起支持传入开启了自定义渲染的 LivePusherContext 对象。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/canvas/RenderingContext)

## 媒体

### Taro.createMapContext(mapId, component)

创建 [map](https://docs.taro.zone/docs/components/maps/map) 上下文 [MapContext](https://docs.taro.zone/docs/apis/media/map/MapContext) 对象。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/map/createMapContext)

### MapContext

`MapContext` 实例，可通过 [Taro.createMapContext](./createMapContext) 获取。
`MapContext` 通过 id 跟一个 map 组件绑定，操作对应的 map 组件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/map/MapContext)

##### getCenterLocation

获取当前地图中心的经纬度。返回的是 gcj02 坐标系，可以用于 [Taro.openLocation()](https://docs.taro.zone/docs/apis/location/openLocation)

```tsx
(option?: GetCenterLocationOption) => Promise<GetCenterLocationSuccessCallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setLocMarkerIcon

设置定位点图标，支持网络路径、本地路径、代码包路径

```tsx
(option?: SetLocMarkerIconOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### moveToLocation

将地图中心移置当前定位点，此时需设置地图组件 show-location 为true。

```tsx
(option: MoveToLocationOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### translateMarker

平移marker，带动画

```tsx
(option: TranslateMarkerOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### moveAlong

沿指定路径移动 marker，用于轨迹回放等场景。动画完成时触发回调事件，若动画进行中，对同一 marker 再次调用 moveAlong 方法，前一次的动画将被打断。

```tsx
(object: any) => any
```

##### includePoints

缩放视野展示所有经纬度

```tsx
(option: IncludePointsOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getRegion

获取当前地图的视野范围

```tsx
(option?: GetRegionOption) => Promise<GetRegionSuccessCallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getRotate

获取当前地图的旋转角

```tsx
(option?: GetRotateOption) => Promise<GetRotateSuccessCallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getSkew

获取当前地图的倾斜角

```tsx
(option?: GetSkewOption) => Promise<GetSkewSuccessCallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getScale

获取当前地图的缩放级别

```tsx
(option?: GetScaleOption) => Promise<GetScaleSuccessCallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setCenterOffset

设置地图中心点偏移，向后向下为增长，屏幕比例范围(0.25~0.75)，默认偏移为[0.5, 0.5]

```tsx
(option: SetCenterOffsetOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### removeCustomLayer

移除个性化图层。

```tsx
(option: RemoveCustomLayerOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### addCustomLayer

添加个性化图层。图层创建参考文档

```tsx
(option: AddCustomLayerOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### addGroundOverlay

创建自定义图片图层，图片会随着地图缩放而缩放。

```tsx
(option: AddGroundLayerOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### addVisualLayer

添加可视化图层。需要刷新时，interval 可设置的最小值为 15 s。

```tsx
(option: AddVisualLayerOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### removeVisualLayer

移除可视化图层。

```tsx
(option: RemoveVisualLayerOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### addArc

添加弧线，途经点与夹角必须设置一个。途经点必须在起终点有效坐标范围内，否则不能生成正确的弧线，同时设置夹角角度时，以夹角角度为准。夹角定义为起点到终点，与起点外切线逆时针旋转的角度。

```tsx
(option: AddArcOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### removeArc

删除弧线。

```tsx
(option: RemoveArcOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setBoundary

限制地图的显示范围。此接口同时会限制地图的最小缩放整数级别。

```tsx
(option: SetBoundaryOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### updateGroundOverlay

更新自定义图片图层。

```tsx
(option: UpdateGroundOverlayOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### removeGroundOverlay

移除自定义图片图层。

```tsx
(option: RemoveGroundOverlayOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### toScreenLocation

获取经纬度对应的屏幕坐标，坐标原点为地图左上角。

```tsx
(option: ToScreenLocationOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### fromScreenLocation

获取屏幕上的点对应的经纬度，坐标原点为地图左上角。

```tsx
(option: FromScreenLocationOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### openMapApp

拉起地图APP选择导航。

```tsx
(option: OpenMapAppOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### addMarkers

添加 marker。

```tsx
(option: AddMarkersOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### removeMarkers

移除 marker。

```tsx
(option: RemoveMarkersOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### initMarkerCluster

初始化点聚合的配置，未调用时采用默认配置。

```tsx
(option?: InitMarkerClusterOption) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### on

监听地图事件。

```tsx
(event: keyof MapEvent, callback: (res: MapEventMarkerClusterCreate | MapEventMarkerClusterClick) => void) => void
```

| 参数 | 说明 |
| --- | --- |
| event | 事件名 |
| callback | 事件的回调函数 |

##### GetCenterLocationOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### GetCenterLocationSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| latitude | 纬度 |
| longitude | 经度 |
| errMsg | 调用结果 |

##### SetLocMarkerIconOption

| 参数 | 说明 |
| --- | --- |
| iconPath | 图标路径，支持网络路径、本地路径、代码包路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### GetRegionOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### GetRegionSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| northeast | 东北角经纬度 |
| southwest | 西南角经纬度 |

##### GetRotateOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### GetRotateSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| rotate | 旋转角 |
| errMsg | 调用结果 |

##### GetScaleOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### GetScaleSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| scale | 缩放值 |
| errMsg | 调用结果 |

##### GetSkewOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### GetSkewSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| skew | 倾斜角 |
| errMsg | 调用结果 |

##### IncludePointsOption

| 参数 | 说明 |
| --- | --- |
| points | 要显示在可视区域内的坐标点列表 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| padding | 坐标点形成的矩形边缘到地图边缘的距离，单位像素。格式为[上,右,下,左]，安卓上只能识别数组第一项，上下左右的padding一致。开发者工具暂不支持padding参数。 |
| success | 接口调用成功的回调函数 |

##### MapPosition

坐标点

| 参数 | 说明 |
| --- | --- |
| latitude | 纬度 |
| longitude | 经度 |

##### MapBoundary

经纬度范围

| 参数 | 说明 |
| --- | --- |
| southwest | 西南角经纬度 |
| northeast | 东北角经纬度 |

##### MoveToLocationOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| latitude | 纬度 |
| longitude | 经度 |
| success | 接口调用成功的回调函数 |

##### TranslateMarkerOption

| 参数 | 说明 |
| --- | --- |
| autoRotate | 移动过程中是否自动旋转 marker |
| destination | 指定 marker 移动到的目标点 |
| markerId | 指定 marker |
| rotate | marker 的旋转角度 |
| animationEnd | 动画结束回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| duration | 动画持续时长，平移与旋转分别计算 |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SetCenterOffsetOption

| 参数 | 说明 |
| --- | --- |
| offset | 偏移量，两位数组 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### RemoveCustomLayerOption

| 参数 | 说明 |
| --- | --- |
| layerId | 个性化图层id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### AddCustomLayerOption

| 参数 | 说明 |
| --- | --- |
| layerId | 个性化图层id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### AddGroundLayerOption

| 参数 | 说明 |
| --- | --- |
| id | 图片图层 id |
| src | 图片路径，支持网络图片、临时路径、代码包路径 |
| bounds | 图片覆盖的经纬度范围 |
| visible | 是否可见 |
| zIndex | 图层绘制顺序 |
| opacity | 图层透明度 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### AddVisualLayerOption

| 参数 | 说明 |
| --- | --- |
| layerId | 个性化图层id（[创建图层指引](https://lbs.qq.com/dev/console/layers/layerEdit)) |
| interval | 刷新周期，单位秒 |
| zIndex | 图层绘制顺序 |
| opacity | 图层透明度 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### RemoveVisualLayerOption

| 参数 | 说明 |
| --- | --- |
| layerId | 可视化图层 id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### AddArcOption

| 参数 | 说明 |
| --- | --- |
| id | 圆弧 id |
| start | 起始点 |
| end | 终点 |
| pass | 途经点 |
| angle | 夹角角度 |
| width | 线宽 |
| color | 线的颜色 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### RemoveArcOption

| 参数 | 说明 |
| --- | --- |
| id | 圆弧 id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SetBoundaryOption

| 参数 | 说明 |
| --- | --- |
| southwest | 西南角经纬度 |
| northeast | 东北角经纬度 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### UpdateGroundOverlayOption

| 参数 | 说明 |
| --- | --- |
| id | 图片图层 id |
| src | 图片路径，支持网络图片、临时路径、代码包路径 |
| bounds | 图片覆盖的经纬度范围 |
| visible | 是否可见 |
| zIndex | 图层绘制顺序 |
| opacity | 图层透明度 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### RemoveGroundOverlayOption

| 参数 | 说明 |
| --- | --- |
| id | 图片图层 id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ToScreenLocationOption

| 参数 | 说明 |
| --- | --- |
| latitude | 纬度 |
| longitude | 经度 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### FromScreenLocationOption

| 参数 | 说明 |
| --- | --- |
| x | x 坐标值 |
| y | y 坐标值 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### OpenMapAppOption

| 参数 | 说明 |
| --- | --- |
| longitude | 目的地经度 |
| latitude | 目的地纬度 |
| destination | 目的地名称 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### AddMarkersOption

| 参数 | 说明 |
| --- | --- |
| markers | 同传入 map 组件的 marker 属性 |
| clear | 是否先清空地图上所有 marker |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### RemoveMarkersOption

| 参数 | 说明 |
| --- | --- |
| markerIds | marker 的 id 集合。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### InitMarkerClusterOption

| 参数 | 说明 |
| --- | --- |
| enableDefaultStyle | 启用默认的聚合样式 |
| zoomOnClick | 点击已经聚合的标记点时是否实现聚合分离 |
| gridSize | 聚合算法的可聚合距离，即距离小于该值的点会聚合至一起，以像素为单位 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### MapEvent

event 的合法值

| 参数 | 说明 |
| --- | --- |
| markerClusterCreate | 缩放或拖动导致新的聚合簇产生时触发，仅返回新创建的聚合簇信息 |
| markerClusterClick | 聚合簇的点击事件 |

##### MapEventMarkerClusterCreate

| 参数 | 说明 |
| --- | --- |
| clusters | 聚合簇数据 |

##### MapEventMarkerClusterClick

| 参数 | 说明 |
| --- | --- |
| cluster | 聚合簇 |

##### ClusterInfo

| 参数 | 说明 |
| --- | --- |
| clusterId | 聚合簇的 id |
| center | 聚合簇的坐标 |
| markerIds | 该聚合簇内的点标记数据数组 |

##### LatLng

| 参数 | 说明 |
| --- | --- |
| lat | 纬度值 |
| lng | 经度值 |

### Taro.saveImageToPhotosAlbum(option)

保存图片到系统相册。需要[用户授权](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html) scope.writePhotosAlbum

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/image/saveImageToPhotosAlbum)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 图片文件路径，可以是临时文件路径或永久文件路径，不支持网络图片路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.previewMedia(option)

预览图片和视频。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/image/previewMedia)

#### Sources

| 参数 | 说明 |
| --- | --- |
| url | 图片或视频的地址 |
| type | 资源的类型（图片或视频），默认值：image |
| poster | 视频的封面图片 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| sources | 需要预览的资源列表 |
| current | 当前显示的资源序号，默认值：0 |
| showmenu | 是否显示长按菜单	2.13.0，默认值：true |
| referrerPolicy | origin: 发送完整的referrer; no-referrer: 不发送。格式固定为 https://servicewechat.com/{appid}/{version}/page-frame.html，其中 {appid} 为小程序的 appid，{version} 为小程序的版本号，版本号为 0 表示为开发版、体验版以及审核版本，版本号为 devtools 表示为开发者工具，其余为正式版本；默认值：no-referrer |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.previewImage(option)

在新页面中全屏预览图片。预览的过程中用户可以进行保存图片、发送给朋友等操作。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/image/previewImage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| urls | 需要预览的图片链接列表。 |
| current | 当前显示图片的http链接 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getImageInfo(option)

获取图片信息。网络图片需先配置download域名才能生效。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/image/getImageInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| src | 图片的路径，可以是相对路径、临时文件路径、存储文件路径、网络图片路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| height | 图片原始高度，单位px。不考虑旋转。 |
| orientation | [拍照时设备方向](http://sylvana.net/jpegcrop/exif_orientation.html) |
| path | 图片的本地路径 |
| type | 图片格式 |
| width | 图片原始宽度，单位px。不考虑旋转。 |
| errMsg | 调用结果 |

#### Orientation

| 参数 | 说明 |
| --- | --- |
| up | 默认方向（手机横持拍照），对应 Exif 中的 1。或无 orientation 信息。 |
| up-mirrored | 同 up，但镜像翻转，对应 Exif 中的 2 |
| down | 旋转180度，对应 Exif 中的 3 |
| down-mirrored | 同 down，但镜像翻转，对应 Exif 中的 4 |
| left-mirrored | 同 left，但镜像翻转，对应 Exif 中的 5 |
| right | 顺时针旋转90度，对应 Exif 中的 6 |
| right-mirrored | 同 right，但镜像翻转，对应 Exif 中的 7 |
| left | 逆时针旋转90度，对应 Exif 中的 8 |

### Taro.editImage(option)

编辑图片接口

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/image/editImage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| src | 图片路径，图片的路径，支持本地路径、代码包路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 编辑后图片的临时文件路径 (本地路径) |

### Taro.compressImage(option)

压缩图片接口，可选压缩质量

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/image/compressImage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| src | 图片路径，图片的路径，可以是相对路径、临时文件路径、存储文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| quality | 压缩质量，范围0～100，数值越小，质量越低，压缩率越高（仅对jpg有效）。 |
| compressedWidth | 压缩后图片的宽度，单位为px，若不填写则默认以 compressedHeight 为准等比缩放。 |
| compressedHeight | 压缩后图片的高度，单位为px，若不填写则默认以 compressedWidth 为准等比缩放。 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 压缩后图片的临时文件路径 |
| errMsg | 调用结果 |

### Taro.chooseMessageFile(option)

从客户端会话选择文件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/image/chooseMessageFile)

#### 参数

| 参数 | 说明 |
| --- | --- |
| count | 最多可以选择的文件个数，可以 0～100 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| extension | 根据文件拓展名过滤，仅 type==file 时有效。每一项都不能是空字符串。默认不过滤。 |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |
| type | 所选的文件的类型 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFiles | 返回选择的文件的本地临时文件对象数组 |
| errMsg | 调用结果 |

#### ChooseFile

返回选择的文件的本地临时文件对象数组

| 参数 | 说明 |
| --- | --- |
| name | 选择的文件名称 |
| path | 本地临时文件路径 |
| size | 本地临时文件大小，单位 B |
| time | 选择的文件的会话发送时间，Unix时间戳，工具暂不支持此属性 |
| type | 选择的文件类型 |

#### SelectType

| 参数 | 说明 |
| --- | --- |
| all | 从所有文件选择 |
| video | 只能选择视频文件 |
| image | 只能选择图片文件 |
| file | 可以选择除了图片和视频之外的其它的文件 |

#### SelectedType

| 参数 | 说明 |
| --- | --- |
| video | 选择了视频文件 |
| image | 选择了图片文件 |
| file | 选择了除图片和视频的文件 |

### Taro.chooseImage(option)

从本地相册选择图片或使用相机拍照。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/image/chooseImage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| count | 最多可以选择的图片张数 |
| sizeType | 所选的图片的尺寸<br />微信 |
| sourceType | 选择图片的来源 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |
| imageId | 用来上传的input元素ID（仅Web<br />Web |

#### sizeType

图片的尺寸

| 参数 | 说明 |
| --- | --- |
| original | 原图 |
| compressed | compressed |

#### sourceType

图片的来源

| 参数 | 说明 |
| --- | --- |
| album | 从相册选图 |
| camera | 使用相机 |
| user | 使用前置摄像头(仅Web纯浏览器使用) |
| environment | 使用后置摄像头(仅Web纯浏览器) |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFilePaths | 图片的本地临时文件路径列表 |
| tempFiles | 图片的本地临时文件列表 |
| errMsg | 调用结果 |

#### ImageFile

图片的本地临时文件列表

| 参数 | 说明 |
| --- | --- |
| path | 本地临时文件路径 |
| size | 本地临时文件大小，单位 B |
| type | 文件的 MIME 类型<br />Web |
| originalFileObj | 原始的浏览器 File 对象<br />Web |

### Taro.cropImage(option)

裁剪图片接口

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/image/cropImage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| src | 图片路径，图片的路径，支持本地路径、代码包路径 |
| cropScale | 裁剪比例 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 剪裁后图片的临时文件路径 (本地路径) |

#### CropScale

| 参数 | 说明 |
| --- | --- |
| 1:1 | 宽高比为1比1 |
| 3:4 | 宽高比为3比4 |
| 4:3 | 宽高比为4比3 |
| 4:5 | 宽高比为4比5 |
| 5:4 | 宽高比为5比4 |
| 9:16 | 宽高比为9比16 |
| 16:9 | 宽高比为16比9 |

### Taro.saveVideoToPhotosAlbum(option)

保存视频到系统相册。支持mp4视频格式。需要[用户授权](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html) scope.writePhotosAlbum

**Bug & Tip：**

1.  `tip`: camera 参数在部分 Android 手机下由于系统 ROM 不支持无法生效

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video/saveVideoToPhotosAlbum)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 视频文件路径，可以是临时文件路径也可以是永久文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.openVideoEditor(option)

打开视频编辑器

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video/openVideoEditor)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 视频源的路径，只支持本地路径 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| duration | 剪辑后生成的视频文件的时长，单位毫秒（ms） |
| size | 剪辑后生成的视频文件大小，单位字节数（byte） |
| tempFilePath | 编辑后生成的视频文件的临时路径 |
| tempThumbPath | 编辑后生成的缩略图文件的临时路径 |

### Taro.getVideoInfo(option)

获取视频详细信息

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video/getVideoInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| src | 视频文件路径，可以是临时文件路径也可以是永久文件路径 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| orientation | 画面方向 |
| type | 视频格式 |
| duration | 视频长度 |
| size | 视频大小，单位 kB |
| height | 视频的长，单位 px |
| width | 视频的宽，单位 px |
| fps | 视频帧率 |
| bitrate | 视频码率，单位 kbps |

#### Orientation

| 参数 | 说明 |
| --- | --- |
| up | 默认 |
| down | 180 度旋转 |
| left | 逆时针旋转 90 度 |
| right | 顺时针旋转 90 度 |
| up-mirrored | 同 up，但水平翻转 |
| down-mirrored | 同 down，但水平翻转 |
| left-mirrored | 同 left，但垂直翻转 |
| right-mirrored | 同 right，但垂直翻转 |

### Taro.createVideoContext(id, component)

创建 video 上下文 VideoContext 对象。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video/createVideoContext)

### Taro.compressVideo(option)

压缩视频接口。
开发者可指定压缩质量 `quality` 进行压缩。当需要更精细的控制时，可指定 `bitrate`、`fps`、和 `resolution`，当 `quality` 传入时，这三个参数将被忽略。原视频的相关信息可通过 [getVideoInfo](https://docs.taro.zone/docs/apis/media/video/getVideoInfo) 获取。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video/compressVideo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| src | 视频文件路径，可以是临时文件路径也可以是永久文件路径 |
| quality | 压缩质量 |
| bitrate | 码率，单位 kbps |
| fps | 帧率 |
| resolution | 相对于原视频的分辨率比例，取值范围(0, 1] |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 压缩后的临时文件地址 |
| size | 压缩后的大小，单位 kB |

#### Quality

| 参数 | 说明 |
| --- | --- |
| low | 低 |
| medium | 中 |
| high | 高 |

### Taro.chooseVideo(option)

拍摄视频或从手机相册中选视频。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video/chooseVideo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| camera | 默认拉起的是前置或者后置摄像头。部分 Android 手机下由于系统 ROM 不支持无法生效 |
| compressed | 是否压缩所选择的视频文件<br />微信 |
| maxDuration | 拍摄视频最长拍摄时间，单位秒<br />微信 |
| sourceType | 视频选择的来源 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 选定视频的临时文件路径 |
| duration | 选定视频的时间长度 |
| size | 选定视频的数据量大小 |
| height | 返回选定视频的高度 |
| width | 返回选定视频的宽度 |
| errMsg | 调用结果 |

#### Camera

| 参数 | 说明 |
| --- | --- |
| back | 默认拉起后置摄像头 |
| front | 默认拉起前置摄像头 |

#### sourceType

| 参数 | 说明 |
| --- | --- |
| album | 从相册选择视频 |
| camera | 使用相机拍摄视频 |

### Taro.chooseMedia(option)

拍摄或从手机相册中选择图片或视频。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video/chooseMedia)

#### 参数

| 参数 | 说明 |
| --- | --- |
| count | 最多可以选择的文件个数 |
| mediaType | 文件类型 |
| sourceType | 图片和视频选择的来源 |
| maxDuration | 拍摄视频最长拍摄时间，单位秒。时间范围为 3s 至 60s 之间<br />微信 |
| sizeType | 是否压缩所选文件<br />微信 |
| camera | 仅在 sourceType 为 camera 时生效，使用前置或后置摄像头 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |
| mediaId | 用来上传的input元素ID<br />Web |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFiles | 本地临时文件列表 |
| type | 文件类型，有效值有 image 、video、mix |

#### ChooseMedia

本地临时文件列表

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 本地临时文件路径 (本地路径) |
| size | 本地临时文件大小，单位 B |
| duration | 视频的时间长度 |
| height | 视频的高度 |
| width | 视频的宽度 |
| thumbTempFilePath | 视频缩略图临时文件路径 |
| fileType | 选择的文件的类型 |
| originalFileObj | 原始的浏览器 File 对象<br />Web |

#### mediaType

| 参数 | 说明 |
| --- | --- |
| video | 只能拍摄视频或从相册选择视频 |
| image | 只能拍摄图片或从相册选择图片 |
| mix | 可同时选择图片和视频 |

#### sourceType

| 参数 | 说明 |
| --- | --- |
| album | 从相册选择 |
| camera | 使用相机拍摄 |

#### camera

| 参数 | 说明 |
| --- | --- |
| back | 使用后置摄像头 |
| front | 使用前置摄像头 |

### VideoContext

VideoContext 实例，可通过 [Taro.createVideoContext](./createVideoContext) 获取。

VideoContext 通过 id 跟一个 video 组件绑定，操作对应的 video 组件。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video/VideoContext)

##### exitBackgroundPlayback

退出后台音频播放模式。

```tsx
() => void
```

##### exitFullScreen

退出全屏

```tsx
() => void
```

##### exitPictureInPicture

退出小窗，该方法可在任意页面调用

```tsx
(option: ExitPictureInPictureOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### hideStatusBar

隐藏状态栏，仅在iOS全屏下有效

```tsx
() => void
```

##### pause

暂停视频

```tsx
() => void
```

##### play

播放视频

```tsx
() => void
```

##### playbackRate

设置倍速播放

```tsx
(rate: number) => void
```

| 参数 | 说明 |
| --- | --- |
| rate | 倍率，支持 0.5/0.8/1.0/1.25/1.5，2.6.3 起支持 2.0 倍速 |

##### requestBackgroundPlayback

进入后台音频播放模式。

```tsx
() => void
```

##### requestFullScreen

进入全屏

```tsx
(option: RequestFullScreenOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### seek

跳转到指定位置

```tsx
(position: number) => void
```

| 参数 | 说明 |
| --- | --- |
| position | 跳转到的位置，单位 s |

##### sendDanmu

发送弹幕

```tsx
(data: Danmu) => void
```

| 参数 | 说明 |
| --- | --- |
| data | 弹幕内容 |

##### showStatusBar

显示状态栏，仅在iOS全屏下有效

```tsx
() => void
```

##### stop

停止视频

```tsx
() => void
```

##### ExitPictureInPictureOption

| 参数 | 说明 |
| --- | --- |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

##### RequestFullScreenOption

| 参数 | 说明 |
| --- | --- |
| direction | 设置全屏时视频的方向，不指定则根据宽高比自动判断。<br />可选值：<br />- 0: 正常竖向;<br />- 90: 屏幕逆时针90度;<br />- -90: 屏幕顺时针90度; |

##### Danmu

弹幕内容

| 参数 | 说明 |
| --- | --- |
| text | 弹幕文字 |
| color | 弹幕颜色 |

### Taro.stopVoice(option)

结束播放语音。
**注意：1.6.0 版本开始，本接口不再维护。建议使用能力更强的 [Taro.createInnerAudioContext](./createInnerAudioContext) 接口**

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/stopVoice)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setInnerAudioOption(option)

设置 [InnerAudioContext](https://docs.taro.zone/docs/apis/media/audio/InnerAudioContext)项。设置之后对当前小程序全局生效。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/setInnerAudioOption)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| mixWithOther | 是否与其他音频混播，设置为 true 之后，不会终止其他应用或微信内的音乐 |
| obeyMuteSwitch | （仅在 iOS 生效）是否遵循静音开关，设置为 false 之后，即使是在静音模式下，也能播放声音 |
| success | 接口调用成功的回调函数 |

### Taro.playVoice(option)

开始播放语音。同时只允许一个语音文件正在播放，如果前一个语音文件还没播放完，将中断前一个语音播放。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/playVoice)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 需要播放的语音文件的文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| duration | 指定录音时长，到达指定的录音时长后会自动停止录音，单位：秒 |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.pauseVoice(option)

暂停正在播放的语音。再次调用 [Taro.playVoice](https://docs.taro.zone/docs/apis/media/audio/stopVoice)。
**注意：1.6.0 版本开始，本接口不再维护。建议使用能力更强的 [Taro.createInnerAudioContext](./createInnerAudioContext) 接口**

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/pauseVoice)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getAvailableAudioSources(option)

获取当前支持的音频输入源

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/getAvailableAudioSources)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| audioSources | 支持的音频输入源列表，可在 [RecorderManager.start()](https://docs.taro.zone/docs/apis/media/recorder/RecorderManager#start)用。返回值定义参考 https://developer.android.com/reference/kotlin/android/media/MediaRecorder.AudioSource |
| errMsg | 调用结果 |

#### audioSources

支持的音频输入源

| 参数 | 说明 |
| --- | --- |
| auto | 自动设置，默认使用手机麦克风，插上耳麦后自动切换使用耳机麦克风，所有平台适用 |
| buildInMic | 手机麦克风，仅限 iOS |
| headsetMic | 耳机麦克风，仅限 iOS |
| mic | 麦克风（没插耳麦时是手机麦克风，插耳麦时是耳机麦克风），仅限 Android |
| camcorder | 同 mic，适用于录制音视频内容，仅限 Android |
| voice_communication | 同 mic，适用于实时沟通，仅限 Android |
| voice_recognition | 同 mic，适用于语音识别，仅限 Android |

### Taro.createWebAudioContext()

创建 WebAudio 上下文。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/createWebAudioContext)

### Taro.createMediaAudioPlayer()

创建媒体音频播放器对象 [MediaAudioPlayer](./MediaAudioPlayer) 对象，可用于播放视频解码器 [VideoDecoder](https://docs.taro.zone/docs/apis/media/video-decoder/VideoDecoder) 输出的音频

**注意事项**
- iOS 7.0.15 mediaAudioPlayer 播放网络视频资源会出现音频卡顿，本地视频没有这个问题，将下一个客户端版本修复。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/createMediaAudioPlayer)

### Taro.createInnerAudioContext(option)

创建内部 audio 上下文 InnerAudioContext 对象。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/createInnerAudioContext)

#### 参数

| 参数 | 说明 |
| --- | --- |
| useWebAudioImplement | 是否使用 WebAudio 作为底层音频驱动，默认关闭。对于短音频、播放频繁的音频建议开启此选项，开启后将获得更优的性能表现。由于开启此选项后也会带来一定的内存增长，因此对于长音频建议关闭此选项。<br />微信 |

### Taro.createAudioContext(id, component)

创建 audio 上下文 AudioContext 对象。
**注意：1.6.0 版本开始，本接口不再维护。建议使用能力更强的 [Taro.createInnerAudioContext](./createInnerAudioContext) 接口**

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/createAudioContext)

### AudioBuffer

AudioBuffer 接口表示存在内存里的一段短小的音频资源，利用 [WebAudioContext.decodeAudioData](./WebAudioContext#decodeaudiodata) 方法从一个音频文件构建，或者利用 [AudioContext.createBuffer](https://developers.weixin.qq.com/miniprogram/dev/api/media/audio/(AudioContext.createBuffer).html) 从原始数据构建。把音频放入 AudioBuffer 后，可以传入到一个 AudioBufferSourceNode 进行播放。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/AudioBuffer)

#### 方法

| 参数 | 说明 |
| --- | --- |
| sampleRate | 存储在缓存区的PCM数据的采样率（单位为sample/s) |
| length | 返回存储在缓存区的PCM数据的采样帧率 |
| duration | 返回存储在缓存区的PCM数据的时长（单位为秒） |
| numberOfChannels | 储存在缓存区的PCM数据的通道数 |

##### getChannelData

返回一个 Float32Array，包含了带有频道的PCM数据，由频道参数定义（有0代表第一个频道）

```tsx
(channel: number) => Float32Array
```

| 参数 | 说明 |
| --- | --- |
| channel |  |

##### copyFromChannel

从 AudioBuffer 的指定频道复制到数组终端。

```tsx
() => void
```

##### copyToChannel

从指定数组复制样本到 audioBuffer 的特定通道

```tsx
(source: Float32Array, channelNumber: number, startInChannel: number) => void
```

| 参数 | 说明 |
| --- | --- |
| source | 需要复制的源数组 |
| channelNumber | 需要复制到的目的通道号 |
| startInChannel | 复制偏移数据量 |

### AudioContext

`AudioContext` 实例，可通过 `Taro.createAudioContext` 获取。

`AudioContext` 通过 `id` 跟一个 `audio` 组件绑定，操作对应的 audio 组件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/AudioContext)

##### pause

暂停音频。

```tsx
() => void
```

##### play

播放音频。

```tsx
() => void
```

##### seek

跳转到指定位置。

```tsx
(position: number) => void
```

| 参数 | 说明 |
| --- | --- |
| position | 跳转位置，单位 s |

##### setSrc

设置音频地址

```tsx
(src: string) => void
```

| 参数 | 说明 |
| --- | --- |
| src | 音频地址 |

### InnerAudioContext

InnerAudioContext 实例，可通过 [Taro.createInnerAudioContext](./createInnerAudioContext) 接口获取实例。

**支持格式**

| 格式 | iOS  | Android |
| ---- | ---- | ------- |
| flac | x    | √       |
| m4a  | √    | √       |
| ogg  | x    | √       |
| ape  | x    | √       |
| amr  | x    | √       |
| wma  | x    | √       |
| wav  | √    | √       |
| mp3  | √    | √       |
| mp4  | x    | √       |
| aac  | √    | √       |
| aiff | √    | x       |
| caf  | √    | x       |

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/InnerAudioContext)

#### 方法

| 参数 | 说明 |
| --- | --- |
| src | 音频资源的地址，用于直接播放。 |
| startTime | 开始播放的位置（单位：s） |
| autoplay | 是否自动开始播放 |
| loop | 是否循环播放 |
| obeyMuteSwitch | 是否遵循系统静音开关。当此参数为 `false` 时，即使用户打开了静音开关，也能继续发出声音。从 2.3.0 版本开始此参数不生效，使用 [Taro.setInnerAudioOption](https://docs.taro.zone/docs/apis/media/audio/setInnerAudioOption) 接口统一设置。 |
| volume | 音量。范围 0~1。 |
| playbackRate | 播放速度。范围 0.5-2.0。 |
| duration | 当前音频的长度（单位 s）。只有在当前有合法的 src 时返回 |
| currentTime | 当前音频的播放位置（单位 s）。只有在当前有合法的 src 时返回，时间保留小数点后 6 位 |
| paused | 当前是是否暂停或停止状态 |
| buffered | 音频缓冲的时间点，仅保证当前播放时间点到此时间点内容已缓冲 |
| referrerPolicy | origin: 发送完整的 referrer; no-referrer: 不发送 |

##### play

播放

```tsx
() => void
```

##### pause

暂停

```tsx
() => void
```

##### stop

停止

```tsx
() => void
```

##### seek

跳转到指定位置，单位 s

```tsx
(position: number) => void
```

| 参数 | 说明 |
| --- | --- |
| position |  |

##### destroy

销毁当前实例

```tsx
() => void
```

##### onCanplay

音频进入可以播放状态，但不保证后面可以流畅播放

```tsx
(callback?: OnCanplayCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onPlay

音频播放事件

```tsx
(callback?: OnPlayCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onPause

音频暂停事件

```tsx
(callback?: OnPauseCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onStop

音频停止事件

```tsx
(callback?: OnStopCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onEnded

音频自然播放结束事件

```tsx
(callback?: OnEndedCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onTimeUpdate

音频播放进度更新事件

```tsx
(callback?: OnTimeUpdateCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onError

音频播放错误事件

```tsx
(callback?: OnErrorCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onWaiting

音频加载中事件，当音频因为数据不足，需要停下来加载时会触发

```tsx
(callback?: OnWaitingCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onSeeking

音频进行 seek 操作事件

```tsx
(callback?: OnSeekingCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onSeeked

音频完成 seek 操作事件

```tsx
(callback?: OnSeekedCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offCanplay

取消监听 canplay 事件

```tsx
(callback?: OnCanplayCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offPlay

取消监听 play 事件

```tsx
(callback?: OnPlayCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offPause

取消监听 pause 事件

```tsx
(callback?: OnPauseCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offStop

取消监听 stop 事件

```tsx
(callback?: OnStopCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offEnded

取消监听 ended 事件

```tsx
(callback?: OnEndedCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offTimeUpdate

取消监听 timeUpdate 事件

```tsx
(callback?: OnTimeUpdateCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offError

取消监听 error 事件

```tsx
(callback?: OnErrorCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offWaiting

取消监听 waiting 事件

```tsx
(callback?: OnWaitingCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offSeeking

取消监听 seeking 事件

```tsx
(callback?: OnSeekingCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offSeeked

取消监听 seeked 事件

```tsx
(callback?: OnSeekedCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onErrorDetail

| 参数 | 说明 |
| --- | --- |
| errCode | 错误码 |
| errMsg | 错误信息 |

##### onErrorDetailErrCode

| 参数 | 说明 |
| --- | --- |
| 10001 | 系统错误 |
| 10002 | 网络错误 |
| 10003 | 文件错误 |
| 10004 | 格式错误 |
| -1 | 未知错误 |

##### OnCanplayCallback

音频进入可以播放状态事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnPlayCallback

音频播放事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnPauseCallback

音频暂停事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnStopCallback

音频停止事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnEndedCallback

音频自然播放结束事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnTimeUpdateCallback

音频播放进度更新事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnErrorCallback

音频播放错误事件的回调函数

```tsx
(res: onErrorDetail) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnWaitingCallback

音频加载中事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnSeekingCallback

音频进行 seek 操作事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnSeekedCallback

音频完成 seek 操作事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### MediaAudioPlayer

MediaAudioPlayer 实例，可通过 [Taro.createMediaAudioPlayer](./createMediaAudioPlayer) 接口获取实例。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/MediaAudioPlayer)

#### 方法

| 参数 | 说明 |
| --- | --- |
| volume | 音量。范围 0~1 |

##### start

启动播放器

```tsx
() => Promise<void>
```

##### addAudioSource

添加音频源

```tsx
(source: VideoDecoder) => Promise<void>
```

| 参数 | 说明 |
| --- | --- |
| source | 视频解码器实例。作为音频源添加到音频播放器中 |

##### removeAudioSource

移除音频源

```tsx
(source: VideoDecoder) => Promise<void>
```

| 参数 | 说明 |
| --- | --- |
| source | 视频解码器实例 |

##### stop

停止播放器

```tsx
() => Promise<void>
```

##### destroy

销毁播放器

```tsx
() => Promise<void>
```

### WebAudioContext

WebAudioContext 实例，通过 [Taro.createWebAudioContext](./createWebAudioContext) 接口获取该实例。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/WebAudioContext)

#### 方法

| 参数 | 说明 |
| --- | --- |
| state | 当前 WebAudio 上下文的状态。<br />可能的值如下：suspended（暂停）、running（正在运行）、closed（已关闭）。<br />需要注意的是，不要在 audioContext close 后再访问 state 属性 |
| onstatechange | 可写属性，开发者可以对该属性设置一个监听函数，当 WebAudio 状态改变的时候，会触发开发者设置的监听函数。 |
| currentTime | 获取当前上下文的时间戳。 |
| destination | 当前上下文的最终目标节点，一般是音频渲染设备。 |
| listener | 空间音频监听器。 |
| sampleRate | 采样率，通常在 8000-96000 之间，通常 44100hz 的采样率最为常见。 |

##### close

关闭WebAudioContext

**注意事项**
同步关闭对应的 WebAudio 上下文。close 后会立即释放当前上下文的资源，**不要在 close 后再次访问 state 属性**。

```tsx
() => Promise<void>
```

##### resume

同步恢复已经被暂停的 WebAudioContext 上下文

```tsx
() => Promise<void>
```

##### suspend

同步暂停 WebAudioContext 上下文

```tsx
() => Promise<void>
```

##### createIIRFilter

创建一个 IIRFilterNode

```tsx
(feedforward: number[], feedback: number[]) => IIRFilterNode
```

| 参数 | 说明 |
| --- | --- |
| feedforward | 一个浮点值数组，指定IIR滤波器传递函数的前馈(分子)系数。 |
| feedback | 一个浮点值数组，指定IIR滤波器传递函数的反馈(分母)系数。 |

##### createWaveShaper

创建一个 WaveShaperNode

```tsx
() => WaveShaperNode
```

##### createConstantSource

创建一个 ConstantSourceNode

```tsx
() => ConstantSourceNode
```

##### createOscillator

创建一个 OscillatorNode

```tsx
() => OscillatorNode
```

##### createGain

创建一个 GainNode

```tsx
() => GainNode
```

##### createPeriodicWave

创建一个 PeriodicWaveNode

**注意**
`real` 和 `imag` 数组必须拥有一样的长度，否则抛出错误

```tsx
const real = new Float32Array(2)
const imag = new Float32Array(2)
real[0] = 0
imag[0] = 0
real[1] = 1
imag[1] = 0

const waveNode = audioContext.createPeriodicWave(real, imag, {disableNormalization: true})
```

```tsx
(real: Float32Array, imag: Float32Array, constraints: Constraints) => PeriodicWave
```

| 参数 | 说明 |
| --- | --- |
| real | 一组余弦项(传统上是A项) |
| imag | 一组余弦项(传统上是A项) |
| constraints | 一个字典对象，它指定是否应该禁用规范化(默认启用规范化) |

##### createBiquadFilter

创建一个BiquadFilterNode

```tsx
() => BiquadFilterNode
```

##### createBufferSource

创建一个 BufferSourceNode 实例，通过 AudioBuffer 对象来播放音频数据。

```tsx
() => AudioBufferSourceNode
```

##### createChannelMerger

创建一个ChannelMergerNode

```tsx
(numberOfInputs: number) => ChannelMergerNode
```

| 参数 | 说明 |
| --- | --- |
| numberOfInputs | 输出流中需要保持的输入流的个数 |

##### createChannelSplitter

创建一个ChannelSplitterNode

```tsx
(numberOfOutputs: number) => ChannelSplitterNode
```

| 参数 | 说明 |
| --- | --- |
| numberOfOutputs | 要分别输出的输入音频流中的通道数 |

##### createDelay

创建一个DelayNode

```tsx
(maxDelayTime: number) => DelayNode
```

| 参数 | 说明 |
| --- | --- |
| maxDelayTime | 最大延迟时间 |

##### createDynamicsCompressor

创建一个DynamicsCompressorNode

```tsx
() => DynamicsCompressorNode
```

##### createScriptProcessor

创建一个ScriptProcessorNode

```tsx
(bufferSize: number, numberOfInputChannels: number, numberOfOutputChannels: number) => ScriptProcessorNode
```

| 参数 | 说明 |
| --- | --- |
| bufferSize | 缓冲区大小，以样本帧为单位 |
| numberOfInputChannels | 用于指定输入 node 的声道的数量 |
| numberOfOutputChannels | 用于指定输出 node 的声道的数量 |

##### createPanner

创建一个PannerNode

```tsx
() => PannerNode
```

##### createBuffer

创建一个AudioBuffer，代表着一段驻留在内存中的短音频

```tsx
(numOfChannels: number, length: number, sampleRate: number) => AudioBuffer
```

| 参数 | 说明 |
| --- | --- |
| numOfChannels | 定义了 buffer 中包含的声频通道数量的整数 |
| length | 代表 buffer 中的样本帧数的整数 |
| sampleRate | 线性音频样本的采样率，即每一秒包含的关键帧的个数 |

##### decodeAudioData

异步解码一段资源为AudioBuffer。

```tsx
() => AudioBuffer
```

###### Constraints

字典对象

| 参数 | 说明 |
| --- | --- |
| disableNormalization | 如果指定为 true 则禁用标准化 |

### WebAudioContextNode

一类音频处理模块，不同的Node具备不同的功能，如GainNode(音量调整)等。一个 WebAudioContextNode 可以通过上下文来创建。

> 目前已经支持以下Node： IIRFilterNode WaveShaperNode ConstantSourceNode ChannelMergerNode OscillatorNode GainNode BiquadFilterNode PeriodicWaveNode BufferSourceNode ChannelSplitterNode ChannelMergerNode DelayNode DynamicsCompressorNode ScriptProcessorNode PannerNode

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/audio/WebAudioContextNode)

#### 方法

| 参数 | 说明 |
| --- | --- |
| positionX | 右手笛卡尔坐标系中X轴的位置。 |
| positionY | 右手笛卡尔坐标系中Y轴的位置。 |
| positionZ | 右手笛卡尔坐标系中Z轴的位置。 |
| forwardX | 表示监听器的前向系统在同一笛卡尔坐标系中的水平位置，作为位置（位置x，位置和位置和位置）值。 |
| forwardY | 表示听众的前向方向在同一笛卡尔坐标系中作为位置（位置x，位置和位置和位置）值的垂直位置。 |
| forwardZ | 表示与position (positionX、positionY和positionZ)值在同一笛卡尔坐标系下的听者前进方向的纵向(前后)位置。 |
| upX | 表示在与position (positionX、positionY和positionZ)值相同的笛卡尔坐标系中侦听器向前方向的水平位置。 |
| upY | 表示在与position (positionX、positionY和positionZ)值相同的笛卡尔坐标系中侦听器向上方向的水平位置。 |
| upZ | 表示在与position (positionX、positionY和positionZ)值相同的笛卡尔坐标系中侦听器向后方向的水平位置。 |

##### setOrientation

设置监听器的方向

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args |  |

##### setPosition

设置监听器的位置

```tsx
(...args: any[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args |  |

### Taro.stopBackgroundAudio(option)

停止播放音乐。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/background-audio/stopBackgroundAudio)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.seekBackgroundAudio(option)

控制音乐播放进度。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/background-audio/seekBackgroundAudio)

#### 参数

| 参数 | 说明 |
| --- | --- |
| position | 音乐位置，单位：秒 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.playBackgroundAudio(option)

使用后台播放器播放音乐，对于微信客户端来说，只能同时有一个后台音乐在播放。当用户离开小程序后，音乐将暂停播放；当用户点击“显示在聊天顶部”时，音乐不会暂停播放；当用户在其他小程序占用了音乐播放器，原有小程序内的音乐将停止播放。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/background-audio/playBackgroundAudio)

#### 参数

| 参数 | 说明 |
| --- | --- |
| dataUrl | 音乐链接，目前支持的格式有 m4a, aac, mp3, wav |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| coverImgUrl | 封面URL |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |
| title | 音乐标题 |

### Taro.pauseBackgroundAudio(option)

暂停播放音乐。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/background-audio/pauseBackgroundAudio)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onBackgroundAudioStop(callback)

监听音乐停止。

**bug & tip：**

1.  `bug`: `iOS` `6.3.30` Taro.seekBackgroundAudio 会有短暂延迟

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/background-audio/onBackgroundAudioStop)

### Taro.onBackgroundAudioPlay(callback)

监听音乐播放。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/background-audio/onBackgroundAudioPlay)

### Taro.onBackgroundAudioPause(callback)

监听音乐暂停。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/background-audio/onBackgroundAudioPause)

### Taro.getBackgroundAudioPlayerState(option)

获取后台音乐播放状态。
**注意：1.2.0 版本开始，本接口不再维护。建议使用能力更强的 [Taro.getBackgroundAudioManager](https://docs.taro.zone/docs/apis/media/background-audio/getBackgroundAudioManager) 接口**

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/background-audio/getBackgroundAudioPlayerState)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| currentPosition | 选定音频的播放位置（单位：s），只有在音乐播放中时返回 |
| dataUrl | 歌曲数据链接，只有在音乐播放中时返回 |
| downloadPercent | 音频的下载进度百分比，只有在音乐播放中时返回 |
| duration | 选定音频的长度（单位：s），只有在音乐播放中时返回 |
| status | 播放状态 |
| errMsg | 调用结果 |

#### Status

| 参数 | 说明 |
| --- | --- |
| 0 | 暂停中 |
| 1 | 播放中 |
| 2 | 没有音乐播放 |

### Taro.getBackgroundAudioManager()

获取**全局唯一**的背景音频管理器。
小程序切入后台，如果音频处于播放状态，可以继续播放。但是后台状态不能通过调用API操纵音频的播放状态。

从微信客户端6.7.2版本开始，若需要在小程序切后台后继续播放音频，需要在 [app.json](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html) 中配置 `requiredBackgroundModes` 属性。开发版和体验版上可以直接生效，正式版还需通过审核。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/background-audio/getBackgroundAudioManager)

### BackgroundAudioManager

BackgroundAudioManager 实例，可通过 [Taro.getBackgroundAudioManager](https://docs.taro.zone/docs/apis/media/background-audio/getBackgroundAudioManager) 获取。

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/background-audio/BackgroundAudioManager)

#### 方法

| 参数 | 说明 |
| --- | --- |
| src | 音频的数据源（[2.2.3](https://developers.weixin.qq.com/miniprogram/dev/framework/compatibility.html) 开始支持云文件ID）。默认为空字符串，**当设置了新的 src 时，会自动开始播放**，目前支持的格式有 m4a, aac, mp3, wav。 |
| startTime | 音频开始播放的位置（单位：s）。 |
| title | 音频标题，用于原生音频播放器音频标题（必填）。原生音频播放器中的分享功能，分享出去的卡片标题，也将使用该值。 |
| epname | 专辑名，原生音频播放器中的分享功能，分享出去的卡片简介，也将使用该值。 |
| singer | 歌手名，原生音频播放器中的分享功能，分享出去的卡片简介，也将使用该值。 |
| coverImgUrl | 封面图 URL，用于做原生音频播放器背景图。原生音频播放器中的分享功能，分享出去的卡片配图及背景也将使用该图。 |
| webUrl | 页面链接，原生音频播放器中的分享功能，分享出去的卡片简介，也将使用该值。 |
| protocol | 音频协议。默认值为 'http'，设置 'hls' 可以支持播放 HLS 协议的直播音频。 |
| playbackRate | 播放速度。范围 0.5-2.0。 |
| duration | 当前音频的长度（单位：s），只有在有合法 src 时返回。 |
| currentTime | 当前音频的播放位置（单位：s），只有在有合法 src 时返回。 |
| paused | 当前是否暂停或停止。 |
| buffered | 音频已缓冲的时间，仅保证当前播放时间点到此时间点内容已缓冲。 |
| referrerPolicy | origin: 发送完整的 referrer; no-referrer: 不发送 |

##### play

播放

```tsx
() => void
```

##### pause

暂停

```tsx
() => void
```

##### seek

跳转到指定位置，单位 s

```tsx
(position: any) => void
```

##### stop

停止

```tsx
() => void
```

##### onCanplay

背景音频进入可以播放状态，但不保证后面可以流畅播放

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onWaiting

音频加载中事件，当音频因为数据不足，需要停下来加载时会触发

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onError

背景音频播放错误事件

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onPlay

背景音频播放事件

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onPause

背景音频暂停事件

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onSeeking

背景音频开始跳转操作事件

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onSeeked

背景音频完成跳转操作事件

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onEnded

背景音频自然播放结束事件

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onStop

背景音频停止事件

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onTimeUpdate

背景音频播放进度更新事件

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onPrev

用户在系统音乐播放面板点击上一曲事件（iOS only）

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onNext

用户在系统音乐播放面板点击下一曲事件（iOS only）

```tsx
(callback?: () => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

### Taro.createLivePusherContext()

创建 [live-pusher](https://docs.taro.zone/docs/components/media/live-pusher) 上下文 [LivePusherContext](https://docs.taro.zone/docs/apis/media/live/LivePusherContext) 对象。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/live/createLivePusherContext)

### Taro.createLivePlayerContext(id, component)

创建 [live-player](https://docs.taro.zone/docs/components/media/live-player) 上下文 [LivePlayerContext](https://docs.taro.zone/docs/apis/media/live/LivePlayerContext) 对象。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/live/createLivePlayerContext)

### LivePlayerContext

`LivePlayerContext` 实例，可通过 `Taro.createLivePlayerContext` 获取。
`LivePlayerContext` 通过 `id` 跟一个 `live-player` 组件绑定，操作对应的 `live-player` 组件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/live/LivePlayerContext)

##### exitCasting

退出投屏。仅支持在 tap 事件回调内调用。

```tsx
(option?: ExitCastingOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### exitFullScreen

退出全屏

```tsx
(option?: ExitFullScreenOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### exitPictureInPicture

退出小窗，该方法可在任意页面调用

```tsx
(option?: ExitPictureInPictureOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### mute

静音

```tsx
(option?: MuteOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### pause

暂停

```tsx
(option?: PauseOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### play

播放

```tsx
(option?: PlayOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### reconnectCasting

重连投屏设备。仅支持在 tap 事件回调内调用。

```tsx
(option?: ReconnectCastingOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### requestFullScreen

进入全屏

```tsx
(option: RequestFullScreenOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### requestPictureInPicture

进入全屏

```tsx
(option: RequestPictureInPictureOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### resume

恢复

```tsx
(option?: ResumeOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### snapshot

截图

```tsx
(option?: SnapshotOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### startCasting

开始投屏, 拉起半屏搜索设备。仅支持在 tap 事件回调内调用

```tsx
(option?: StartCastingOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### stop

停止

```tsx
(option?: StopOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### switchCasting

切换投屏设备。仅支持在 tap 事件回调内调用。

```tsx
(option?: SwitchCastingOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### ExitCastingOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ExitFullScreenOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ExitPictureInPictureOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### MuteOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### PauseOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### PlayOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ReconnectCastingOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### RequestFullScreenOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| direction | 设置全屏时的方向<br />可选值：<br />- 0: 正常竖向;<br />- 90: 屏幕逆时针90度;<br />- -90: 屏幕顺时针90度; |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### RequestPictureInPictureOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ResumeOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SnapshotOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SnapshotSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| height | 图片的高度 |
| tempImagePath | 图片文件的临时路径 |
| width | 图片的宽度 |
| errMsg | 调用结果 |

##### StartCastingOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### StopOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SwitchCastingOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### LivePusherContext

`LivePusherContext` 实例，可通过 `Taro.createLivePusherContext` 获取。
`LivePusherContext` 与页面内唯一的 `live-pusher` 组件绑定，操作对应的 `live-pusher` 组件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/live/LivePusherContext)

##### pause

暂停推流

```tsx
(option?: PauseOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### pauseBGM

暂停背景音

```tsx
(option?: PauseBGMOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### playBGM

播放背景音

```tsx
(option: PlayBGMOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### resume

恢复推流

```tsx
(option?: ResumeOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### resumeBGM

恢复背景音

```tsx
(option?: ResumeBGMOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### sendMessage

发送SEI消息

```tsx
(option?: SendMessageOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setBGMVolume

设置背景音音量

```tsx
(option: SetBGMVolumeOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setMICVolume

设置麦克风音量

```tsx
(option: SetMICVolumeOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### snapshot

快照

```tsx
(option?: SnapshotOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### start

开始推流，同时开启摄像头预览

```tsx
(option?: StartOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### startPreview

开启摄像头预览

```tsx
(option?: StartPreviewOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### stop

停止推流，同时停止摄像头预览

```tsx
(option?: StopOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### stopBGM

停止背景音

```tsx
(option?: StopBGMOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### stopPreview

关闭摄像头预览

```tsx
(option?: StopPreviewOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### switchCamera

切换前后摄像头

```tsx
(option?: SwitchCameraOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### toggleTorch

切换手电筒

```tsx
(option?: ToggleTorchOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### PauseOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### PauseBGMOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### PlayBGMOption

| 参数 | 说明 |
| --- | --- |
| url | 加入背景混音的资源地址 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ResumeOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ResumeBGMOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SendMessageOption

| 参数 | 说明 |
| --- | --- |
| msg | SEI消息 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SetBGMVolumeOption

| 参数 | 说明 |
| --- | --- |
| volume | 音量大小，范围是 0-1 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SetMICVolumeOption

| 参数 | 说明 |
| --- | --- |
| volume | 音量大小，范围是 0-1 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SnapshotOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### StartOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### StartPreviewOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### StopOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### StopBGMOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### StopPreviewOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SwitchCameraOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ToggleTorchOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.stopRecord(option)

停止录音。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/recorder/stopRecord)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startRecord(option)

开始录音。当主动调用`Taro.stopRecord`，或者录音超过1分钟时自动结束录音，返回录音文件的临时文件路径。当用户离开小程序时，此接口无法调用。
**注意：1.6.0 版本开始，本接口不再维护。建议使用能力更强的 [Taro.getRecorderManager](https://docs.taro.zone/docs/apis/media/recorder/getRecorderManager) 接口**
需要[用户授权](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html) scope.record

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/recorder/startRecord)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 录音文件的临时路径 |
| errMsg | 调用结果 |

### Taro.getRecorderManager()

获取**全局唯一**的录音管理器 RecorderManager

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/recorder/getRecorderManager)

### RecorderManager

全局唯一的录音管理器

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/recorder/RecorderManager)

##### onError

监听录音错误事件

```tsx
(callback: OnErrorCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 录音错误事件的回调函数 |

##### onFrameRecorded

监听已录制完指定帧大小的文件事件。如果设置了 frameSize，则会回调此事件。

```tsx
(callback: OnFrameRecordedCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 已录制完指定帧大小的文件事件的回调函数 |

##### onInterruptionBegin

监听录音因为受到系统占用而被中断开始事件。以下场景会触发此事件：微信语音聊天、微信视频聊天。此事件触发后，录音会被暂停。pause 事件在此事件后触发

```tsx
(callback: (res: TaroGeneral.CallbackResult) => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 录音因为受到系统占用而被中断开始事件的回调函数 |

##### onInterruptionEnd

监听录音中断结束事件。在收到 interruptionBegin 事件之后，小程序内所有录音会暂停，收到此事件之后才可再次录音成功。

```tsx
(callback: (res: TaroGeneral.CallbackResult) => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 录音中断结束事件的回调函数 |

##### onPause

监听录音暂停事件

```tsx
(callback: (res: TaroGeneral.CallbackResult) => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 录音暂停事件的回调函数 |

##### onResume

监听录音继续事件

```tsx
(callback: (res: TaroGeneral.CallbackResult) => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 录音继续事件的回调函数 |

##### onStart

监听录音开始事件

```tsx
(callback: (res: TaroGeneral.CallbackResult) => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 录音开始事件的回调函数 |

##### onStop

监听录音结束事件

```tsx
(callback: OnStopCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 录音结束事件的回调函数 |

##### pause

暂停录音

```tsx
() => void
```

##### resume

继续录音

```tsx
() => void
```

##### start

开始录音

```tsx
(option: StartOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### stop

停止录音

```tsx
() => void
```

##### OnErrorCallback

录音错误事件的回调函数

```tsx
(result: OnErrorCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnErrorCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |

##### OnFrameRecordedCallback

已录制完指定帧大小的文件事件的回调函数

```tsx
(result: OnFrameRecordedCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnFrameRecordedCallbackResult

| 参数 | 说明 |
| --- | --- |
| frameBuffer | 录音分片数据 |
| isLastFrame | 当前帧是否正常录音结束前的最后一帧 |

##### OnStopCallback

录音结束事件的回调函数

```tsx
(result: OnStopCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnStopCallbackResult

| 参数 | 说明 |
| --- | --- |
| duration | 录音总时长，单位：ms |
| fileSize | 录音文件大小，单位：Byte |
| tempFilePath | 录音文件的临时路径 |

##### StartOption

| 参数 | 说明 |
| --- | --- |
| audioSource | 指定录音的音频输入源，可通过 [Taro.getAvailableAudioSources()](https://docs.taro.zone/docs/apis/media/audio/getAvailableAudioSources) 获取当前可用的音频源 |
| duration | 录音的时长，单位 ms，最大值 600000（10 分钟） |
| encodeBitRate | 编码码率，有效值见下表格 |
| format | 音频格式 |
| frameSize | 指定帧大小，单位 KB。传入 frameSize 后，每录制指定帧大小的内容后，会回调录制的文件内容，不指定则不会回调。暂仅支持 mp3 格式。 |
| numberOfChannels | 录音通道数 |
| sampleRate | 采样率 |

##### AudioSource

指定录音的音频输入源

| 参数 | 说明 |
| --- | --- |
| auto | 自动设置，默认使用手机麦克风，插上耳麦后自动切换使用耳机麦克风，所有平台适用 |
| buildInMic | 手机麦克风，仅限 iOS |
| headsetMic | 耳机麦克风，仅限 iOS |
| mic | 麦克风（没插耳麦时是手机麦克风，插耳麦时是耳机麦克风），仅限 Android |
| camcorder | 同 mic，适用于录制音视频内容，仅限 Android |
| voice_communication | 同 mic，适用于实时沟通，仅限 Android |
| voice_recognition | 同 mic，适用于语音识别，仅限 Android |

##### Format

音频格式

| 参数 | 说明 |
| --- | --- |
| mp3 | mp3 格式 |
| aac | aac 格式 |
| wav | wav 格式 |
| PCM | pcm 格式 |

##### NumberOfChannels

录音通道数

| 参数 | 说明 |
| --- | --- |
| 1 | 1 个通道 |
| 2 | 2 个通道 |

##### SampleRate

采样率

| 参数 | 说明 |
| --- | --- |
| 8000 | 8000 采样率 |
| 11025 | 11025 采样率 |
| 12000 | 12000 采样率 |
| 16000 | 16000 采样率 |
| 22050 | 22050 采样率 |
| 24000 | 24000 采样率 |
| 32000 | 32000 采样率 |
| 44100 | 44100 采样率 |
| 48000 | 48000 采样率 |

### Taro.createCameraContext(id)

创建 camera 上下文 CameraContext 对象。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/camera/createCameraContext)

### CameraContext

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/camera/CameraContext)

##### onCameraFrame

获取 Camera 实时帧数据

****

注： 使用该接口需同时在 [camera](https://docs.taro.zone/docs/components/media/camera) 组件属性中指定 frame-size。

```tsx
(callback: OnCameraFrameCallback) => CameraFrameListener
```

| 参数 | 说明 |
| --- | --- |
| callback | 回调函数 |

##### setZoom

设置缩放级别

```tsx
(option: SetZoomOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### startRecord

开始录像

```tsx
(option: StartRecordOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### stopRecord

结束录像

```tsx
(option?: StopRecordOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### takePhoto

拍摄照片

```tsx
(option: TakePhotoOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### SetZoomOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |
| zoom | 缩放级别，范围[1, maxZoom]。zoom 可取小数，精确到小数后一位。maxZoom 可在 bindinitdone 返回值中获取。 |

##### StartRecordSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| zoom | 实际设置的缩放级别。由于系统限制，某些机型可能无法设置成指定值，会改用最接近的可设值。 |

##### StartRecordOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |
| timeoutCallback | 超过30s或页面 `onHide` 时会结束录像 |

##### StartRecordTimeoutCallback

超过30s或页面 `onHide` 时会结束录像

```tsx
(result: StartRecordTimeoutCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### StartRecordTimeoutCallbackResult

| 参数 | 说明 |
| --- | --- |
| tempThumbPath | 封面图片文件的临时路径 |
| tempVideoPath | 视频的文件的临时路径 |

##### StopRecordOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### StopRecordSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| tempThumbPath | 封面图片文件的临时路径 |
| tempVideoPath | 视频的文件的临时路径 |
| errMsg | 调用结果 |

##### TakePhotoOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| quality | 成像质量 |
| success | 接口调用成功的回调函数 |

##### TakePhotoSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| tempImagePath | 照片文件的临时路径，安卓是jpg图片格式，ios是png |
| errMsg | 调用结果 |

##### OnCameraFrameCallback

回调函数

```tsx
(result: OnCameraFrameCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnCameraFrameCallbackResult

| 参数 | 说明 |
| --- | --- |
| data | 图像像素点数据，一维数组，每四项表示一个像素点的 rgba |
| height | 图像数据矩形的高度 |
| width | 图像数据矩形的宽度 |

##### Quality

| 参数 | 说明 |
| --- | --- |
| high | 高质量 |
| normal | 普通质量 |
| low | 低质量 |
| original | 原图 |

### CameraFrameListener

CameraContext.onCameraFrame() 返回的监听器。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/camera/CameraFrameListener)

##### start

开始监听帧数据

```tsx
(option?: StartOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### stop

停止监听帧数据

```tsx
(option?: StopOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### StartOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### StopOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### EditorContext

`EditorContext` 实例，可通过 `Taro.createSelectorQuery` 获取。
`EditorContext` 通过 `id` 跟一个 `editor` 组件绑定，操作对应的 `editor` 组件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/editor/EditorContext)

##### blur

编辑器失焦，同时收起键盘。

```tsx
(option?: BlurOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### clear

清空编辑器内容

```tsx
(option?: ClearOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### format

修改样式

****

#### 支持设置的样式列表
| name | value |
| ------| ------ |
| bold  |        |
| italic  |        |
| underline  |        |
| strike  |        |
| ins  |        |
| script  | sub / super |
| header  | H1 / H2 / h3 / H4 / h5 /  H6 |
| align  | left / center / right / justify |
| direction  | rtl  |
| indent | -1 / +1 |
| list | ordered / bullet / check |
| color | hex color |
| backgroundColor| hex color |
| margin/marginTop/marginBottom/marginLeft/marginRight  |  css style  |
| padding/paddingTop/paddingBottom/paddingLeft/paddingRight  | css style |
| font/fontSize/fontStyle/fontVariant/fontWeight/fontFamily  |  css style |
| lineHeight | css style |
| letterSpacing |  css style |
| textDecoration |  css style |
| textIndent    | css style |

对已经应用样式的选区设置会取消样式。css style 表示 css 中规定的允许值。

```tsx
(name: string, value?: string) => void
```

| 参数 | 说明 |
| --- | --- |
| name | 属性 |
| value | 值 |

##### getContents

获取编辑器内容

```tsx
(option?: GetContentsOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getSelectionText

获取编辑器已选区域内的纯文本内容。当编辑器失焦或未选中一段区间时，返回内容为空。

```tsx
(option?: Option) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### insertDivider

插入分割线

```tsx
(option?: InsertDividerOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### insertImage

插入图片。

地址为临时文件时，获取的编辑器html格式内容中 `<img>` 标签增加属性 data-local，delta 格式内容中图片 attributes 属性增加 data-local 字段，该值为传入的临时文件地址。

开发者可选择在提交阶段上传图片到服务器，获取到网络地址后进行替换。替换时对于html内容应替换掉 `<img>` 的 src 值，对于 delta 内容应替换掉 `insert { image: abc }` 值。

```tsx
(option: InsertImageOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### insertText

覆盖当前选区，设置一段文本

```tsx
(option: InsertTextOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### redo

恢复

```tsx
(option?: RedoOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### removeFormat

清除当前选区的样式

```tsx
(option?: RemoveFormatOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### scrollIntoView

使得编辑器光标处滚动到窗口可视区域内。

```tsx
() => void
```

##### setContents

初始化编辑器内容，html和delta同时存在时仅delta生效

```tsx
(option: SetContentsOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### undo

撤销

```tsx
(option?: UndoOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### BlurOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ClearOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### GetContentsOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| text | 纯文本内容 |

##### InsertDividerOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### InsertImageOption

| 参数 | 说明 |
| --- | --- |
| src | 图片地址，仅支持 http(s)、base64、云图片(2.8.0)、临时文件(2.8.3)。 |
| nowrap | 插入图片后是否自动换行，默认换行 |
| alt | 图像无法显示时的替代文本 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| data | data 被序列化为 name=value;name1=value2 的格式挂在属性 data-custom 上 |
| extClass | 添加到图片 img 标签上的类名 |
| fail | 接口调用失败的回调函数 |
| height | 图片高度 (pixels/百分比) |
| success | 接口调用成功的回调函数 |
| width | 图片宽度（pixels/百分比) |

##### InsertTextOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |
| text | 文本内容 |

##### RedoOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### RemoveFormatOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### SetContentsOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| delta | 表示内容的delta对象 |
| fail | 接口调用失败的回调函数 |
| html | 带标签的HTML内容 |
| success | 接口调用成功的回调函数 |

##### UndoOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.createMediaContainer()

创建音视频处理容器，最终可将容器中的轨道合成一个视频

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video-processing/createMediaContainer)

### MediaContainer

创建音视频处理容器，最终可将容器中的轨道合成一个视频

> 可通过 [Taro.createMediaContainer](./createMediaContainer) 创建

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video-processing/MediaContainer)

##### addTrack

将音频或视频轨道添加到容器

```tsx
(track: MediaTrack) => void
```

| 参数 | 说明 |
| --- | --- |
| track | 要添加的音频或视频轨道 |

##### destroy

将容器销毁，释放资源

```tsx
() => void
```

##### export

将容器内的轨道合并并导出视频文件

```tsx
() => void
```

##### extractDataSource

将传入的视频源分离轨道。不会自动将轨道添加到待合成的容器里。

```tsx
(option: ExtractDataSourceOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### removeTrack

将音频或视频轨道从容器中移除

```tsx
(track: MediaTrack) => void
```

| 参数 | 说明 |
| --- | --- |
| track | 要移除的音频或视频轨道 |

##### ExtractDataSourceOption

| 参数 | 说明 |
| --- | --- |
| source | 视频源地址，只支持本地文件 |

### MediaTrack

可通过 [MediaContainer.extractDataSource](https://docs.taro.zone/docs/apis/media/video-processing/MediaContainer#extractdatasource) 返回。
[MediaTrack](https://docs.taro.zone/docs/apis/media/video-processing/MediaTrack) 音频或视频轨道，可以对轨道进行一些操作

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video-processing/MediaTrack)

#### 方法

| 参数 | 说明 |
| --- | --- |
| kind | 轨道类型 |
| duration | 轨道长度 |
| volume | 音量，音频轨道下有效，可写 |

##### Kind

| 参数 | 说明 |
| --- | --- |
| audio | 音频轨道 |
| video | 视频轨道 |

### Taro.updateVoIPChatMuteConfig(option)

更新实时语音静音设置

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/updateVoIPChatMuteConfig)

#### 参数

| 参数 | 说明 |
| --- | --- |
| muteConfig | 静音设置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### MuteConfig

静音设置

| 参数 | 说明 |
| --- | --- |
| muteMicrophone | 是否静音麦克风 |
| muteEarphone | 是否静音耳机 |

### Taro.subscribeVoIPVideoMembers(option)

订阅视频画面成员

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/subscribeVoIPVideoMembers)

#### 参数

| 参数 | 说明 |
| --- | --- |
| openIdList | 订阅的成员列表 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setEnable1v1Chat(option)

开启双人通话

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/setEnable1v1Chat)

#### 参数

| 参数 | 说明 |
| --- | --- |
| enable | 是否开启 |
| backgroundType | 窗口背景色 |
| minWindowType | 小窗样式 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### ColorType

音频通话背景以及小窗模式背景

| 参数 | 说明 |
| --- | --- |
| 0 | #262930 |
| 1 | #FA5151 |
| 2 | #FA9D3B |
| 3 | #3D7257 |
| 4 | #1485EE |
| 5 | #6467F0 |

### Taro.onVoIPVideoMembersChanged(callback)

监听实时语音通话成员视频状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/onVoIPVideoMembersChanged)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| openIdList | 开启视频的成员名单 |
| errCode | 错误码 |
| errMsg | 调用结果 |

#### 回调

实时语音通话成员视频状态变化事件的回调函数

```tsx
(res: Result) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.onVoIPChatStateChanged(callback)

监听房间状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/onVoIPChatStateChanged)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| code | 事件码 |
| data | 附加信息 |
| errCode | 错误码 |
| errMsg | 调用结果 |

#### 回调

房间状态变化事件的回调函数

```tsx
(res: Result) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.onVoIPChatSpeakersChanged(callback)

监听实时语音通话成员通话状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/onVoIPChatSpeakersChanged)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| openIdList | 还在实时语音通话中的成员 openId 名单 |
| errCode | 错误码 |
| errMsg | 调用结果 |

#### 回调

房间状态变化事件的回调函数

```tsx
(res: Result) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.onVoIPChatMembersChanged(callback)

监听实时语音通话成员在线状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/onVoIPChatMembersChanged)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| openIdList | 还在实时语音通话中的成员 openId 名单 |
| errCode | 错误码 |
| errMsg | 调用结果 |

#### 回调

房间状态变化事件的回调函数

```tsx
(res: Result) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.onVoIPChatInterrupted(callback)

监听被动断开实时语音通话事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/onVoIPChatInterrupted)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| openIdList | 还在实时语音通话中的成员 openId 名单 |
| errCode | 错误码 |
| errMsg | 调用结果 |

#### 回调

房间状态变化事件的回调函数

```tsx
(res: Result) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.offVoIPVideoMembersChanged(callback)

取消监听实时语音通话成员视频状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/offVoIPVideoMembersChanged)

### Taro.offVoIPChatStateChanged(callback)

取消监听房间状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/offVoIPChatStateChanged)

### Taro.offVoIPChatSpeakersChanged(callback)

取消监听实时语音通话成员通话状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/offVoIPChatSpeakersChanged)

### Taro.offVoIPChatMembersChanged(callback)

取消监听实时语音通话成员在线状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/offVoIPChatMembersChanged)

### Taro.offVoIPChatInterrupted(callback)

取消监听被动断开实时语音通话事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/offVoIPChatInterrupted)

### Taro.joinVoIPChat(option)

加入 (创建) 实时语音通话，更多信息可见 [实时语音指南](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/voip-chat.html)

调用前需要用户授权 `scope.record`，若房间类型为视频房间需要用户授权 `scope.camera`。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/joinVoIPChat)

#### Promised

```tsx
FailCallbackResult | SuccessCallbackResult
```

#### 参数

| 参数 | 说明 |
| --- | --- |
| roomType | 房间类型 |
| signature | 签名，用于验证小游戏的身份 |
| nonceStr | 验证所需的随机字符串 |
| timeStamp | 验证所需的时间戳 |
| groupId | 小游戏内此房间/群聊的 ID。同一时刻传入相同 groupId 的用户会进入到同个实时语音房间。 |
| muteConfig | 静音设置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### RoomType

房间类型

| 参数 | 说明 |
| --- | --- |
| voice | 音频房间，用于语音通话 |
| video | 视频房间，结合 [voip-room](https://docs.taro.zone/docs/components/media/voip-room) 组件可显示成员画面 |

#### MuteConfig

静音设置

| 参数 | 说明 |
| --- | --- |
| muteMicrophone | 是否静音麦克风 |
| muteEarphone | 是否静音耳机 |

#### 失败回调

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |
| errCode | 错误码 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| openIdList | 还在实时语音通话中的成员 openId 名单 |
| errCode | 错误码 |
| errMsg | 调用结果 |

#### VoipErrCode

Voip 错误码

| 参数 | 说明 |
| --- | --- |
| -1 | 当前已在房间内 |
| -2 | 录音设备被占用，可能是当前正在使用微信内语音通话或系统通话 |
| -3 | 加入会话期间退出（可能是用户主动退出，或者退后台、来电等原因），因此加入失败 |
| -1000 | 系统错误 |

### Taro.join1v1Chat(option)

加入（创建）双人通话

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/join1v1Chat)

#### Caller

| 参数 | 说明 |
| --- | --- |
| nickname | 昵称 |
| headImage | 头像 |
| openid | 小程序内 openid |

#### Listener

| 参数 | 说明 |
| --- | --- |
| nickname | 昵称 |
| headImage | 头像 |
| openid | 小程序内 openid |

#### RoomType

| 参数 | 说明 |
| --- | --- |
| voice | 语音通话 |
| video | 视频通话 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| caller | 呼叫方信息 |
| listener | 接听方信息 |
| backgroundType | 窗口背景色 |
| roomType | 通话类型 |
| minWindowType | 小窗样式 |
| disableSwitchVoice | 不允许切换到语音通话 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### ChatErrCode

| 参数 | 说明 |
| --- | --- |
| -20000 | 未开通双人通话 |
| -20001 | 当前设备不支持 |
| -20002 | 正在通话中 |
| -20003 | 其它小程序正在通话中 |
| -30000 | 内部系统错误 |
| -30001 | 微信缺失相机权限 |
| -30002 | 微信缺失录音权限 |
| -30003 | 小程序缺失录音权限 |
| -30004 | 小程序缺失相机权限 |
| -1 | 当前已在房间内 |
| -2 | 录音设备被占用，可能是当前正在使用微信内语音通话或系统通话 |
| -3 | 加入会话期间退出（可能是用户主动退出，或者退后台、来电等原因），因此加入失败 |
| -1000 | 系统错误 |

#### 失败回调

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |
| errCode | 错误码 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| errCode | 错误码 |
| errMsg | 调用结果 |

#### Promised

```tsx
FailCallbackResult | SuccessCallbackResult
```

### Taro.exitVoIPChat(option)

退出（销毁）实时语音通话

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/voip/exitVoIPChat)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.createMediaRecorder(canvas, option)

创建 WebGL 画面录制器，可逐帧录制在 WebGL 上渲染的画面并导出视频文件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/media-recorder/createMediaRecorder)

#### 参数

createMediaRecorder Option

| 参数 | 说明 |
| --- | --- |
| duration | 指定录制的时长（s)，到达自动停止。最大 7200，最小 5 |
| videoBitsPerSecond | 视频比特率（kbps），最小值 600，最大值 3000 |
| gop | 视频关键帧间隔 |
| fps | 视频 fps |

### MediaRecorder

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/media-recorder/MediaRecorder)

##### destroy

销毁录制器

```tsx
() => Promise<void>
```

##### off

取消监听录制事件

```tsx
(eventName: keyof EventName, callback: Callback) => Promise<void>
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名 |
| callback | 事件触发时执行的回调函数 |

##### on

注册监听录制事件的回调函数

```tsx
(eventName: keyof EventName, callback: Callback) => Promise<void>
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名 |
| callback | 事件触发时执行的回调函数 |

##### pause

暂停录制

```tsx
() => Promise<void>
```

##### requestFrame

请求下一帧录制，在 callback 里完成一帧渲染后开始录制当前帧

```tsx
(callback: Callback) => Promise<void>
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### resume

恢复录制

```tsx
() => Promise<void>
```

##### start

开始录制

```tsx
() => Promise<void>
```

##### stop

结束录制

```tsx
() => Promise<void>
```

###### EventName

eventName 的合法值

| 参数 | 说明 |
| --- | --- |
| start | 录制开始事件。 |
| stop | 录制结束事件。返回 {tempFilePath, duration, fileSize} |
| pause | 录制暂停事件。 |
| resume | 录制继续事件。 |
| timeupdate | 录制时间更新事件。 |

###### 回调

事件触发时执行的回调函数

```tsx
(res: { tempFilePath: string; duration: number; fileSize: number; }) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

###### 回调

事件触发时执行的回调函数

```tsx
() => void
```

### Taro.createVideoDecoder()

创建视频解码器，可逐帧获取解码后的数据

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video-decoder/createVideoDecoder)

### VideoDecoder

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/media/video-decoder/VideoDecoder)

##### getFrameData

获取下一帧的解码数据

```tsx
() => Promise<Result>
```

##### off

取消监听录制事件

```tsx
(eventName: keyof EventName, callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名 |
| callback | 事件触发时执行的回调函数 |

##### on

注册监听录制事件的回调函数

```tsx
(eventName: keyof EventName, callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名 |
| callback | 事件触发时执行的回调函数 |

##### remove

移除解码器

```tsx
() => Promise<void>
```

##### seek

跳到某个时间点解码

```tsx
(position: number) => Promise<void>
```

| 参数 | 说明 |
| --- | --- |
| position | 跳转的解码位置，单位 ms |

##### start

开始解码

```tsx
(option: Option) => Promise<void>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### stop

停止解码

```tsx
() => Promise<void>
```

###### 返回值

| 参数 | 说明 |
| --- | --- |
| width | 帧数据宽度 |
| height | 帧数据高度 |
| data | 帧数据 |
| pkPts | 帧原始 pts |
| pkDts | 帧原始 dts |

###### EventName

eventName 的合法值

| 参数 | 说明 |
| --- | --- |
| start | 开始事件。返回 {width, height} |
| stop | 结束事件。 |
| seek | seek 完成事件。 |
| bufferchange | 缓冲区变化事件。 |
| ended | 解码结束事件。 |

###### 回调

事件触发时执行的回调函数

```tsx
(res: { width: number; height: number; }) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| source | 需要解码的视频源文件。 |
| mode | 解码模式。0：按 pts 解码；1：以最快速度解码 |
| abortAudio | 是否不需要音频轨道 |
| abortVideo | 是否不需要视频轨道 |

## 位置

### Taro.stopLocationUpdate(option)

关闭监听实时位置变化，前后台都停止消息接收

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/stopLocationUpdate)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startLocationUpdateBackground(option)

开启小程序进入前后台时均接收位置消息，需引导用户开启[授权](../open-api/authorize/authorize.md#后台定位)。授权以后，小程序在运行中或进入后台均可接受位置消息变化。

**注意**
- 安卓微信7.0.6版本，iOS 7.0.5版本起支持该接口
- 需在app.json中配置requiredBackgroundModes: ['location']后使用
- 获取位置信息需配置[地理位置用途说明](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html#permission)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/startLocationUpdateBackground)

#### 参数

| 参数 | 说明 |
| --- | --- |
| type | wgs84 返回 gps 坐标，gcj02 返回可用于 wx.openLocation 的坐标 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startLocationUpdate(option)

开启小程序进入前台时接收位置消息

**注意**
- 获取位置信息需配置[地理位置用途说明](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html#permission)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/startLocationUpdate)

#### 参数

| 参数 | 说明 |
| --- | --- |
| type | wgs84 返回 gps 坐标，gcj02 返回可用于 wx.openLocation 的坐标 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.openLocation(option)

使用微信内置地图查看位置

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/openLocation)

#### 参数

| 参数 | 说明 |
| --- | --- |
| latitude | 纬度，范围为-90~90，负数表示南纬。使用 gcj02 国测局坐标系 |
| longitude | 经度，范围为-180~180，负数表示西经。使用 gcj02 国测局坐标系 |
| scale | 缩放比例<br />微信： 范围 5~18，默认值18 |
| name | 位置名 |
| address | 地址的详细说明 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onLocationChangeError(callback)

监听持续定位接口返回失败时触发

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/onLocationChangeError)

#### 回调

监听持续定位接口返回失败时触发的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| errCode | 错误码 |

### Taro.onLocationChange(callback)

监听实时地理位置变化事件，需结合 Taro.startLocationUpdateBackground、Taro.startLocationUpdate 使用。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/onLocationChange)

#### 回调

实时地理位置变化事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| accuracy | 位置的精确度 |
| altitude | 高度，单位 m |
| horizontalAccuracy | 水平精度，单位 m |
| latitude | 纬度，范围为 -90~90，负数表示南纬 |
| longitude | 经度，范围为 -180~180，负数表示西经 |
| speed | 速度，单位 m/s |
| verticalAccuracy | 垂直精度，单位 m（Android 无法获取，返回 0） |

### Taro.offLocationChangeError(callback)

取消监听持续定位接口返回失败时触发

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/offLocationChangeError)

### Taro.offLocationChange(callback)

取消监听实时地理位置变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/offLocationChange)

### Taro.getLocation(option)

获取当前的地理位置、速度。当用户离开小程序后，此接口无法调用。开启高精度定位，接口耗时会增加，可指定 highAccuracyExpireTime 作为超时时间。

**注意**
- 工具中定位模拟使用IP定位，可能会有一定误差。且工具目前仅支持 gcj02 坐标。
- 使用第三方服务进行逆地址解析时，请确认第三方服务默认的坐标系，正确进行坐标转换。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/getLocation)

#### 参数

| 参数 | 说明 |
| --- | --- |
| altitude | 传入 true 会返回高度信息，由于获取高度需要较高精确度，会减慢接口返回速度 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| highAccuracyExpireTime | 高精度定位超时时间(ms)，指定时间内返回最高精度，该值3000ms以上高精度定位才有效果 |
| isHighAccuracy | 开启高精度定位 |
| success | 接口调用成功的回调函数 |
| type | wgs84 返回 gps 坐标，gcj02 返回可用于 Taro.openLocation 的坐标 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| accuracy | 位置的精确度 |
| altitude | 高度，单位 m |
| horizontalAccuracy | 水平精度，单位 m |
| latitude | 纬度，范围为 -90~90，负数表示南纬 |
| longitude | 经度，范围为 -180~180，负数表示西经 |
| speed | 速度，单位 m/s |
| verticalAccuracy | 垂直精度，单位 m（Android 无法获取，返回 0） |
| errMsg | 调用结果 |

### Taro.getFuzzyLocation(option)

获取当前的模糊地理位置

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/getFuzzyLocation)

#### 参数

| 参数 | 说明 |
| --- | --- |
| type | wgs84 返回 gps 坐标，gcj02 返回可用于 Taro.openLocation 的坐标 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### Type

| 参数 | 说明 |
| --- | --- |
| wgs84 | 返回 gps 坐标 |
| gcj02 | 返回 gcj02 坐标 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| latitude | 纬度，范围为 -90~90，负数表示南纬 |
| longitude | 经度，范围为 -180~180，负数表示西经 |

### Taro.choosePoi(option)

打开POI列表选择位置，支持模糊定位（精确到市）和精确定位混选。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/choosePoi)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| type | 选择城市时，值为 1，选择精确位置时，值为 2 |
| city | 城市名称 |
| name | 位置名称 |
| address | 详细地址 |
| latitude | 纬度，浮点数，范围为-90~90，负数表示南纬。使用 gcj02 国测局坐标系 |
| longitude | 经度，浮点数，范围为-180~180，负数表示西经。使用 gcj02 国测局坐标系 |

### Taro.chooseLocation(option)

打开地图选择位置。

`chooseLocation` api功能是依赖于腾讯位置服务，所以需要使用 api 密钥。如果您没有，可以前往腾讯位置服务[开发者控制台](https://lbs.qq.com/console/mykey.html?console=mykey)进行申请。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/location/chooseLocation)

#### 参数

| 参数 | 说明 |
| --- | --- |
| latitude | 目标地纬度 |
| longitude | 目标地经度 |
| mapOpts | 地图选点组件参数<br />Web： 仅支持 Web 使用<br />[参考地址](https://lbs.qq.com/webApi/component/componentGuide/componentPicker)<br />Web |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| address | 详细地址 |
| latitude | 纬度，浮点数，范围为-90~90，负数表示南纬。使用 gcj02 国测局坐标系 |
| longitude | 经度，浮点数，范围为-180~180，负数表示西经。使用 gcj02 国测局坐标系 |
| name | 位置名称 |
| errMsg | 调用结果 |

## 文件

### Taro.saveFileToDisk(option)

保存文件系统的文件到用户磁盘，仅在 PC 端支持

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/saveFileToDisk)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 待保存文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.saveFile(option)

保存文件到本地。**注意：saveFile 会把临时文件移动，因此调用成功后传入的 tempFilePath 将不可用**

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/saveFile)

#### 参数

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 临时存储文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| filePath | 要存储的文件路径 |
| success | 接口调用成功的回调函数 |

#### 失败回调

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail tempFilePath file not exist': 指定的 tempFilePath 找不到文件;<br />- 'fail permission denied, open "${filePath}"': 指定的 filePath 路径没有写权限;<br />- 'fail no such file or directory "${dirPath}"': 上级目录不存在;<br />- 'fail the maximum size of the file storage limit is exceeded': 存储空间不足; |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| savedFilePath | 存储后的文件路径 |
| errMsg | 调用结果 |

### Taro.removeSavedFile(option)

删除该小程序下已保存的本地缓存文件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/removeSavedFile)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 需要删除的文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### RemoveSavedFileFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail file not exist': 指定的 tempFilePath 找不到文件; |

### Taro.openDocument(option)

新开页面打开文档，支持格式

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/openDocument)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 文件路径，可通过 downloadFile 获得 |
| showMenu | 是否显示右上角菜单 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| fileType | 文件类型，指定文件类型打开文件 |
| success | 接口调用成功的回调函数 |

#### FileType

文件类型

| 参数 | 说明 |
| --- | --- |
| doc | doc 格式 |
| docx | docx 格式 |
| xls | xls 格式 |
| xlsx | xlsx 格式 |
| ppt | ppt 格式 |
| pptx | pptx 格式 |
| pdf | pdf 格式 |

### Taro.getSavedFileList(option)

获取本地已保存的文件列表

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/getSavedFileList)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| fileList | 文件数组 |
| errMsg | 调用结果 |

#### FileItem

文件数组

| 参数 | 说明 |
| --- | --- |
| createTime | 文件保存时的时间戳，从1970/01/01 08:00:00 到当前时间的秒数 |
| filePath | 本地路径 |
| size | 本地文件大小，以字节为单位 |

### Taro.getSavedFileInfo(option)

获取本地文件的文件信息。此接口只能用于获取已保存到本地的文件，若需要获取临时文件信息，请使用 [Taro.getFileInfo](https://docs.taro.zone/docs/apis/files/getFileInfo) 接口。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/getSavedFileInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| createTime | 文件保存时的时间戳，从1970/01/01 08:00:00 到该时刻的秒数 |
| size | 文件大小，单位 B |
| errMsg | 调用结果 |

### Taro.getFileSystemManager()

获取全局唯一的文件管理器

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/getFileSystemManager)

### Taro.getFileInfo(option)

获取该小程序下的 本地临时文件 或 本地缓存文件 信息

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/getFileInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 要读取的文件路径 |
| digestAlgorithm | 计算文件摘要的算法 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 失败回调

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail file not exist': 指定的 filePath 找不到文件; |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| size | 文件大小，以字节为单位 |
| digest | 按照传入的 digestAlgorithm 计算得出的的文件摘要 |
| errMsg | 调用结果 |

### FileSystemManager

文件管理器，可通过 [Taro.getFileSystemManager](./getFileSystemManager) 获取。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/FileSystemManager)

##### access

判断文件/目录是否存在

```tsx
(option: AccessOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### accessSync

[FileSystemManager.access](#access) 的同步版本

```tsx
(path: string) => void
```

| 参数 | 说明 |
| --- | --- |
| path | 要判断是否存在的文件/目录路径 |

##### appendFile

在文件结尾追加内容

```tsx
(option: AppendFileOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### appendFileSync

[FileSystemManager.appendFile](#appendfile) 的同步版本

```tsx
(filePath: string, data: string | ArrayBuffer, encoding?: keyof Encoding) => void
```

| 参数 | 说明 |
| --- | --- |
| filePath | 要追加内容的文件路径 |
| data | 要追加的文本或二进制数据 |
| encoding | 指定写入文件的字符编码 |

##### close

关闭文件

```tsx
(option: CloseOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### closeSync

[FileSystemManager.close](#close) 的同步版本

```tsx
(option: CloseSyncOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### copyFile

复制文件

```tsx
(option: CopyFileOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### copyFileSync

[FileSystemManager.copyFile](#copyfile) 的同步版本

```tsx
(srcPath: string, destPath: string) => void
```

| 参数 | 说明 |
| --- | --- |
| srcPath | 源文件路径，只可以是普通文件 |
| destPath | 目标文件路径 |

##### fstat

获取文件的状态信息

```tsx
(option: FstatOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### fstatSync

[FileSystemManager.fstat](#fstat) 的同步版本

```tsx
(option: FstatSyncOption) => Stats
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### ftruncate

对文件内容进行截断操作

```tsx
(option: FtruncateOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### ftruncateSync

[FileSystemManager.ftruncate](#ftruncate) 的同步版本

```tsx
(option: FtruncateSyncOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getFileInfo

获取该小程序下的 `本地临时文件` 或 `本地缓存文件` 信息

```tsx
(option: getFileInfoOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getSavedFileList

获取该小程序下已保存的本地缓存文件列表

```tsx
(option?: getSavedFileListOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### mkdir

创建目录

```tsx
(option: MkdirOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### mkdirSync

[FileSystemManager.mkdir](#mkdir) 的同步版本

```tsx
(dirPath: string, recursive?: boolean) => void
```

| 参数 | 说明 |
| --- | --- |
| dirPath | 创建的目录路径 |
| recursive | 是否在递归创建该目录的上级目录后再创建该目录。如果对应的上级目录已经存在，则不创建该上级目录。如 dirPath 为 a/b/c/d 且 recursive 为 true，将创建 a 目录，再在 a 目录下创建 b 目录，以此类推直至创建 a/b/c 目录下的 d 目录。 |

##### open

打开文件，返回文件描述符

```tsx
(option: OpenOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### openSync

[FileSystemManager.openSync](#opensync) 的同步版本

```tsx
(option: OpenSyncOption) => string
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### read

读文件

```tsx
(option: ReadOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### readCompressedFile

读取指定压缩类型的本地文件内容

```tsx
(option: Option) => Promise<Promised>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### readCompressedFileSync

同步读取指定压缩类型的本地文件内容

```tsx
(option: Option) => ArrayBuffer
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### readdir

读取目录内文件列表

```tsx
(option: ReaddirOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### readdirSync

[FileSystemManager.readdir](#readdir) 的同步版本

```tsx
(dirPath: string) => string[]
```

| 参数 | 说明 |
| --- | --- |
| dirPath | 要读取的目录路径 |

##### readFile

读取本地文件内容

```tsx
(option: ReadFileOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### readFileSync

[FileSystemManager.readFile](#readfile) 的同步版本

```tsx
(filePath: string, encoding?: keyof Encoding, position?: number, length?: number) => string | ArrayBuffer
```

| 参数 | 说明 |
| --- | --- |
| filePath | 要读取的文件的路径 |
| encoding | 指定读取文件的字符编码，如果不传 encoding，则以 ArrayBuffer 格式读取文件的二进制内容 |
| position | 从文件指定位置开始读，如果不指定，则从文件头开始读。读取的范围应该是左闭右开区间 [position, position+length)。有效范围：[0, fileLength - 1]。单位：byte |
| length | 指定文件的长度，如果不指定，则读到文件末尾。有效范围：[1, fileLength]。单位：byte |

##### readSync

[FileSystemManager.read](#read) 的同步版本

```tsx
(option: ReadSyncOption) => { bytesRead: number; arrayBuffer: ArrayBuffer; }
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### readZipEntry

读取压缩包内的文件

```tsx
(option: Option) => Promise<Promised>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### removeSavedFile

删除该小程序下已保存的本地缓存文件

```tsx
(option: RemoveSavedFileOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### rename

重命名文件。可以把文件从 oldPath 移动到 newPath

```tsx
(option: RenameOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### renameSync

[FileSystemManager.rename](#rename) 的同步版本

```tsx
(oldPath: string, newPath: string) => void
```

| 参数 | 说明 |
| --- | --- |
| oldPath | 源文件路径，可以是普通文件或目录 |
| newPath | 新文件路径 |

##### rmdir

删除目录

```tsx
(option: RmdirOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### rmdirSync

[FileSystemManager.rmdir](#rmdir) 的同步版本

```tsx
(dirPath: string, recursive?: boolean) => void
```

| 参数 | 说明 |
| --- | --- |
| dirPath | 要删除的目录路径 |
| recursive | 是否递归删除目录。如果为 true，则删除该目录和该目录下的所有子目录以及文件。 |

##### saveFile

保存临时文件到本地。此接口会移动临时文件，因此调用成功后，tempFilePath 将不可用。

```tsx
(option: SaveFileOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### saveFileSync

[FileSystemManager.saveFile](#savefile) 的同步版本

```tsx
(tempFilePath: string, filePath?: string) => string
```

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 临时存储文件路径 |
| filePath | 要存储的文件路径 |

##### stat

获取文件 Stats 对象

```tsx
(option: StatOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### statSync

[FileSystemManager.stat](#stat) 的同步版本

```tsx
(path: string, recursive?: boolean) => any
```

| 参数 | 说明 |
| --- | --- |
| path | 文件/目录路径 |
| recursive | 是否递归获取目录下的每个文件的 Stats 信息 |

##### truncate

对文件内容进行截断操作

```tsx
(option: TruncateOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### truncateSync

对文件内容进行截断操作 ([truncate](#truncate) 的同步版本)

```tsx
(option: TruncateSyncOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### unlink

删除文件

```tsx
(option: UnlinkOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### unlinkSync

[FileSystemManager.unlink](#unlink) 的同步版本

```tsx
(filePath: string) => void
```

| 参数 | 说明 |
| --- | --- |
| filePath | 要删除的文件路径 |

##### unzip

解压文件

```tsx
(option: UnzipOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### write

写入文件

```tsx
(option: WriteOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### writeFile

写文件

```tsx
(option: WriteFileOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### writeFileSync

[FileSystemManager.writeFile](#writefile) 的同步版本

```tsx
(filePath: string, data: string | ArrayBuffer, encoding?: keyof Encoding) => void
```

| 参数 | 说明 |
| --- | --- |
| filePath | 要写入的文件路径 |
| data | 要写入的文本或二进制数据 |
| encoding | 指定写入文件的字符编码 |

##### writeSync

[write](#write) 的同步版本

```tsx
(option: WriteSyncOption) => { bytesWritten: number; }
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### Encoding

字符编码

| 参数 | 说明 |
| --- | --- |
| ascii |  |
| base64 |  |
| binary |  |
| hex |  |
| ucs2 | 以小端序读取 |
| ucs-2 | 以小端序读取 |
| utf16le | 以小端序读取 |
| utf-16le | 以小端序读取 |
| utf-8 |  |
| utf8 |  |
| latin1 |  |

##### flag

文件系统标志

##### AccessOption

| 参数 | 说明 |
| --- | --- |
| path | 要判断是否存在的文件/目录路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### AccessFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail no such file or directory ${path}': 文件/目录不存在; |

##### AppendFileOption

| 参数 | 说明 |
| --- | --- |
| data | 要追加的文本或二进制数据 |
| filePath | 要追加内容的文件路径 |
| encoding | 指定写入文件的字符编码 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### AppendFileFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail no such file or directory, open ${filePath}': 指定的 filePath 文件不存在;<br />- 'fail illegal operation on a directory, open "${filePath}"': 指定的 filePath 是一个已经存在的目录;<br />- 'fail permission denied, open ${dirPath}': 指定的 filePath 路径没有写权限;<br />- 'fail sdcard not mounted': 指定的 filePath 是一个已经存在的目录; |

##### CopyFileOption

| 参数 | 说明 |
| --- | --- |
| destPath | 目标文件路径 |
| srcPath | 源文件路径，只可以是普通文件 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### CopyFileFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail permission denied, copyFile ${srcPath} -> ${destPath}': 指定目标文件路径没有写权限;<br />- 'fail no such file or directory, copyFile ${srcPath} -> ${destPath}': 源文件不存在，或目标文件路径的上层目录不存在;<br />- 'fail the maximum size of the file storage limit is exceeded': 存储空间不足; |

##### getFileInfoOption

| 参数 | 说明 |
| --- | --- |
| filePath | 要读取的文件路径 |
| digestAlgorithm | 计算文件摘要的算法 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### GetFileInfoFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail file not exist': 指定的 filePath 找不到文件; |

##### GetFileInfoSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| size | 文件大小，以字节为单位 |
| digest | 按照传入的 digestAlgorithm 计算得出的的文件摘要 |
| errMsg | 调用结果 |

##### getSavedFileListOption

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### GetSavedFileListSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| fileList | 文件数组 |
| errMsg | 调用结果 |

##### GetSavedFileListSuccessCallbackResultFileItem

文件数组

| 参数 | 说明 |
| --- | --- |
| createTime | 文件保存时的时间戳，从1970/01/01 08:00:00 到当前时间的秒数 |
| filePath | 本地路径 |
| size | 本地文件大小，以字节为单位 |

##### MkdirOption

| 参数 | 说明 |
| --- | --- |
| dirPath | 创建的目录路径 |
| recursive | 是否在递归创建该目录的上级目录后再创建该目录。如果对应的上级目录已经存在，则不创建该上级目录。<br />如 dirPath 为 a/b/c/d 且 recursive 为 true，将创建 a 目录，再在 a 目录下创建 b 目录，以此类推直至创建 a/b/c 目录下的 d 目录。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### MkdirFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail no such file or directory ${dirPath}': 上级目录不存在;<br />- 'fail permission denied, open ${dirPath}': 指定的 filePath 路径没有写权限;<br />- 'fail file already exists ${dirPath}': 有同名文件或目录; |

##### ReadFileOption

| 参数 | 说明 |
| --- | --- |
| filePath | 要读取的文件的路径 |
| position | 从文件指定位置开始读，如果不指定，则从文件头开始读。读取的范围应该是左闭右开区间 [position, position+length)。有效范围：[0, fileLength - 1]。单位：byte |
| length | 指定文件的长度，如果不指定，则读到文件末尾。有效范围：[1, fileLength]。单位：byte |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| encoding | 指定读取文件的字符编码，如果不传 encoding，则以 ArrayBuffer 格式读取文件的二进制内容 |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ReadFileSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| data | 文件内容 |
| errMsg | 调用结果 |

##### ReadFileFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail no such file or directory, open ${filePath}': 指定的 filePath 所在目录不存在;<br />- 'fail permission denied, open ${dirPath}': 指定的 filePath 路径没有读权限; |

##### ReaddirOption

| 参数 | 说明 |
| --- | --- |
| dirPath | 要读取的目录路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ReaddirFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail no such file or directory ${dirPath}': 目录不存在;<br />- 'fail not a directory ${dirPath}': dirPath 不是目录;<br />- 'fail permission denied, open ${dirPath}': 指定的 filePath 路径没有读权限; |

##### ReaddirSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| files | 指定目录下的文件名数组。 |
| errMsg | 调用结果 |

###### Promised

```tsx
FailCallbackResult | SuccessCallbackResult
```

###### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 要读取的压缩包的路径 (本地路径) |
| encoding | 统一指定读取文件的字符编码，只在 entries 值为"all"时有效。如果 entries 值为"all"且不传 encoding，则以 ArrayBuffer 格式读取文件的二进制内容 |
| entries | 要读取的压缩包内的文件列表（当传入"all" 时表示读取压缩包内所有文件） |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### File

| 参数 | 说明 |
| --- | --- |
| path | 压缩包内文件路径 |
| encoding | 指定读取文件的字符编码，如果不传 encoding，则以 ArrayBuffer 格式读取文件的二进制内容 |
| position | 从文件指定位置开始读，如果不指定，则从文件头开始读。读取的范围应该是左闭右开区间 [position, position+length)。有效范围：[0, fileLength - 1]。单位：byte |
| length | 指定文件的长度，如果不指定，则读到文件末尾。有效范围：[1, fileLength]。单位：byte |

###### Encoding

字符编码合法值

| 参数 | 说明 |
| --- | --- |
| ascii |  |
| base64 |  |
| binary |  |
| hex |  |
| ucs2 | 异常情况：`以小端序读取` |
| ucs-2 | 异常情况：`以小端序读取` |
| utf16le | 异常情况：`以小端序读取` |
| utf-16le | 异常情况：`以小端序读取` |
| utf-8 |  |
| utf8 |  |
| latin1 |  |

###### 失败回调

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail no such file or directory, open ${filePath}': 指定的 filePath 所在目录不存在<br />- 'fail permission denied, open ${dirPath}': 指定的 filePath 路径没有读权限<br />- 'fail sdcard not mounted': Android sdcard 挂载失败 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| entries | 文件读取结果。res.entries 是一个对象，key是文件路径，value是一个对象 FileItem ，表示该文件的读取结果。每个 FileItem 包含 data （文件内容） 和 errMsg （错误信息） 属性。 |

###### FileItem

| 参数 | 说明 |
| --- | --- |
| data | 文件内容 |
| errMsg | 错误信息 |

##### RemoveSavedFileOption

| 参数 | 说明 |
| --- | --- |
| filePath | 需要删除的文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### RemoveSavedFileFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail file not exist': 指定的 tempFilePath 找不到文件; |

##### RenameOption

| 参数 | 说明 |
| --- | --- |
| newPath | 新文件路径 |
| oldPath | 源文件路径，可以是普通文件或目录 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### RenameFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail permission denied, rename ${oldPath} -> ${newPath}': 指定源文件或目标文件没有写权限;<br />- 'fail no such file or directory, rename ${oldPath} -> ${newPath}': 源文件不存在，或目标文件路径的上层目录不存在; |

##### RmdirOption

| 参数 | 说明 |
| --- | --- |
| dirPath | 要删除的目录路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| recursive | 是否递归删除目录。如果为 true，则删除该目录和该目录下的所有子目录以及文件。 |
| success | 接口调用成功的回调函数 |

##### RmdirFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail no such file or directory ${dirPath}': 目录不存在;<br />- 'fail directory not empty': 目录不为空;<br />- 'fail permission denied, open ${dirPath}': 指定的 dirPath 路径没有写权限; |

##### SaveFileOption

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 临时存储文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| filePath | 要存储的文件路径 |
| success | 接口调用成功的回调函数 |

##### SaveFileFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail tempFilePath file not exist': 指定的 tempFilePath 找不到文件;<br />- 'fail permission denied, open "${filePath}"': 指定的 filePath 路径没有写权限;<br />- 'fail no such file or directory "${dirPath}"': 上级目录不存在;<br />- 'fail the maximum size of the file storage limit is exceeded': 存储空间不足; |

##### SaveFileSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| savedFilePath | 存储后的文件路径 |
| errMsg | 调用结果 |

##### StatOption

| 参数 | 说明 |
| --- | --- |
| path | 文件/目录路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| recursive | 是否递归获取目录下的每个文件的 Stats 信息 |
| success | 接口调用成功的回调函数 |

##### StatFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail permission denied, open ${path}': 指定的 path 路径没有读权限;<br />- 'fail no such file or directory ${path}': 文件不存在; |

##### StatSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| stats | [Stats](https://docs.taro.zone/docs/apis/files/Stats) or Object<br />当 recursive 为 false 时，res.stats 是一个 Stats 对象。当 recursive 为 true 且 path 是一个目录的路径时，res.stats 是一个 Object，key 以 path 为根路径的相对路径，value 是该路径对应的 Stats 对象。 |
| errMsg | 调用结果 |

##### UnlinkOption

| 参数 | 说明 |
| --- | --- |
| filePath | 要删除的文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### UnlinkFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail permission denied, open ${path}': 指定的 path 路径没有读权限;<br />- 'fail no such file or directory ${path}': 文件不存在;<br />- 'fail operation not permitted, unlink ${filePath}': 传入的 filePath 是一个目录; |

##### UnzipOption

| 参数 | 说明 |
| --- | --- |
| targetPath | 目标目录路径 |
| zipFilePath | 源文件路径，只可以是 zip 压缩文件 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### UnzipFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail permission denied, unzip ${zipFilePath} -> ${destPath}': 指定目标文件路径没有写权限;<br />- 'fail no such file or directory, unzip ${zipFilePath} -> "${destPath}': 源文件不存在，或目标文件路径的上层目录不存在; |

##### WriteFileOption

| 参数 | 说明 |
| --- | --- |
| data | 要写入的文本或二进制数据 |
| filePath | 要写入的文件路径 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| encoding | 指定写入文件的字符编码 |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### WriteFileFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail no such file or directory, open ${filePath}': 指定的 filePath 所在目录不存在;<br />- 'fail permission denied, open ${dirPath}': 指定的 filePath 路径没有写权限;<br />- 'fail the maximum size of the file storage limit is exceeded': 存储空间不足; |

##### FstatOption

| 参数 | 说明 |
| --- | --- |
| fd | 文件描述符。fd 通过 FileSystemManager.open 或 FileSystemManager.openSync 接口获得 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### FstatFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'bad file descriptor': 无效的文件描述符;<br />- 'fail permission denied': 指定的 fd 路径没有读权限; |

##### FstatSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| stats | Stats 对象，包含了文件的状态信息 |
| errMsg | 调用结果 |

##### FstatSyncOption

| 参数 | 说明 |
| --- | --- |
| fd | 文件描述符。fd 通过 FileSystemManager.open 或 FileSystemManager.openSync 接口获得 |

##### CloseOption

| 参数 | 说明 |
| --- | --- |
| fd | 需要被关闭的文件描述符。fd 通过 FileSystemManager.open 或 FileSystemManager.openSync 接口获得 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### CloseFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'bad file descriptor': 无效的文件描述符 |

##### CloseSyncOption

| 参数 | 说明 |
| --- | --- |
| fd | 需要被关闭的文件描述符。fd 通过 FileSystemManager.open 或 FileSystemManager.openSync 接口获得 |

##### FtruncateOption

| 参数 | 说明 |
| --- | --- |
| fd | 文件描述符。fd 通过 FileSystemManager.open 或 FileSystemManager.openSync 接口获得 |
| length | 截断位置，默认0。如果 length 小于文件长度（单位：字节），则只有前面 length 个字节会保留在文件中，其余内容会被删除；如果 length 大于文件长度，则会对其进行扩展，并且扩展部分将填充空字节（'\0'） |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### FtruncateFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'bad file descriptor': 无效的文件描述符<br />- 'fail permission denied': 指定的 fd 没有写权限<br />- 'fail the maximum size of the file storage limit is exceeded': 存储空间不足<br />- 'fail sdcard not mounted android sdcard': 挂载失败 |

##### FtruncateSyncOption

| 参数 | 说明 |
| --- | --- |
| fd | 文件描述符。fd 通过 FileSystemManager.open 或 FileSystemManager.openSync 接口获得 |
| length | 截断位置，默认0。如果 length 小于文件长度（单位：字节），则只有前面 length 个字节会保留在文件中，其余内容会被删除；如果 length 大于文件长度，则会对其进行扩展，并且扩展部分将填充空字节（'\0'） |

##### OpenOption

| 参数 | 说明 |
| --- | --- |
| filePath | 文件路径 (本地路径) |
| flag | 文件系统标志，默认值: 'r' |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### OpenFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail no such file or directory "${filePath}"': 上级目录不存在 |

##### OpenSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| fd | 文件描述符 |
| errMsg | 调用结果 |

##### OpenSyncOption

| 参数 | 说明 |
| --- | --- |
| filePath | 文件路径 (本地路径) |
| flag | 文件系统标志，默认值: 'r' |

##### ReadOption

| 参数 | 说明 |
| --- | --- |
| fd | 文件描述符。fd 通过 FileSystemManager.open 或 FileSystemManager.openSync 接口获得 |
| arrayBuffer | 数据写入的缓冲区，必须是 ArrayBuffer 实例 |
| offset | 缓冲区中的写入偏移量，默认0 |
| length | 要从文件中读取的字节数，默认0 |
| position | 文件读取的起始位置，如不传或传 null，则会从当前文件指针的位置读取。如果 position 是正整数，则文件指针位置会保持不变并从 position 读取文件。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ReadFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'bad file descriptor': 无效的文件描述符<br />- 'fail permission denied': 指定的 fd 路径没有读权限<br />- 'fail the value of "offset" is out of range': 传入的 offset 不合法<br />- 'fail the value of "length" is out of range': 传入的 length 不合法<br />- 'fail sdcard not mounted': android sdcard 挂载失败<br />- 'bad file descriptor': 无效的文件描述符 |

##### ReadSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| bytesRead | 实际读取的字节数 |
| arrayBuffer | 被写入的缓存区的对象，即接口入参的 arrayBuffer |
| errMsg | 调用结果 |

###### Promised

```tsx
FailCallbackResult | SuccessCallbackResult
```

###### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 要读取的文件的路径 (本地用户文件或代码包文件) |
| compressionAlgorithm | 文件压缩类型，目前仅支持 'br'。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### CompressionAlgorithm

文件压缩类型合法值

| 参数 | 说明 |
| --- | --- |
| br | brotli压缩文件 |

###### 失败回调

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail decompress fail': 指定的 compressionAlgorithm 与文件实际压缩格式不符<br />- 'fail no such file or directory, open ${filePath}': 指定的 filePath 所在目录不存在<br />- 'fail permission denied, open ${dirPath}': 指定的 filePath 路径没有读权限 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| data | 文件内容 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 要读取的文件的路径 (本地用户文件或代码包文件) |
| compressionAlgorithm | 文件压缩类型，目前仅支持 'br'。 |

###### CompressionAlgorithm

文件压缩类型合法值

| 参数 | 说明 |
| --- | --- |
| br | brotli压缩文件 |

##### ReadSyncOption

| 参数 | 说明 |
| --- | --- |
| fd | 文件描述符。fd 通过 FileSystemManager.open 或 FileSystemManager.openSync 接口获得 |
| arrayBuffer | 数据写入的缓冲区，必须是 ArrayBuffer 实例 |
| offset | 缓冲区中的写入偏移量，默认0 |
| length | 要从文件中读取的字节数，默认0 |
| position | 文件读取的起始位置，如不传或传 null，则会从当前文件指针的位置读取。如果 position 是正整数，则文件指针位置会保持不变并从 position 读取文件。 |

##### TruncateOption

| 参数 | 说明 |
| --- | --- |
| filePath | 要截断的文件路径 (本地路径) |
| length | 截断位置，默认0。如果 length 小于文件长度（字节），则只有前面 length 个字节会保留在文件中，其余内容会被删除；如果 length 大于文件长度，则会对其进行扩展，并且扩展部分将填充空字节（'\0'） |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### TruncateFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />- 'fail no such file or directory, open ${filePath}': 指定的 filePath 所在目录不存在<br />- 'fail illegal operation on a directory, open "${filePath}"': 指定的 filePath 是一个已经存在的目录<br />- 'fail permission denied, open ${dirPath}': 指定的 filePath 路径没有写权限<br />- 'fail the maximum size of the file storage limit is exceeded': 存储空间不足<br />- 'fail sdcard not mounted': android sdcard 挂载失败 |

##### TruncateSyncOption

| 参数 | 说明 |
| --- | --- |
| filePath | 要截断的文件路径 (本地路径) |
| length | 截断位置，默认0。如果 length 小于文件长度（字节），则只有前面 length 个字节会保留在文件中，其余内容会被删除；如果 length 大于文件长度，则会对其进行扩展，并且扩展部分将填充空字节（'\0'） |

##### WriteOption

| 参数 | 说明 |
| --- | --- |
| fd | 文件描述符。fd 通过 FileSystemManager.open 或 FileSystemManager.openSync 接口获得 |
| data | 写入的内容，类型为 String 或 ArrayBuffer |
| offset | 只在 data 类型是 ArrayBuffer 时有效，决定 arrayBuffe 中要被写入的部位，即 arrayBuffer 中的索引，默认0 |
| length | 只在 data 类型是 ArrayBuffer 时有效，指定要写入的字节数，默认为 arrayBuffer 从0开始偏移 offset 个字节后剩余的字节数 |
| encoding | 只在 data 类型是 String 时有效，指定写入文件的字符编码，默认为 utf8 |
| position | 指定文件开头的偏移量，即数据要被写入的位置。当 position 不传或者传入非 Number 类型的值时，数据会被写入当前指针所在位置。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### WriteFailCallbackResult

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息<br />可选值：<br />'bad file descriptor': 无效的文件描述符<br />'fail permission denied': 指定的 fd 路径没有写权限<br />'fail sdcard not mounted': android sdcard 挂载失败 |

##### WriteSuccessCallbackResult

| 参数 | 说明 |
| --- | --- |
| bytesWritten | 实际被写入到文件中的字节数（注意，被写入的字节数不一定与被写入的字符串字符数相同） |
| errMsg | 调用结果 |

##### WriteSyncOption

| 参数 | 说明 |
| --- | --- |
| fd | 文件描述符。fd 通过 FileSystemManager.open 或 FileSystemManager.openSync 接口获得 |
| data | 写入的内容，类型为 String 或 ArrayBuffer |
| offset | 只在 data 类型是 ArrayBuffer 时有效，决定 arrayBuffe 中要被写入的部位，即 arrayBuffer 中的索引，默认0 |
| length | 只在 data 类型是 ArrayBuffer 时有效，指定要写入的字节数，默认为 arrayBuffer 从0开始偏移 offset 个字节后剩余的字节数 |
| encoding | 只在 data 类型是 String 时有效，指定写入文件的字符编码，默认为 utf8 |
| position | 指定文件开头的偏移量，即数据要被写入的位置。当 position 不传或者传入非 Number 类型的值时，数据会被写入当前指针所在位置。 |

### ReadResult

文件读取结果。 通过 [FileSystemManager.readSync](./FileSystemManager#readsync) 接口返回

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/ReadResult)

#### 方法

| 参数 | 说明 |
| --- | --- |
| bytesRead | 实际读取的字节数 |
| arrayBuffer | 被写入的缓存区的对象，即接口入参的 arrayBuffer |

### Stats

描述文件状态的对象

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/Stats)

#### 方法

| 参数 | 说明 |
| --- | --- |
| mode | 文件的类型和存取的权限，对应 POSIX stat.st_mode |
| size | 文件大小，单位：B，对应 POSIX stat.st_size |
| lastAccessedTime | 文件最近一次被存取或被执行的时间，UNIX 时间戳，对应 POSIX stat.st_atime |
| lastModifiedTime | 文件最后一次被修改的时间，UNIX 时间戳，对应 POSIX stat.st_mtime |

##### isDirectory

判断当前文件是否一个目录

```tsx
() => boolean
```

##### isFile

判断当前文件是否一个普通文件

```tsx
() => boolean
```

### WriteResult

文件写入结果。 通过 [FileSystemManager.writeSync](./FileSystemManager#writesync) 接口返回

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/files/WriteResult)

#### 方法

| 参数 | 说明 |
| --- | --- |
| bytesWritten | 实际被写入到文件中的字节数（注意，被写入的字节数不一定与被写入的字符串字符数相同） |

## 开放接口

### Taro.pluginLogin(option)

**该接口仅在小程序插件中可调用**，调用接口获得插件用户标志凭证（code）。插件可以此凭证换取用于识别用户的标识 openpid。用户不同、宿主小程序不同或插件不同的情况下，该标识均不相同，即当且仅当同一个用户在同一个宿主小程序中使用同一个插件时，openpid 才会相同

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/login/pluginLogin)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| code | 用于换取 openpid 的凭证（有效期五分钟）。插件开发者可以用此 code 在开发者服务器后台调用 [auth.getPluginOpenPId](https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/user-info/auth.getPluginOpenPId.html) 换取 openpid。 |

### Taro.login(option)

调用接口获取登录凭证（code）。通过凭证进而换取用户登录态信息，包括用户的唯一标识（openid）及本次登录的会话密钥（session_key）等。用户数据的加解密通讯需要依赖会话密钥完成。更多使用方法详见 [小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/login/login)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |
| timeout | 超时时间，单位ms |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| code | 用户登录凭证（有效期五分钟）。开发者需要在开发者服务器后台调用 [auth.code2Session](https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html)，使用 code 换取 openid 和 session_key 等信息 |
| errMsg | 调用结果 |

### Taro.checkSession(option)

检查登录态是否过期。

通过 Taro.login 接口获得的用户登录态拥有一定的时效性。用户越久未使用小程序，用户登录态越有可能失效。反之如果用户一直在使用小程序，则用户登录态一直保持有效。具体时效逻辑由微信维护，对开发者透明。开发者只需要调用 Taro.checkSession 接口检测当前用户登录态是否有效。

登录态过期后开发者可以再调用 Taro.login 获取新的用户登录态。调用 Taro.checkSession 成功说明当前 session_key 未过期，调用失败说明 session_key 已过期。更多使用方法详见 [小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/login/checkSession)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getAccountInfoSync()

获取当前帐号信息

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/account/getAccountInfoSync)

#### AccountInfo

帐号信息

| 参数 | 说明 |
| --- | --- |
| miniProgram | 小程序帐号信息 |
| plugin | 插件帐号信息（仅在插件中调用时包含这一项） |

#### MiniProgram

小程序帐号信息

| 参数 | 说明 |
| --- | --- |
| appId | 小程序 appId |
| envVersion | 小程序版本<br />since: 2.10.0 |
| version | 线上小程序版本号<br />since: 2.10.2 |

#### Plugin

插件帐号信息（仅在插件中调用时包含这一项）

| 参数 | 说明 |
| --- | --- |
| appId | 插件 appId |
| version | 插件版本号 |

### Taro.getUserProfile(option)

> 最低 Taro 版本: 2.2.17+，3.0.29+

获取用户信息。每次请求都会弹出授权窗口，用户同意后返回 `userInfo`。

若开发者需要获取用户的个人信息（头像、昵称、性别与地区），可以通过 Taro.getUserProfile 接口进行获取，

微信该接口从基础库 **2.10.4** 版本开始支持，该接口只返回用户个人信息，不包含用户身份标识符。该接口中 desc 属性（声明获取用户个人信息后的用途）后续会展示在弹窗中，请开发者谨慎填写。

开发者每次通过该接口获取用户个人信息均需用户确认，请开发者妥善保管用户快速填写的头像昵称，避免重复弹窗。

[微信端调整背景和说明，请参考文档](https://developers.weixin.qq.com/community/develop/doc/000cacfa20ce88df04cb468bc52801)

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/user-info/getUserProfile)

#### 参数

| 参数 | 说明 |
| --- | --- |
| lang | 显示用户信息的语言 |
| desc | 声明获取用户个人信息后的用途，不超过30个字符 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| userInfo | 用户信息对象 |
| rawData | 不包括敏感信息的原始数据字符串，用于计算签名 |
| signature | 使用 sha1( rawData + sessionkey ) 得到字符串，用于校验用户信息，详见 [用户数据的签名验证和加解密](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html) |
| encryptedData | 包括敏感数据在内的完整用户信息的加密数据，详见 [用户数据的签名验证和加解密](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#%E5%8A%A0%E5%AF%86%E6%95%B0%E6%8D%AE%E8%A7%A3%E5%AF%86%E7%AE%97%E6%B3%95) |
| iv | 加密算法的初始向量，详见 [用户数据的签名验证和加解密](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#%E5%8A%A0%E5%AF%86%E6%95%B0%E6%8D%AE%E8%A7%A3%E5%AF%86%E7%AE%97%E6%B3%95) |
| cloudID | 敏感数据对应的云 ID，开通云开发的小程序才会返回，可通过云调用直接获取开放数据，详细 [见云调用直接获取开放数据](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#method-cloud) |

### Taro.getUserInfo(option)

获取用户信息。

**接口调整说明**
在用户未授权过的情况下调用此接口，将不再出现授权弹窗，会直接进入 fail 回调（详见[《公告》](https://developers.weixin.qq.com/community/develop/doc/0000a26e1aca6012e896a517556c01))。在用户已授权的情况下调用此接口，可成功获取用户信息。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/user-info/getUserInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| lang | 显示用户信息的语言 |
| success | 接口调用成功的回调函数 |
| withCredentials | 是否带上登录态信息。当 withCredentials 为 true 时，要求此前有调用过 Taro.login 且登录态尚未过期，此时返回的数据会包含 encryptedData, iv 等敏感信息；当 withCredentials 为 false 时，不要求有登录态，返回的数据不包含 encryptedData, iv 等敏感信息。 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| cloudID | 敏感数据对应的云 ID，开通[云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)的小程序才会返回，可通过云调用直接获取开放数据，详细见[云调用直接获取开放数据](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#method-cloud) |
| encryptedData | 包括敏感数据在内的完整用户信息的加密数据，详见 [用户数据的签名验证和加解密](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#%E5%8A%A0%E5%AF%86%E6%95%B0%E6%8D%AE%E8%A7%A3%E5%AF%86%E7%AE%97%E6%B3%95) |
| iv | 加密算法的初始向量，详见 [用户数据的签名验证和加解密](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#%E5%8A%A0%E5%AF%86%E6%95%B0%E6%8D%AE%E8%A7%A3%E5%AF%86%E7%AE%97%E6%B3%95) |
| rawData | 不包括敏感信息的原始数据字符串，用于计算签名 |
| signature | 使用 sha1( rawData + sessionkey ) 得到字符串，用于校验用户信息，详见 [用户数据的签名验证和加解密](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html) |
| userInfo | 用户信息对象，不包含 openid 等敏感信息 |
| errMsg | 调用结果 |

### UserInfo

用户信息

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/user-info/UserInfo)

#### 方法

| 参数 | 说明 |
| --- | --- |
| nickName | 用户昵称 |
| avatarUrl | 用户头像图片的 URL。URL 最后一个数值代表正方形头像大小（有 0、46、64、96、132 数值可选，0 代表 640x640 的正方形头像，46 表示 46x46 的正方形头像，剩余数值以此类推。默认132），用户没有头像时该项为空。若用户更换头像，原有头像 URL 将失效。 |
| gender | 用户性别。不再返回，参考 [相关公告](https://developers.weixin.qq.com/community/develop/doc/00028edbe3c58081e7cc834705b801) |
| country | 用户所在国家。不再返回，参考 [相关公告](https://developers.weixin.qq.com/community/develop/doc/00028edbe3c58081e7cc834705b801) |
| province | 用户所在省份。不再返回，参考 [相关公告](https://developers.weixin.qq.com/community/develop/doc/00028edbe3c58081e7cc834705b801) |
| city | 用户所在城市。不再返回，参考 [相关公告](https://developers.weixin.qq.com/community/develop/doc/00028edbe3c58081e7cc834705b801) |
| language | 显示 country，province，city 所用的语言。强制返回 “zh_CN”，参考 [相关公告](https://developers.weixin.qq.com/community/develop/doc/00028edbe3c58081e7cc834705b801) |

##### Language

| 参数 | 说明 |
| --- | --- |
| en |  |
| zh_CN |  |
| zh_TW |  |

##### Gender

| 参数 | 说明 |
| --- | --- |
| 0 |  |
| 1 |  |
| 2 |  |

### Taro.authorizeForMiniProgram(option)

**仅小程序插件中能调用该接口**，用法同 [Taro.authorize](../authorize)。目前仅支持三种 scope

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/authorize/authorizeForMiniProgram)

#### 参数

| 参数 | 说明 |
| --- | --- |
| scope | 需要获取权限的 scope，详见 [scope 列表](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html#scope-%E5%88%97%E8%A1%A8) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### Scope

scope 合法值

### Taro.authorize(option)

提前向用户发起授权请求。调用后会立刻弹窗询问用户是否同意授权小程序使用某项功能或获取用户的某些数据，但不会实际调用对应接口。如果用户之前已经同意授权，则不会出现弹窗，直接返回成功。更多用法详见 [用户授权](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/authorize/authorize)

#### 参数

| 参数 | 说明 |
| --- | --- |
| scope | 需要获取权限的 scope，详见 [scope 列表](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html#scope-%E5%88%97%E8%A1%A8) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.openSetting(option)

调起客户端小程序设置界面，返回用户设置的操作结果。**设置界面只会出现小程序已经向用户请求过的[权限](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html)**。

注意：[2.3.0](https://developers.weixin.qq.com/miniprogram/dev/framework/compatibility.html) 版本开始，用户发生点击行为后，才可以跳转打开设置页，管理授权信息。[详情](https://developers.weixin.qq.com/community/develop/doc/000cea2305cc5047af5733de751008)

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/settings/openSetting)

#### 参数

| 参数 | 说明 |
| --- | --- |
| withSubscriptions | 是否同时获取用户订阅消息的订阅状态，默认不获取。注意：withSubscriptions 只返回用户勾选过订阅面板中的“总是保持以上选择，不再询问”的订阅消息。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| authSetting | 用户授权结果 |
| subscriptionsSetting | 用户订阅消息设置，接口参数 withSubscriptions 值为 true 时才会返回。 |
| errMsg | 调用结果 |

### Taro.getSetting(option)

获取用户的当前设置。**返回值中只会出现小程序已经向用户请求过的[权限](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html)**。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/settings/getSetting)

#### 参数

| 参数 | 说明 |
| --- | --- |
| withSubscriptions | 是否同时获取用户订阅消息的订阅状态，默认不获取。注意：withSubscriptions 只返回用户勾选过订阅面板中的“总是保持以上选择，不再询问”的订阅消息。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| authSetting | 用户授权结果 |
| subscriptionsSetting | 用户订阅消息设置，接口参数 withSubscriptions 值为 true 时才会返回。 |
| miniprogramAuthSetting | 在插件中调用时，当前宿主小程序的用户授权结果 |
| errMsg | 调用结果 |

### AuthSetting

用户授权设置信息，详情参考[权限](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html)

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/settings/AuthSetting)

#### 方法

| 参数 | 说明 |
| --- | --- |
| scope.userInfo | 是否授权用户信息，对应接口 [Taro.getUserInfo](https://docs.taro.zone/docs/apis/open-api/user-info/getUserInfo) |
| scope.userLocation | 是否授权地理位置，对应接口 [Taro.getLocation](https://docs.taro.zone/docs/apis/location/getLocation), [Taro.chooseLocation](https://docs.taro.zone/docs/apis/location/chooseLocation) |
| scope.address | 是否授权通讯地址，对应接口 [Taro.chooseAddress](https://docs.taro.zone/docs/apis/open-api/address/chooseAddress) |
| scope.invoiceTitle | 是否授权发票抬头，对应接口 [Taro.chooseInvoiceTitle](https://docs.taro.zone/docs/apis/open-api/invoice/chooseInvoiceTitle) |
| scope.invoice | 是否授权获取发票，对应接口 [Taro.chooseInvoice](https://docs.taro.zone/docs/apis/open-api/invoice/chooseInvoice) |
| scope.werun | 是否授权微信运动步数，对应接口 [Taro.getWeRunData](https://docs.taro.zone/docs/apis/open-api/werun/getWeRunData) |
| scope.record | 是否授权录音功能，对应接口 [Taro.startRecord](https://docs.taro.zone/docs/apis/media/recorder/startRecord) |
| scope.writePhotosAlbum | 是否授权保存到相册 [Taro.saveImageToPhotosAlbum](https://docs.taro.zone/docs/apis/media/image/saveImageToPhotosAlbum), [Taro.saveVideoToPhotosAlbum](https://docs.taro.zone/docs/apis/media/video/saveVideoToPhotosAlbum) |
| scope.camera | 是否授权摄像头，对应 [camera](https://docs.taro.zone/docs/components/media/camera) 组件 |
| scope.bluetoothBackground | 是否授权小程序在后台运行蓝牙，对应接口 [Taro.openBluetoothAdapterBackground](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/setting/(wx.openBluetoothAdapterBackground).html) |

### SubscriptionsSetting

订阅消息设置

注意事项
- itemSettings 只返回用户勾选过订阅面板中的“总是保持以上选择，不再询问”的订阅消息。

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/settings/SubscriptionsSetting)

#### 方法

| 参数 | 说明 |
| --- | --- |
| mainSwitch | 订阅消息总开关，true 为开启，false 为关闭 |
| itemSettings | 每一项订阅消息的订阅状态。itemSettings对象的键为一次性订阅消息的模板id或系统订阅消息的类型<br />- 一次性订阅消息使用方法详见 [Taro.requestSubscribeMessage](https://docs.taro.zone/docs/apis/open-api/subscribe-message/requestSubscribeMessage)<br />- 永久订阅消息（仅小游戏可用）使用方法详见 [Taro.requestSubscribeSystemMessage](https://developers.weixin.qq.com/minigame/dev/api/open-api/subscribe-message/wx.requestSubscribeSystemMessage.html) |

##### TemplateReflex

模版消息订阅类型

| 参数 | 说明 |
| --- | --- |
| accept | 表示用户同意订阅该条id对应的模板消息 |
| reject | 表示用户拒绝订阅该条id对应的模板消息 |
| ban | 表示已被后台封禁 |

### Taro.chooseAddress(option)

获取用户收货地址。调起用户编辑收货地址原生界面，并在编辑完成后返回用户选择的地址。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/address/chooseAddress)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| userName | 收货人姓名 |
| postalCode | 邮编 |
| provinceName | 国标收货地址第一级地址 |
| cityName | 国标收货地址第二级地址 |
| countyName | 国标收货地址第三级地址 |
| streetName | 国标收货地址第四级地址 |
| detailInfo | 详细收货地址信息 |
| detailInfoNew | 新选择器详细收货地址信息 |
| nationalCode | 收货地址国家码 |
| telNumber | 收货人手机号码 |

### Taro.openCard(option)

查看微信卡包中的卡券。只有通过 [认证](https://developers.weixin.qq.com/miniprogram/product/renzheng.html) 的小程序或文化互动类目的小游戏才能使用。更多文档请参考 [微信卡券接口文档](https://mp.weixin.qq.com/cgi-bin/announce?action=getannouncement&key=1490190158&version=1&lang=zh_CN&platform=2)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/card/openCard)

#### 参数

| 参数 | 说明 |
| --- | --- |
| cardList | 需要打开的卡券列表 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### RequestInfo

需要打开的卡券列表

| 参数 | 说明 |
| --- | --- |
| cardId | 卡券 ID |
| code | 由 Taro.addCard 的返回对象中的加密 code 通过解密后得到，解密请参照：[code 解码接口](https://mp.weixin.qq.com/wiki?t=resource/res_main&id=mp1499332673_Unm7V) |

### Taro.addCard(option)

批量添加卡券。只有通过 [认证](https://developers.weixin.qq.com/miniprogram/product/renzheng.html) 的小程序或文化互动类目的小游戏才能使用。更多文档请参考 [微信卡券接口文档](https://mp.weixin.qq.com/cgi-bin/announce?action=getannouncement&key=1490190158&version=1&lang=zh_CN&platform=2)。

**cardExt 说明**
cardExt 是卡券的扩展参数，其值是一个 JSON 字符串。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/card/addCard)

#### 参数

| 参数 | 说明 |
| --- | --- |
| cardList | 需要添加的卡券列表 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### RequestInfo

需要添加的卡券列表

| 参数 | 说明 |
| --- | --- |
| cardExt | 卡券的扩展参数。需将 CardExt 对象 JSON 序列化为**字符串**传入 |
| cardId | 卡券 ID |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| cardList | 卡券添加结果列表 |
| errMsg | 调用结果 |

#### AddCardResponseInfo

卡券添加结果列表

| 参数 | 说明 |
| --- | --- |
| cardExt | 卡券的扩展参数，结构请参考下文 |
| cardId | 用户领取到卡券的 ID |
| code | 加密 code，为用户领取到卡券的code加密后的字符串，解密请参照：[code 解码接口](https://mp.weixin.qq.com/wiki?t=resource/res_main&id=mp1499332673_Unm7V) |
| isSuccess | 是否成功 |

### Taro.chooseInvoiceTitle(option)

选择用户的发票抬头。当前小程序必须关联一个公众号，且这个公众号是完成了[微信认证](https://mp.weixin.qq.com/wiki?t=resource/res_main&id=mp1496554031_RD4xe)的，才能调用 chooseInvoiceTitle。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/invoice/chooseInvoiceTitle)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| bankAccount | 银行账号 |
| bankName | 银行名称 |
| companyAddress | 单位地址 |
| errMsg | 错误信息 |
| taxNumber | 抬头税号 |
| telephone | 手机号码 |
| title | 抬头名称 |
| type | 抬头类型 |

#### InvoiceType

抬头类型

| 参数 | 说明 |
| --- | --- |
| 0 |  |
| 1 |  |

### Taro.chooseInvoice(option)

选择用户已有的发票。

**通过 cardId 和 encryptCode 获得报销发票的信息**
请参考[微信电子发票文档](https://mp.weixin.qq.com/wiki?t=resource/res_main&id=21517918939oae3U)中，「查询报销发票信息」部分。
其中 `access_token` 的获取请参考[auth.getAccessToken](https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/access-token/auth.getAccessToken.html)文档

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/invoice/chooseInvoice)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| invoiceInfo | 用户选中的发票信息，格式为一个 JSON 字符串，包含三个字段： card_id：所选发票卡券的 cardId，encrypt_code：所选发票卡券的加密 code，报销方可以通过 cardId 和 encryptCode 获得报销发票的信息，app_id： 发票方的 appId。 |
| errMsg | 调用结果 |

### Taro.startSoterAuthentication(option)

开始 SOTER 生物认证。验证流程请参考[说明](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/bio-auth.html)。

**resultJSON 说明**
此数据为设备TEE中，将传入的challenge和TEE内其他安全信息组成的数据进行组装而来的JSON，对下述字段的解释如下表。例子如下：
| 字段名 | 说明 |
|---|----|
| raw | 调用者传入的challenge |
| fid | （仅Android支持）本次生物识别认证的生物信息编号（如指纹识别则是指纹信息在本设备内部编号） |
| counter | 防重放特征参数 |
| tee_n | TEE名称（如高通或者trustonic等） |
| tee_v | TEE版本号 |
| fp_n | 指纹以及相关逻辑模块提供商（如FPC等） |
| fp_v | 指纹以及相关模块版本号 |
| cpu_id | 机器唯一识别ID |
| uid | 概念同Android系统定义uid，即应用程序编号 |

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/soter/startSoterAuthentication)

#### 参数

| 参数 | 说明 |
| --- | --- |
| challenge | 挑战因子。挑战因子为调用者为此次生物鉴权准备的用于签名的字符串关键识别信息，将作为 `resultJSON` 的一部分，供调用者识别本次请求。例如：如果场景为请求用户对某订单进行授权确认，则可以将订单号填入此参数。 |
| requestAuthModes | 请求使用的可接受的生物认证方式 |
| authContent | 验证描述，即识别过程中显示在界面上的对话框提示内容 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| authMode | 生物认证方式 |
| errCode | 错误码 |
| errMsg | 错误信息 |
| resultJSON | 在设备安全区域（TEE）内获得的本机安全信息（如TEE名称版本号等以及防重放参数）以及本次认证信息（仅Android支持，本次认证的指纹ID）。具体说明见下文 |
| resultJSONSignature | 用SOTER安全密钥对 `resultJSON` 的签名(SHA256 with RSA/PSS, saltlen=20) |

#### requestAuthModes

| 参数 | 说明 |
| --- | --- |
| fingerPrint | 指纹识别 |
| facial | 人脸识别 |

### Taro.checkIsSupportSoterAuthentication(option)

获取本机支持的 SOTER 生物认证方式

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/soter/checkIsSupportSoterAuthentication)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| supportMode | 该设备支持的可被SOTER识别的生物识别方式 |
| errMsg | 调用信息 |

#### requestAuthModes

| 参数 | 说明 |
| --- | --- |
| fingerPrint | 指纹识别 |
| facial | 人脸识别 |

### Taro.checkIsSoterEnrolledInDevice(option)

获取设备内是否录入如指纹等生物信息的接口

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/soter/checkIsSoterEnrolledInDevice)

#### 参数

| 参数 | 说明 |
| --- | --- |
| checkAuthMode | 认证方式 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### RequestAuthModes

| 参数 | 说明 |
| --- | --- |
| fingerPrint | 指纹识别 |
| facial | 人脸识别 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |
| isEnrolled | 是否已录入信息 |

### Taro.shareToWeRun(option)

分享数据到微信运动。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/werun/shareToWeRun)

#### 参数

| 参数 | 说明 |
| --- | --- |
| recordList | 运动数据列表 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### record

| 参数 | 说明 |
| --- | --- |
| typeId | 运动项目id |
| time | 运动时长 |
| distance | 运动距离 |
| calorie | 消耗卡路里 |

### Taro.getWeRunData(option)

获取用户过去三十天微信运动步数。需要先调用 Taro.login 接口。步数信息会在用户主动进入小程序时更新。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/werun/getWeRunData)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| cloudID | 敏感数据对应的云 ID，开通云开发的小程序才会返回，可通过云调用直接获取开放数据，详细见[云调用直接获取开放数据](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#method-cloud) |
| encryptedData | 包括敏感数据在内的完整用户信息的加密数据，详细见[加密数据解密算法](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html)。解密后得到的数据结构见后文 |
| iv | 加密算法的初始向量，详细见[加密数据解密算法](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html) |
| errMsg | 调用结果 |

### Taro.requestSubscribeMessage(option)

请求订阅消息

注意：[2.8.2](https://developers.weixin.qq.com/miniprogram/dev/framework/compatibility.html) 版本开始，用户发生点击行为或者发起支付回调后，才可以调起订阅消息界面。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/subscribe-message/requestSubscribeMessage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| tmplIds | 需要订阅的消息模板的id的集合（注意：iOS客户端7.0.6版本、Android客户端7.0.7版本之后的一次性订阅/长期订阅才支持多个模板消息，iOS客户端7.0.5版本、Android客户端7.0.6版本之前的一次订阅只支持一个模板消息）消息模板id在[微信公众平台(mp.weixin.qq.com)-功能-订阅消息]中配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 失败回调

| 参数 | 说明 |
| --- | --- |
| errCode | 接口调用失败错误码 |
| errMsg | 接口调用失败错误信息 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| [TEMPLATE_ID] | 动态的键，即模板id |
| errMsg | 接口调用成功时errMsg值为'requestSubscribeMessage:ok' |

#### ISubscribeResult

| 参数 | 说明 |
| --- | --- |
| subscribeEntityIds | 订阅成功的模板列表 |
| subscribedEntityIds | 最终订阅成功的模板列表 |
| unsubscribedEntityIds | 未订阅的模板列表 |
| currentSubscribedEntityIds | 本次新增订阅成功的模板列表 |

#### TemplateReflex

模版消息订阅类型

| 参数 | 说明 |
| --- | --- |
| accept | 表示用户同意订阅该条id对应的模板消息 |
| reject | 表示用户拒绝订阅该条id对应的模板消息 |
| ban | 表示已被后台封禁 |
| filter | 表示该模板因为模板标题同名被后台过滤 |

### Taro.requestSubscribeDeviceMessage(option)

订阅设备消息接口，调用后弹出授权框，用户同意后会允许开发者给用户发送订阅模版消息。当用户点击“允许”按钮时，模板消息会被添加到用户的小程序设置页，通过 wx.getSetting 接口可获取用户对相关模板消息的订阅状态。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/subscribe-message/requestSubscribeDeviceMessage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| tmplIds | 需要订阅的消息模板的 id 的集合，一次调用最多可订阅3条消息 |
| sn | 设备唯一序列号。由厂商分配，长度不能超过128字节。字符只接受数字，大小写字母，下划线（_）和连字符（-）。 |
| snTicket | 设备票据，5分钟内有效。 |
| modelId | 设备型号 id 。通过微信公众平台注册设备获得。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 失败回调

| 参数 | 说明 |
| --- | --- |
| errCode | 接口调用失败错误码，有可能为空 |
| errMsg | 接口调用失败错误信息 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| [TEMPLATE_ID] | [TEMPLATE_ID]是动态的键，即模板id |
| errMsg | 接口调用成功时errMsg值为'requestSubscribeMessage:ok' |

#### TemplateReflex

模版消息订阅类型

| 参数 | 说明 |
| --- | --- |
| accept | 表示用户同意订阅该条id对应的模板消息 |
| reject | 表示用户拒绝订阅该条id对应的模板消息 |
| ban | 表示已被后台封禁 |
| filter | 表示该模板因为模板标题同名被后台过滤 |
| acceptWithAudio | 表示用户接收订阅消息并开启了语音提醒 |

### Taro.showRedPackage(option)

拉取h5领取红包封面页。获取参考红包封面地址参考 [微信红包封面开发平台](https://cover.weixin.qq.com/cgi-bin/mmcover-bin/readtemplate?t=page/index#/doc?page=introduce)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/redpackage/showRedPackage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 封面地址 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.addVideoToFavorites(option)

收藏视频

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/favorites/addVideoToFavorites)

#### 参数

| 参数 | 说明 |
| --- | --- |
| videoPath | 要收藏的视频地址，必须为本地路径或临时路径 |
| thumbPath | 缩略图路径，若留空则使用视频首帧 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.addFileToFavorites(option)

收藏文件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/favorites/addFileToFavorites)

#### 参数

| 参数 | 说明 |
| --- | --- |
| filePath | 要收藏的文件地址，必须为本地路径或临时路径 |
| fileName | 自定义文件名，若留空则使用filePath中的文件名 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.checkIsAddedToMyMiniProgram(option)

检查小程序是否被添加至 「我的小程序」

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/my-miniprogram/checkIsAddedToMyMiniProgram)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| added | 是否被添加至 「我的小程序」 |

### Taro.chooseLicensePlate(option)

选择车牌号

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/license-plate/chooseLicensePlate)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| plateNumber | 用户选择的车牌号 |

### Taro.reserveChannelsLive(option)

预约视频号直播

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/channels/reserveChannelsLive)

#### 参数

| 参数 | 说明 |
| --- | --- |
| noticeId | 预告 id，通过 [getChannelsLiveNoticeInfo](./getChannelsLiveNoticeInfo) 接口获取 |

### Taro.openChannelsUserProfile(option)

打开视频号主页

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/channels/openChannelsUserProfile)

#### 参数

| 参数 | 说明 |
| --- | --- |
| finderUserName | 视频号 id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.openChannelsLive(option)

打开视频号直播

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/channels/openChannelsLive)

#### 参数

| 参数 | 说明 |
| --- | --- |
| finderUserName | 视频号 id，以“sph”开头的id，可在视频号助手获取 |
| feedId | 直播 feedId，通过 getChannelsLiveInfo 接口获取 |
| nonceId | 直播 nonceId，通过 getChannelsLiveInfo 接口获取 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.openChannelsEvent(option)

打开视频号活动页

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/channels/openChannelsEvent)

#### 参数

| 参数 | 说明 |
| --- | --- |
| finderUserName | 视频号 id，以“sph”开头的id，可在视频号助手获取 |
| eventId | 活动 id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.openChannelsActivity(option)

打开视频号视频

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/channels/openChannelsActivity)

#### 参数

| 参数 | 说明 |
| --- | --- |
| finderUserName | 视频号 id，以“sph”开头的id，可在视频号助手获取 |
| feedId | 视频 feedId |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getChannelsShareKey(option)

获取视频号直播卡片/视频卡片的分享来源，
仅当卡片携带了分享信息、同时用户已授权该小程序获取视频号分享信息且启动场景值为 1177、1184、1195、1208 时可用

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/channels/getChannelsShareKey)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| sharerOpenId | 分享者 openid |
| promoter | 推广员 |

#### Promoter

| 参数 | 说明 |
| --- | --- |
| finderNickname | 推广员昵称 |
| promoterId | 推广员id |
| promoterOpenId | 推广员openid |

### Taro.getChannelsLiveNoticeInfo(option)

获取视频号直播预告信息

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/channels/getChannelsLiveNoticeInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| finderUserName | 视频号 id，以“sph”开头的id，可在视频号助手获取 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| nonceId | 预告 nonceId |
| status | 预告状态：0可用 1取消 2已用 |
| startTime | 开始时间 |
| headUrl | 直播封面 |
| nickname | 视频号昵称 |
| reservable | 是否可预约 |
| otherInfos | 除最近的一条预告信息外，其他的预告信息列表（注意：每次最多返回按时间戳增序排列的15个预告信息，其中时间最近的那个预告信息会在接口其他的返回参数中展示，其余的预告信息会在该字段中展示）。 |

#### Status

| 参数 | 说明 |
| --- | --- |
| 0 | 可用 |
| 1 | 取消 |
| 2 | 已用 |

### Taro.getChannelsLiveInfo(option)

获取视频号直播信息

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/channels/getChannelsLiveInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| finderUserName | 视频号 id，以“sph”开头的id，可在视频号助手获取 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| feedId | 直播 feedId |
| nonceId | 直播 nonceId |
| description | 直播主题 |
| status | 直播状态，2直播中，3直播结束 |
| headUrl | 视频号头像 |
| nickname | 视频号昵称 |
| replayStatus | 直播回放状态 |
| otherInfos | 除最近的一条直播外，其他的直播列表（注意：每次最多返回按时间戳增序排列的15个直播信息，其中时间最近的那个直播会在接口其他的返回参数中展示，其余的直播会在该字段中展示）。 |

#### Status

| 参数 | 说明 |
| --- | --- |
| 2 | 直播中 |
| 3 | 直播结束 |

#### ReplayStatus

| 参数 | 说明 |
| --- | --- |
| 0 | 未生成 |
| 1 | 已生成 |
| 3 | 生成中 |
| 6 | 已过期 |

### Taro.requestDeviceVoIP(option)

请求用户授权与设备（组）间进行音视频通话

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/device-voip/requestDeviceVoIP)

#### 参数

| 参数 | 说明 |
| --- | --- |
| sn | 设备唯一序列号。由厂商分配，长度不能超过128字节。字符只接受数字，大小写字母，下划线（_）和连字符（-） |
| snTicket | 设备票据，5分钟内有效 |
| modelId | 设备型号 id。通过微信公众平台注册设备获得。 |
| deviceName | 设备名称，将显示在授权弹窗内（长度不超过13）。授权框中「设备名字」= 「deviceName」 + 「modelId 对应设备型号」 |
| isGroup | 是否为授权设备组，默认 false |
| groupId | 设备组的唯一标识 id 。isGroup 为 true 时只需要传该参数，isGroup 为 false 时不需要传该参数，但需要传 sn、snTicket、modelId、deviceName 。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getDeviceVoIPList(option)

查询当前用户授权的音视频通话设备（组）信息

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/device-voip/getDeviceVoIPList)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| list |  |

#### DeviceVoIP

| 参数 | 说明 |
| --- | --- |
| sn | 设备唯一序列号。（仅单台设备时） |
| model_id | 设备型号 id。通过微信公众平台注册设备获得。（仅单台设备时） |
| group_id | 设备组的唯一标识 id（仅设备组时） |
| status | 设备（组）授权状态。0：未授权；1：已授权 |

### Taro.getGroupEnterInfo(option)

获取微信群聊场景下的小程序启动信息。群聊场景包括群聊小程序消息卡片、群待办、群工具。可用于获取当前群的 opengid。

**Tips**
- 如需要展示群名称，小程序可以使用[开放数据组件](https://docs.taro.zone/docs/components/open/open-data)
- 小游戏可以通过 `Taro.getGroupInfo` 接口获取群名称

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/group/getGroupEnterInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |
| encryptedData | 包括敏感数据在内的完整转发信息的加密数据，详细见[加密数据解密算法](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html) |
| iv | 加密算法的初始向量，详细见[加密数据解密算法](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html) |
| cloudID | 敏感数据对应的云 ID，开通[云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)的小程序才会返回，可通过云调用直接获取开放数据，详细见[云调用直接获取开放数据](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#method-cloud) |

### Taro.requirePrivacyAuthorize(option)

模拟隐私接口调用，并触发隐私弹窗逻辑。隐私合规开发指南详情可见《小程序隐私协议开发指南》

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/privacy/requirePrivacyAuthorize)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.openPrivacyContract(option)

跳转至隐私协议页面。隐私合规开发指南详情可见《小程序隐私协议开发指南》

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/privacy/openPrivacyContract)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onNeedPrivacyAuthorization(listener)

监听隐私接口需要用户授权事件。当需要用户进行隐私授权时会触发。触发该事件时，开发者需要弹出隐私协议说明，并在用户同意或拒绝授权后调用回调接口 resolve 触发原隐私接口或组件继续执行。隐私合规开发指南详情可见《小程序隐私协议开发指南》

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/privacy/onNeedPrivacyAuthorization)

#### ResolveOption

resolve 是 onNeedPrivacyAuthorization 的回调参数，是一个接口函数。
当触发 needPrivacyAuthorization 事件时，触发该事件的隐私接口或组件会处于 pending 状态。
如果调用 resolve({ buttonId: 'disagree-btn'， event:'agree' })，则触发当前 needPrivacyAuthorization 事件的原隐私接口或组件会继续执行。其中 buttonId 为隐私同意授权按钮的id，为确保用户有同意的操作，基础库会检查对应的同意按钮是否被点击过。
如果调用 resolve({ event: 'disagree' })，则触发当前 needPrivacyAuthorization 事件的原隐私接口或组件会失败并返回 API:fail privacy permission is not authorized 的错误信息。
在调用 resolve({ event: 'agree'/'disagree' }) 之前，开发者可以调用 resolve({ event: 'exposureAuthorization' }) 把隐私弹窗曝光告知平台。

| 参数 | 说明 |
| --- | --- |
| event | 用户操作类型 |
| buttonId | 同意授权按钮的id （仅event=agree时必填） |

#### EventInfo

触发本次 onNeedPrivacyAuthorization 事件的关联信息

| 参数 | 说明 |
| --- | --- |
| referrer |  |

#### Listener

隐私授权监听函数

```tsx
(resolve: (option: ResolveOption) => void,eventInfo: EventInfo) => void
```

| 参数 | 说明 |
| --- | --- |
| resolve | 事件回调函数 |
| eventInfo | 关联事件信息 |

### Taro.getPrivacySetting(option)

查询隐私授权情况。隐私合规开发指南详情可见《小程序隐私协议开发指南》

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/privacy/getPrivacySetting)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| needAuthorization | 是否需要用户授权隐私协议（如果开发者没有在[mp后台-设置-服务内容声明-用户隐私保护指引]中声明隐私收集类型则会返回false；如果开发者声明了隐私收集，且用户之前同意过隐私协议则会返回false；如果开发者声明了隐私收集，且用户还没同意过则返回true；如果用户之前同意过、但后来小程序又新增了隐私收集类型也会返回true） |
| privacyContractName | 隐私授权协议的名称 |

### Taro.openCustomerServiceChat(option)

打开微信客服。了解更多信息，可以参考微信客服介绍：https://work.weixin.qq.com/kf/。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/customer-service/openCustomerServiceChat)

#### ExtInfo

| 参数 | 说明 |
| --- | --- |
| url |  |

#### 参数

| 参数 | 说明 |
| --- | --- |
| extInfo | 客服信息 |
| corpId | 企业ID |
| showMessageCard | 是否发送小程序气泡消息，默认值：false |
| sendMessageTitle | 气泡消息标题 |
| sendMessagePath | 气泡消息小程序路径 |
| sendMessageImg | 气泡消息图片 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.openStickerSetView(option)

打开表情专辑

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/sticker/openStickerSetView)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 表情专辑链接，可前往[表情开放平台](https://sticker.weixin.qq.com/cgi-bin/mmemoticonwebnode-bin/pages/home)，在详情页中的「小程序跳转链接」入口复制 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.openStickerIPView(option)

打开表情IP合辑

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/sticker/openStickerIPView)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 表情IP合辑链接，可前往[表情开放平台](https://sticker.weixin.qq.com/cgi-bin/mmemoticonwebnode-bin/pages/home)，在详情页中的「小程序跳转链接」入口复制 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.openSingleStickerView(option)

打开单个表情

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/sticker/openSingleStickerView)

#### 参数

| 参数 | 说明 |
| --- | --- |
| url | 表情链接，可前往(表情开放平台)[https://sticker.weixin.qq.com/cgi-bin/mmemoticonwebnode-bin/pages/home]，在详情页中的「小程序跳转链接」入口复制 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

## 设备

### Taro.stopBluetoothDevicesDiscovery(option)

停止搜寻附近的蓝牙外围设备。若已经找到需要的蓝牙设备并不需要继续搜索时，建议调用该接口停止蓝牙搜索。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/stopBluetoothDevicesDiscovery)

#### Promised

| 参数 | 说明 |
| --- | --- |
| errMsg | 成功：ok，错误：详细信息 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startBluetoothDevicesDiscovery(option)

开始搜寻附近的蓝牙外围设备。**此操作比较耗费系统资源，请在搜索并连接到设备后调用 Taro.stopBluetoothDevicesDiscovery 方法停止搜索。**

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/startBluetoothDevicesDiscovery)

#### Promised

| 参数 | 说明 |
| --- | --- |
| errMsg | 成功：ok，错误：详细信息 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| allowDuplicatesKey | 是否允许重复上报同一设备。如果允许重复上报，则 Taro.onBlueToothDeviceFound 方法会多次上报同一设备，但是 RSSI 值会有不同。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| interval | 上报设备的间隔。0 表示找到新设备立即上报，其他数值根据传入的间隔上报。 |
| services | 要搜索的蓝牙设备主 service 的 uuid 列表。某些蓝牙设备会广播自己的主 service 的 uuid。如果设置此参数，则只搜索广播包有对应 uuid 的主服务的蓝牙设备。建议主要通过该参数过滤掉周边不需要处理的其他蓝牙设备。 |
| powerLevel | 扫描模式，越高扫描越快，也越耗电。仅安卓微信客户端 7.0.12 及以上支持。 |
| success | 接口调用成功的回调函数 |

#### PowerLevel

| 参数 | 说明 |
| --- | --- |
| low | 低 |
| medium | 中 |
| high | 高 |

### Taro.openBluetoothAdapter(option)

初始化蓝牙模块

**注意**
- 其他蓝牙相关 API 必须在 Taro.openBluetoothAdapter 调用之后使用。否则 API 会返回错误（errCode=10000）。
- 在用户蓝牙开关未开启或者手机不支持蓝牙功能的情况下，调用 Taro.openBluetoothAdapter 监听手机蓝牙状态的改变，也可以调用蓝牙模块的所有API。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/openBluetoothAdapter)

#### 参数

| 参数 | 说明 |
| --- | --- |
| mode | 蓝牙模式，可作为主/从设备，仅 iOS 需要。 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### Mode

| 参数 | 说明 |
| --- | --- |
| central | 主机模式 |
| peripheral | 从机（外围设备）模式 |

#### state

object.fail 回调函数返回的 state 参数（仅 iOS）

| 参数 | 说明 |
| --- | --- |
| 0 | 未知 |
| 1 | 重置中 |
| 2 | 不支持 |
| 3 | 未授权 |
| 4 | 未开启 |

### Taro.onBluetoothDeviceFound(callback)

监听寻找到新设备的事件

**注意**
- 若在 Taro.onBluetoothDeviceFound 回调了某个设备，则此设备会添加到 Taro.getBluetoothDevices 接口获取到的数组中。
- 安卓下部分机型需要有位置权限才能搜索到设备，需留意是否开启了位置权限

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/onBluetoothDeviceFound)

#### 回调

寻找到新设备的事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| devices | 新搜索到的设备列表 |

#### CallbackResultBlueToothDevice

新搜索到的设备

| 参数 | 说明 |
| --- | --- |
| RSSI | 当前蓝牙设备的信号强度，单位 dBm |
| advertisData | 当前蓝牙设备的广播数据段中的 ManufacturerData 数据段。 |
| advertisServiceUUIDs | 当前蓝牙设备的广播数据段中的 ServiceUUIDs 数据段 |
| deviceId | 用于区分设备的 id |
| localName | 当前蓝牙设备的广播数据段中的 LocalName 数据段 |
| name | 蓝牙设备名称，某些设备可能没有 |
| serviceData | 当前蓝牙设备的广播数据段中的 ServiceData 数据段 |
| connectable | 当前蓝牙设备是否可连接（ Android 8.0 以下不支持返回该值 ） |

### Taro.onBluetoothAdapterStateChange(callback)

监听蓝牙适配器状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/onBluetoothAdapterStateChange)

#### 回调

蓝牙适配器状态变化事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| available | 蓝牙适配器是否可用 |
| discovering | 蓝牙适配器是否处于搜索状态 |

### Taro.offBluetoothDeviceFound(callback)

取消监听寻找到新设备的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/offBluetoothDeviceFound)

### Taro.offBluetoothAdapterStateChange(callback)

取消监听蓝牙适配器状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/offBluetoothAdapterStateChange)

### Taro.makeBluetoothPair(option)

蓝牙配对接口，仅安卓支持

通常情况下（需要指定 pin 码或者密码时）系统会接管配对流程，直接调用 [Taro.createBLEConnection](https://docs.taro.zone/docs/apis/device/bluetooth-ble/createBLEConnection) 即可。该接口只应当在开发者不想让用户手动输入 pin 码且真机验证确认可以正常生效情况下用。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/makeBluetoothPair)

#### 参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 蓝牙设备 id |
| pin | pin 码，Base64 格式 |
| timeout | 超时时间，单位 ms |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.isBluetoothDevicePaired(option)

查询蓝牙设备是否配对，仅安卓支持

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/isBluetoothDevicePaired)

#### 参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 蓝牙设备 id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getConnectedBluetoothDevices(option)

根据 uuid 获取处于已连接状态的设备。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/getConnectedBluetoothDevices)

#### 参数

| 参数 | 说明 |
| --- | --- |
| services | 蓝牙设备主 service 的 uuid 列表 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| devices | 搜索到的设备列表 |
| errMsg | 成功：ok，错误：详细信息 |

#### BluetoothDeviceInfo

搜索到的设备

| 参数 | 说明 |
| --- | --- |
| deviceId | 用于区分设备的 id |
| name | 蓝牙设备名称，某些设备可能没有 |

### Taro.getBluetoothDevices(option)

获取在蓝牙模块生效期间所有已发现的蓝牙设备。包括已经和本机处于连接状态的设备。

**注意事项**
- 该接口获取到的设备列表为**蓝牙模块生效期间所有搜索到的蓝牙设备**，若在蓝牙模块使用流程结束后未及时调用 Taro.closeBluetoothAdapter 释放资源，会存在调用该接口会返回之前的蓝牙使用流程中搜索到的蓝牙设备，可能设备已经不在用户身边，无法连接。
- 蓝牙设备在被搜索到时，系统返回的 name 字段一般为广播包中的 LocalName 字段中的设备名称，而如果与蓝牙设备建立连接，系统返回的 name 字段会改为从蓝牙设备上获取到的 `GattName`。若需要动态改变设备名称并展示，建议使用 `localName` 字段。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/getBluetoothDevices)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| devices | uuid 对应的的已连接设备列表 |
| errMsg | 成功：ok，错误：详细信息 |

#### SuccessCallbackResultBlueToothDevice

uuid 对应的的已连接设备列表

| 参数 | 说明 |
| --- | --- |
| RSSI | 当前蓝牙设备的信号强度 |
| advertisData | 当前蓝牙设备的广播数据段中的 ManufacturerData 数据段。 |
| advertisServiceUUIDs | 当前蓝牙设备的广播数据段中的 ServiceUUIDs 数据段 |
| deviceId | 用于区分设备的 id |
| localName | 当前蓝牙设备的广播数据段中的 LocalName 数据段 |
| name | 蓝牙设备名称，某些设备可能没有 |
| serviceData | 当前蓝牙设备的广播数据段中的 ServiceData 数据段 |
| connectable | 当前蓝牙设备是否可连接（ Android 8.0 以下不支持返回该值 ） |

### Taro.getBluetoothAdapterState(option)

获取本机蓝牙适配器状态。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/getBluetoothAdapterState)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| available | 蓝牙适配器是否可用 |
| discovering | 是否正在搜索设备 |
| errMsg | 成功：ok，错误：详细信息 |

### Taro.closeBluetoothAdapter(option)

关闭蓝牙模块。调用该方法将断开所有已建立的连接并释放系统资源。建议在使用蓝牙流程后，与 Taro.openBluetoothAdapter 成对调用。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth/closeBluetoothAdapter)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.writeBLECharacteristicValue(option)

向低功耗蓝牙设备特征值中写入二进制数据。注意：必须设备的特征值支持 write 才可以成功调用。

**注意**
- 并行调用多次会存在写失败的可能性。
- 小程序不会对写入数据包大小做限制，但系统与蓝牙设备会限制蓝牙4.0单次传输的数据大小，超过最大字节数后会发生写入错误，建议每次写入不超过20字节。
- 若单次写入数据过长，iOS 上存在系统不会有任何回调的情况（包括错误回调）。
- 安卓平台上，在调用 `notifyBLECharacteristicValueChange` 成功后立即调用 `writeBLECharacteristicValue` 接口，在部分机型上会发生 10008 系统错误

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/writeBLECharacteristicValue)

#### Promised

| 参数 | 说明 |
| --- | --- |
| errMsg | 成功：ok，错误：详细信息 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| characteristicId | 蓝牙特征值的 uuid |
| deviceId | 蓝牙设备 id |
| serviceId | 蓝牙特征值对应服务的 uuid |
| value | 蓝牙设备特征值对应的二进制值 |
| writeType | 蓝牙特征值的写模式设置，有两种模式，iOS 优先 write，安卓优先 writeNoResponse 。（基础库 2.22.0 开始支持） |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### WriteType

| 参数 | 说明 |
| --- | --- |
| write | 强制回复写，不支持时报错 |
| writeNoResponse | 强制无回复写，不支持时报错 |

### Taro.setBLEMTU(option)

协商设置蓝牙低功耗的最大传输单元 (Maximum Transmission Unit, MTU)

- 需在 Taro.createBLEConnection 调用成功后调用
- 仅安卓系统 5.1 以上版本有效，iOS 因系统限制不支持。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/setBLEMTU)

#### Promised

```tsx
FailCallbackResult | SuccessCallbackResult
```

#### 参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 蓝牙设备 id |
| mtu | 最大传输单元。设置范围为 (22,512) 区间内，单位 bytes |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 失败回调

| 参数 | 说明 |
| --- | --- |
| mtu | 最终协商的 MTU 值。如果协商失败则无此参数。安卓客户端 8.0.9 开始支持。 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| mtu | 最终协商的 MTU 值，与传入参数一致。安卓客户端 8.0.9 开始支持。 |

### Taro.readBLECharacteristicValue(option)

读取低功耗蓝牙设备的特征值的二进制数据值。注意：必须设备的特征值支持 read 才可以成功调用。

**注意**
- 并行调用多次会存在读失败的可能性。
- 接口读取到的信息需要在 `onBLECharacteristicValueChange` 方法注册的回调中获取。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/readBLECharacteristicValue)

#### 参数

| 参数 | 说明 |
| --- | --- |
| characteristicId | 蓝牙特征值的 uuid |
| deviceId | 蓝牙设备 id |
| serviceId | 蓝牙特征值对应服务的 uuid |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onBLEMTUChange(callback)

监听蓝牙低功耗的最大传输单元变化事件（仅安卓触发）

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/onBLEMTUChange)

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 蓝牙设备ID |
| mtu | 最大传输单元 |

#### 回调

蓝牙低功耗的最大传输单元变化事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

### Taro.onBLEConnectionStateChange(callback)

监听低功耗蓝牙连接状态的改变事件。包括开发者主动连接或断开连接，设备丢失，连接异常断开等等

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/onBLEConnectionStateChange)

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| connected | 是否处于已连接状态 |
| deviceId | 蓝牙设备ID |

#### 回调

低功耗蓝牙连接状态的改变事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

### Taro.onBLECharacteristicValueChange(callback)

监听低功耗蓝牙设备的特征值变化事件。必须先启用 `notifyBLECharacteristicValueChange` 接口才能接收到设备推送的 notification。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/onBLECharacteristicValueChange)

#### 回调

低功耗蓝牙设备的特征值变化事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| characteristicId | 蓝牙特征值的 uuid |
| deviceId | 蓝牙设备 id |
| serviceId | 蓝牙特征值对应服务的 uuid |
| value | 特征值最新的值 |

### Taro.offBLEMTUChange(callback)

取消监听蓝牙低功耗的最大传输单元变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/offBLEMTUChange)

### Taro.offBLEConnectionStateChange(callback)

取消监听蓝牙低功耗连接状态的改变事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/offBLEConnectionStateChange)

### Taro.offBLECharacteristicValueChange(callback)

取消监听蓝牙低功耗设备的特征值变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/offBLECharacteristicValueChange)

### Taro.notifyBLECharacteristicValueChange(option)

启用低功耗蓝牙设备特征值变化时的 notify 功能，订阅特征值。注意：必须设备的特征值支持 notify 或者 indicate 才可以成功调用。

另外，必须先启用 `notifyBLECharacteristicValueChange` 才能监听到设备 `characteristicValueChange` 事件

**注意**
- 订阅操作成功后需要设备主动更新特征值的 value，才会触发 Taro.onBLECharacteristicValueChange 回调。
- 安卓平台上，在调用 `notifyBLECharacteristicValueChange` 成功后立即调用 `writeBLECharacteristicValue` 接口，在部分机型上会发生 10008 系统错误

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/notifyBLECharacteristicValueChange)

#### Promised

| 参数 | 说明 |
| --- | --- |
| errMsg | 成功：ok，错误：详细信息 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| characteristicId | 蓝牙特征值的 uuid |
| deviceId | 蓝牙设备 id |
| serviceId | 蓝牙特征值对应服务的 uuid |
| state | 是否启用 notify |
| type | 设置特征订阅类型，有效值有 notification 和 indication |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getBLEMTU(option)

获取蓝牙低功耗的最大传输单元。需在 [Taro.createBLEConnection](https://docs.taro.zone/docs/apis/device/bluetooth-ble/createBLEConnection) 调用成功后调用。

注意:
- 小程序中 MTU 为 ATT_MTU，包含 Op-Code 和 Attribute Handle 的长度，实际可以传输的数据长度为 ATT_MTU - 3
- iOS 系统中 MTU 为固定值；安卓系统中，MTU 会在系统协商成功之后发生改变，建议使用 [Taro.onBLEMTUChange](https://docs.taro.zone/docs/apis/device/bluetooth-ble/onBLEMTUChange) 监听。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/getBLEMTU)

#### 参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 蓝牙设备 id |
| writeType | 写模式 （iOS 特有参数） |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| mtu | 最大传输单元 |

#### WriteType

写模式合法值

| 参数 | 说明 |
| --- | --- |
| write | 有回复写 |
| writeNoResponse | 无回复写 |

### Taro.getBLEDeviceServices(option)

获取蓝牙设备所有服务(service)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/getBLEDeviceServices)

#### 参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 蓝牙设备 id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| services | 设备服务列表 |
| errMsg | 成功：ok，错误：详细信息 |

#### BLEService

设备服务列表

| 参数 | 说明 |
| --- | --- |
| isPrimary | 该服务是否为主服务 |
| uuid | 蓝牙设备服务的 uuid |

### Taro.getBLEDeviceRSSI(option)

获取蓝牙低功耗设备的信号强度 (Received Signal Strength Indication, RSSI)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/getBLEDeviceRSSI)

#### 参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 蓝牙设备 id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| RSSI | 信号强度，单位 dBm |

### Taro.getBLEDeviceCharacteristics(option)

获取蓝牙设备某个服务中所有特征值(characteristic)。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/getBLEDeviceCharacteristics)

#### 参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 蓝牙设备 id |
| serviceId | 蓝牙服务 uuid，需要使用 `getBLEDeviceServices` 获取 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| characteristics | 设备特征值列表 |
| errMsg | 成功：ok，错误：详细信息 |

#### BLECharacteristic

设备特征值列表

| 参数 | 说明 |
| --- | --- |
| properties | 该特征值支持的操作类型 |
| uuid | 蓝牙设备特征值的 uuid |

#### Properties

该特征值支持的操作类型

| 参数 | 说明 |
| --- | --- |
| indicate | 该特征值是否支持 indicate 操作 |
| notify | 该特征值是否支持 notify 操作 |
| read | 该特征值是否支持 read 操作 |
| write | 该特征值是否支持 write 操作 |
| writeNoResponse | 该特征是否支持无回复写操作 |
| writeDefault | 该特征是否支持有回复写操作 |

### Taro.createBLEConnection(option)

连接低功耗蓝牙设备。

若小程序在之前已有搜索过某个蓝牙设备，并成功建立连接，可直接传入之前搜索获取的 deviceId 直接尝试连接该设备，无需进行搜索操作。

**注意**
- 请保证尽量成对的调用 `createBLEConnection` 和 `closeBLEConnection` 接口。安卓如果多次调用 `createBLEConnection` 创建连接，有可能导致系统持有同一设备多个连接的实例，导致调用 `closeBLEConnection` 的时候并不能真正的断开与设备的连接。
- 蓝牙连接随时可能断开，建议监听 Taro.onBLEConnectionStateChange 回调事件，当蓝牙设备断开时按需执行重连操作
- 若对未连接的设备或已断开连接的设备调用数据读写操作的接口，会返回 10006 错误，建议进行重连操作。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/createBLEConnection)

#### Promised

| 参数 | 说明 |
| --- | --- |
| errMsg | 成功：ok，错误：详细信息 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 用于区分设备的 id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |
| timeout | 超时时间，单位ms，不填表示不会超时 |

### Taro.closeBLEConnection(option)

断开与低功耗蓝牙设备的连接。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-ble/closeBLEConnection)

#### Promised

| 参数 | 说明 |
| --- | --- |
| errMsg | 成功：ok，错误：详细信息 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 用于区分设备的 id |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onBLEPeripheralConnectionStateChanged(callback)

监听当前外围设备被连接或断开连接事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-peripheral/onBLEPeripheralConnectionStateChanged)

#### 回调

当前外围设备被连接或断开连接事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| deviceId | 蓝牙设备 id |
| serverId | server 的 UUID |
| connected | 连接目前状态 |

### Taro.offBLEPeripheralConnectionStateChanged(callback)

取消监听当前外围设备被连接或断开连接事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-peripheral/offBLEPeripheralConnectionStateChanged)

### Taro.createBLEPeripheralServer(option)

建立本地作为蓝牙低功耗外围设备的服务端，可创建多个

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-peripheral/createBLEPeripheralServer)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| server | 外围设备的服务端 |

### BLEPeripheralServer

外围设备的服务端

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/bluetooth-peripheral/BLEPeripheralServer)

##### addService

添加服务

```tsx
(option: Option) => Promise<TaroGeneral.BluetoothError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### close

关闭当前服务端

```tsx
(option: Option) => Promise<TaroGeneral.BluetoothError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### offCharacteristicReadRequest

取消监听已连接的设备请求读当前外围设备的特征值事件

```tsx
(callback?: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 已连接的设备请求读当前外围设备的特征值事件的回调函数 |

##### offCharacteristicSubscribed

取消监听特征订阅事件

```tsx
(callback?: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 特征订阅事件的回调函数 |

##### offCharacteristicUnsubscribed

取消监听取消特征订阅事件

```tsx
(callback?: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 取消特征订阅事件的回调函数 |

##### offCharacteristicWriteRequest

取消监听已连接的设备请求写当前外围设备的特征值事件

```tsx
(callback?: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 已连接的设备请求写当前外围设备的特征值事件的回调函数 |

##### onCharacteristicReadRequest

监听已连接的设备请求读当前外围设备的特征值事件

收到该消息后需要立刻调用 [writeCharacteristicValue](https://docs.taro.zone/docs/apis/device/bluetooth-peripheral/BLEPeripheralServer#writecharacteristicvalue) 写回数据，否则主机不会收到响应。

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 已连接的设备请求读当前外围设备的特征值事件的回调函数 |

##### onCharacteristicSubscribed

监听特征订阅事件，仅 iOS 支持

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 特征订阅事件的回调函数 |

##### onCharacteristicUnsubscribed

监听取消特征订阅事件，仅 iOS 支持

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 取消特征订阅事件的回调函数 |

##### onCharacteristicWriteRequest

监听已连接的设备请求写当前外围设备的特征值事件

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 已连接的设备请求写当前外围设备的特征值事件的回调函数 |

##### removeService

移除服务

```tsx
(option: Option) => Promise<TaroGeneral.BluetoothError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### startAdvertising

开始广播本地创建的外围设备

```tsx
(option: Option) => Promise<TaroGeneral.BluetoothError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### stopAdvertising

停止广播

```tsx
(option: Option) => Promise<TaroGeneral.BluetoothError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### writeCharacteristicValue

往指定特征写入二进制数据值，并通知已连接的主机，从机的特征值已发生变化，该接口会处理是走回包还是走订阅

```tsx
(option: Option) => Promise<TaroGeneral.BluetoothError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| service | 描述 service 的 Object |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### service

| 参数 | 说明 |
| --- | --- |
| uuid | 蓝牙服务的 UUID |
| characteristics | characteristics 列表 |

###### characteristic

| 参数 | 说明 |
| --- | --- |
| uuid | characteristic 的 UUID |
| properties | 特征支持的操作 |
| permission | 特征权限 |
| value | 特征对应的二进制值 |
| descriptors | 描述符数据 |

###### properties

特征支持的操作

| 参数 | 说明 |
| --- | --- |
| write | 写 |
| writeNoResponse | 无回复写 |
| read | 读 |
| notify | 订阅 |
| indicate | 回包 |

###### characteristicPermission

特征权限

| 参数 | 说明 |
| --- | --- |
| readable | 可读 |
| writeable | 可写 |
| readEncryptionRequired | 加密读请求 |
| writeEncryptionRequired | 加密写请求 |

###### descriptor

描述符数据

| 参数 | 说明 |
| --- | --- |
| uuid | Descriptor 的 UUID |
| permission | 描述符的权限 |
| value | 描述符数据 |

###### descriptorPermission

描述符的权限

| 参数 | 说明 |
| --- | --- |
| write | 写 |
| read | 读 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 回调

已连接的设备请求读当前外围设备的特征值事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

| 参数 | 说明 |
| --- | --- |
| serviceId | 蓝牙特征对应服务的 UUID |
| characteristicId | 蓝牙特征的 UUID |
| callbackId | 唯一标识码，调用 [writeCharacteristicValue](https://docs.taro.zone/docs/apis/device/bluetooth-peripheral/BLEPeripheralServer#writecharacteristicvalue) 时使用 |

###### 回调

特征订阅事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

| 参数 | 说明 |
| --- | --- |
| serviceId | 蓝牙特征对应服务的 UUID |
| characteristicId | 蓝牙特征的 UUID |

###### 回调

取消特征订阅事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

| 参数 | 说明 |
| --- | --- |
| serviceId | 蓝牙特征对应服务的 UUID |
| characteristicId | 蓝牙特征的 UUID |

###### 回调

已连接的设备请求写当前外围设备的特征值事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

| 参数 | 说明 |
| --- | --- |
| serviceId | 蓝牙特征对应服务的 UUID |
| characteristicId | 蓝牙特征的 UUID |
| callbackId | 唯一标识码，调用 [writeCharacteristicValue](https://docs.taro.zone/docs/apis/device/bluetooth-peripheral/BLEPeripheralServer#writecharacteristicvalue) 时使用 |
| value | 请求写入特征的二进制数据值 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| serviceId | service 的 UUID |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| advertiseRequest | 广播自定义参数 |
| powerLevel | 广播功率 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### advertiseRequest

广播自定义参数

| 参数 | 说明 |
| --- | --- |
| connectable | 当前设备是否可连接 |
| deviceName | 广播中 deviceName 字段，默认为空 |
| serviceUuids | 要广播的服务 UUID 列表。使用 16/32 位 UUID 时请参考注意事项。 |
| manufacturerData | 广播的制造商信息。仅安卓支持，iOS 因系统限制无法定制。 |
| beacon | 以 beacon 设备形式广播的参数。 |

###### manufacturerData

广播的制造商信息。仅安卓支持，iOS 因系统限制无法定制。

| 参数 | 说明 |
| --- | --- |
| manufacturerId | 制造商ID，0x 开头的十六进制 |
| manufacturerSpecificData | 制造商信息 |

###### beacon

以 beacon 设备形式广播的参数。

| 参数 | 说明 |
| --- | --- |
| uuid | Beacon 设备广播的 UUID |
| major | Beacon 设备的主 ID |
| minor | Beacon 设备的次 ID |
| measuredPower | 用于判断距离设备 1 米时 RSSI 大小的参考值 |

###### PowerLevel

广播功率合法值

| 参数 | 说明 |
| --- | --- |
| low | 功率低 |
| medium | 功率适中 |
| high | 功率高 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| serviceId | 蓝牙特征对应服务的 UUID |
| characteristicId | 蓝牙特征的 UUID |
| value | characteristic 对应的二进制值 |
| needNotify | 是否需要通知主机 value 已更新 |
| callbackId | 可选，处理回包时使用 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.stopBeaconDiscovery(option)

停止搜索附近的 iBeacon 设备

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/iBeacon/stopBeaconDiscovery)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startBeaconDiscovery(option)

开始搜索附近的 iBeacon 设备

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/iBeacon/startBeaconDiscovery)

#### 参数

| 参数 | 说明 |
| --- | --- |
| uuids | iBeacon 设备广播的 uuid 列表 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| ignoreBluetoothAvailable | 是否校验蓝牙开关，仅在 iOS 下有效 |
| success | 接口调用成功的回调函数 |

### Taro.onBeaconUpdate(callback)

监听 iBeacon 设备更新事件，仅能注册一个监听

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/iBeacon/onBeaconUpdate)

#### 回调

iBeacon 设备更新事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| beacons | 当前搜寻到的所有 iBeacon 设备列表 |

### Taro.onBeaconServiceChange(callback)

监听 iBeacon 服务状态变化事件，仅能注册一个监听

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/iBeacon/onBeaconServiceChange)

#### 回调

iBeacon 服务状态变化事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| available | 服务目前是否可用 |
| discovering | 目前是否处于搜索状态 |

### Taro.offBeaconUpdate(callback)

取消监听 iBeacon 设备更新事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/iBeacon/offBeaconUpdate)

### Taro.offBeaconServiceChange(callback)

取消监听 iBeacon 服务状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/iBeacon/offBeaconServiceChange)

### Taro.getBeacons(option)

获取所有已搜索到的 iBeacon 设备

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/iBeacon/getBeacons)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| beacons | iBeacon 设备列表 |
| errMsg | 调用结果 |

### IBeaconInfo

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/iBeacon/IBeaconInfo)

#### 方法

| 参数 | 说明 |
| --- | --- |
| uuid | Beacon 设备广播的 uuid |
| major | Beacon 设备的主 ID |
| minor | Beacon 设备的次 ID |
| proximity | 表示设备距离的枚举值（仅iOS） |
| accuracy | Beacon 设备的距离，单位 m。iOS 上，proximity 为 0 时，accuracy 为 -1。 |
| rssi | 表示设备的信号强度，单位 dBm |

##### Proximity

proximity 的合法值

| 参数 | 说明 |
| --- | --- |
| 0 | 信号太弱不足以计算距离，或非 iOS 设备 |
| 1 | 十分近 |
| 2 | 比较近 |
| 3 | 远 |

### Taro.stopHCE(option)

关闭 NFC 模块。仅在安卓系统下有效。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/stopHCE)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startHCE(option)

初始化 NFC 模块。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/startHCE)

#### 参数

| 参数 | 说明 |
| --- | --- |
| aid_list | 需要注册到系统的 AID 列表 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.sendHCEMessage(option)

发送 NFC 消息。仅在安卓系统下有效。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/sendHCEMessage)

#### 参数

| 参数 | 说明 |
| --- | --- |
| data | 二进制数据 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onHCEMessage(callback)

监听接收 NFC 设备消息事件，仅能注册一个监听

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/onHCEMessage)

#### 回调

接收 NFC 设备消息事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| data | `messageType=1` 时 ,客户端接收到 NFC 设备的指令 |
| messageType | 消息类型 |
| reason | `messageType=2` 时，原因 |

#### MessageType

消息类型

| 参数 | 说明 |
| --- | --- |
| 1 | HCE APDU Command类型，小程序需对此指令进行处理，并调用 sendHCEMessage 接口返回处理指令 |
| 2 | 设备离场事件类型 |

### Taro.offHCEMessage(callback)

接收 NFC 设备消息事件，取消事件监听。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/offHCEMessage)

### Taro.getNFCAdapter()

获取 NFC 实例

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/getNFCAdapter)

### Taro.getHCEState(option)

判断当前设备是否支持 HCE 能力。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/getHCEState)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### IsoDep

IsoDep 标签

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/IsoDep)

##### close

断开连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### connect

连接 NFC 标签

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getHistoricalBytes

获取复位信息

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getMaxTransceiveLength

获取最大传输长度

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### isConnected

检查是否已连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setTimeout

设置超时时间

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### transceive

发送数据

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| histBytes | 返回历史二进制数据 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| length | 最大传输长度 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| timeout | 设置超时时间 (ms) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| data | 需要传递的二进制数据 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| data |  |

### MifareClassic

MifareClassic 标签

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/MifareClassic)

##### close

断开连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### connect

连接 NFC 标签

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getMaxTransceiveLength

获取最大传输长度

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### isConnected

检查是否已连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setTimeout

设置超时时间

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### transceive

发送数据

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| length | 最大传输长度 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| timeout | 设置超时时间 (ms) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| data | 需要传递的二进制数据 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| data |  |

### MifareUltralight

MifareUltralight 标签

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/MifareUltralight)

##### close

断开连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### connect

连接 NFC 标签

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getMaxTransceiveLength

获取最大传输长度

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### isConnected

检查是否已连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setTimeout

设置超时时间

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### transceive

发送数据

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| length | 最大传输长度 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| timeout | 设置超时时间 (ms) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| data | 需要传递的二进制数据 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| data |  |

### Ndef

Ndef 标签

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/Ndef)

##### close

断开连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### connect

连接 NFC 标签

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### isConnected

检查是否已连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### offNdefMessage

取消监听 Ndef 消息

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 监听 Ndef 消息回调函数 |

##### onNdefMessage

监听 Ndef 消息

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 监听 Ndef 消息回调函数 |

##### setTimeout

设置超时时间

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### writeNdefMessage

重写 Ndef 标签内容

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 回调

监听 Ndef 消息回调函数

```tsx
(args: unknown[]) => void
```

| 参数 | 说明 |
| --- | --- |
| args |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| timeout | 设置超时时间 (ms) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| uris | uri 数组 |
| texts | text 数组 |
| records | 二进制对象数组, 需要指明 id, type 以及 payload (均为 ArrayBuffer 类型) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### record

| 参数 | 说明 |
| --- | --- |
| id |  |
| type |  |
| payload |  |

### NfcA

NfcA 标签

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/NfcA)

##### close

断开连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### connect

连接 NFC 标签

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getAtqa

获取 ATQA 信息

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getMaxTransceiveLength

获取最大传输长度

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getSak

获取 SAK 信息

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### isConnected

检查是否已连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setTimeout

设置超时时间

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### transceive

发送数据

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| atqa | 返回 ATQA/SENS_RES 数据 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| length | 最大传输长度 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| sak | 返回 SAK/SEL_RES 数据 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| timeout | 设置超时时间 (ms) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| data | 需要传递的二进制数据 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| data |  |

### NFCAdapter

NFC 实例

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/NFCAdapter)

##### getIsoDep

获取IsoDep实例，实例支持ISO-DEP (ISO 14443-4)标准的读写

```tsx
() => IsoDep
```

##### getMifareClassic

获取MifareClassic实例，实例支持MIFARE Classic标签的读写

```tsx
() => MifareClassic
```

##### getMifareUltralight

获取MifareUltralight实例，实例支持MIFARE Ultralight标签的读写

```tsx
() => MifareUltralight
```

##### getNdef

获取Ndef实例，实例支持对NDEF格式的NFC标签上的NDEF数据的读写

```tsx
() => Ndef
```

##### getNfcA

获取NfcA实例，实例支持NFC-A (ISO 14443-3A)标准的读写

```tsx
() => NfcA
```

##### getNfcB

获取NfcB实例，实例支持NFC-B (ISO 14443-3B)标准的读写

```tsx
() => NfcB
```

##### getNfcF

获取NfcF实例，实例支持NFC-F (JIS 6319-4)标准的读写

```tsx
() => NfcB
```

##### getNfcV

获取NfcV实例，实例支持NFC-V (ISO 15693)标准的读写

```tsx
() => NfcV
```

##### offDiscovered

取消监听 NFC Tag

```tsx
(callback?: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 监听 NFC Tag的回调函数 |

##### onDiscovered

监听 NFC Tag

```tsx
(callback: Callback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 监听 NFC Tag的回调函数 |

##### startDiscovery

开始扫描NFC标签

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### stopDiscovery

关闭NFC标签扫描

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 回调

监听 NFC Tag的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

###### 回调参数

| 参数 | 说明 |
| --- | --- |
| techs | tech 数组，用于匹配NFC卡片具体可以使用什么标准（NfcA等实例）处理 |
| messages | NdefMessage 数组，消息格式为 {id: ArrayBuffer, type: ArrayBuffer, payload: ArrayBuffer} |

###### NdefMessage

| 参数 | 说明 |
| --- | --- |
| id |  |
| type |  |
| payload |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### NfcB

NfcB 标签

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/NfcB)

##### close

断开连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### connect

连接 NFC 标签

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getMaxTransceiveLength

获取最大传输长度

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### isConnected

检查是否已连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setTimeout

设置超时时间

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### transceive

发送数据

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| length | 最大传输长度 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| timeout | 设置超时时间 (ms) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| data | 需要传递的二进制数据 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| data |  |

### NfcF

NfcF 标签

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/NfcF)

##### close

断开连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### connect

连接 NFC 标签

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getMaxTransceiveLength

获取最大传输长度

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### isConnected

检查是否已连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setTimeout

设置超时时间

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### transceive

发送数据

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| length | 最大传输长度 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| timeout | 设置超时时间 (ms) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| data | 需要传递的二进制数据 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| data |  |

### NfcV

NfcV 标签

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/nfc/NfcV)

##### close

断开连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### connect

连接 NFC 标签

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getMaxTransceiveLength

获取最大传输长度

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### isConnected

检查是否已连接

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### setTimeout

设置超时时间

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### transceive

发送数据

```tsx
(option?: Option) => Promise<TaroGeneral.NFCError>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| length | 最大传输长度 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| timeout | 设置超时时间 (ms) |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 参数

| 参数 | 说明 |
| --- | --- |
| data | 需要传递的二进制数据 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| data |  |

### Taro.stopWifi(option)

关闭 Wi-Fi 模块。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/stopWifi)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startWifi(option)

初始化 Wi-Fi 模块。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/startWifi)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setWifiList(option)

设置 `wifiList` 中 AP 的相关信息。在 `onGetWifiList` 回调后调用，**iOS特有接口**。

**注意**
- 该接口只能在 `onGetWifiList` 回调之后才能调用。
- 此时客户端会挂起，等待小程序设置 Wi-Fi 信息，请务必尽快调用该接口，若无数据请传入一个空数组。
- 有可能随着周边 Wi-Fi 列表的刷新，单个流程内收到多次带有存在重复的 Wi-Fi 列表的回调。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/setWifiList)

#### 参数

| 参数 | 说明 |
| --- | --- |
| wifiList | 提供预设的 Wi-Fi 信息列表 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### WifiData

提供预设的 Wi-Fi 信息列表

| 参数 | 说明 |
| --- | --- |
| BSSID | Wi-Fi 的 BSSID |
| SSID | Wi-Fi 的 SSID |
| password | Wi-Fi 设备密码 |

### Taro.onWifiConnectedWithPartialInfo(callback)

监听连接上 Wi-Fi 的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/onWifiConnectedWithPartialInfo)

#### 回调

连接上 Wi-Fi 的事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| wifi | 只包含 SSID 属性的 WifiInfo 对象 |

### Taro.onWifiConnected(callback)

监听连接上 Wi-Fi 的事件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/onWifiConnected)

#### 回调

连接上 Wi-Fi 的事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| wifi | Wi-Fi 信息 |

### Taro.onGetWifiList(callback)

监听获取到 Wi-Fi 列表数据事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/onGetWifiList)

#### 回调

获取到 Wi-Fi 列表数据事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| wifiList | Wi-Fi 列表数据 |

### Taro.offWifiConnectedWithPartialInfo(callback)

取消监听连接上 Wi-Fi 的事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/offWifiConnectedWithPartialInfo)

### Taro.offWifiConnected(callback)

取消监听连接上 Wi-Fi 的事件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/offWifiConnected)

### Taro.offGetWifiList(callback)

取消监听获取到 Wi-Fi 列表数据事件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/offGetWifiList)

### Taro.getWifiList(option)

请求获取 Wi-Fi 列表。在 `onGetWifiList` 注册的回调中返回 `wifiList` 数据。 **Android 调用前需要 [用户授权](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/authorize.html) scope.userLocation。**

iOS 将跳转到系统的 Wi-Fi 界面，Android 不会跳转。 iOS 11.0 及 iOS 11.1 两个版本因系统问题，该方法失效。但在 iOS 11.2 中已修复。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/getWifiList)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getConnectedWifi(option)

获取已连接中的 Wi-Fi 信息。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/getConnectedWifi)

#### 参数

| 参数 | 说明 |
| --- | --- |
| partialInfo | 是否需要返回部分 Wi-Fi 信息 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| wifi | Wi-Fi 信息 |
| errMsg | 调用结果 |

### Taro.connectWifi(option)

连接 Wi-Fi。若已知 Wi-Fi 信息，可以直接利用该接口连接。仅 Android 与 iOS 11 以上版本支持。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/connectWifi)

#### 参数

| 参数 | 说明 |
| --- | --- |
| SSID | Wi-Fi 设备 SSID |
| password | Wi-Fi 设备密码 |
| BSSID | Wi-Fi 设备 BSSID |
| maunal | 跳转到系统设置页进行连接 |
| partialInfo | 是否需要返回部分 Wi-Fi 信息，仅安卓生效 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### WifiInfo

Wifi 信息

注意:
安卓 Taro.connectWifi / Taro.getConnectedWifi 若设置了 partialInfo:true ，或者调用了 Taro.onWifiConnectedWithPartialInfo 事件。将会返回只包含 SSID 属性的 WifiInfo 对象。 在某些情况下，可能 Wi-Fi 已经连接成功，但会因为获取不到完整的 WifiInfo 对象报错。具体错误信息为 errCode: 12010, errMsg: can't gain current wifi 。如果开发者不需要完整的 WifiInfo 对象，则可以通过采取上述策略解决报错问题。

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/wifi/WifiInfo)

#### 方法

| 参数 | 说明 |
| --- | --- |
| SSID | Wi-Fi 的 SSID |
| BSSID | Wi-Fi 的 BSSID |
| secure | Wi-Fi 是否安全 |
| signalStrength | Wi-Fi 信号强度, 安卓取值 0 ～ 100 ，iOS 取值 0 ～ 1 ，值越大强度越大 |
| frequency | Wi-Fi 频段单位 MHz |

### Taro.addPhoneRepeatCalendar(option)

向系统日历添加重复事件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/calendar/addPhoneRepeatCalendar)

#### 参数

| 参数 | 说明 |
| --- | --- |
| title | 日历事件标题 |
| startTime | 开始时间的 unix 时间戳 (1970年1月1日开始所经过的秒数) |
| allDay | 是否全天事件 |
| description | 事件说明 |
| location | 事件位置 |
| endTime | 结束时间的 unix 时间戳，默认与开始时间相同 |
| alarm | 是否提醒 |
| alarmOffset | 提醒提前量，单位秒，默认 0 表示开始时提醒 |
| repeatInterval | 重复周期，默认 month 每月重复 |
| repeatEndTime | 重复周期结束时间的 unix 时间戳，不填表示一直重复 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### RepeatInterval

| 参数 | 说明 |
| --- | --- |
| day | 每天重复 |
| week | 每周重复 |
| month | 每月重复。该模式日期不能大于 28 日 |
| year | 每年重复 |

### Taro.addPhoneCalendar(option)

向系统日历添加事件

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/calendar/addPhoneCalendar)

#### 参数

| 参数 | 说明 |
| --- | --- |
| title | 日历事件标题 |
| startTime | 开始时间的 unix 时间戳 (1970年1月1日开始所经过的秒数) |
| allDay | 是否全天事件 |
| description | 事件说明 |
| location | 事件位置 |
| endTime | 结束时间的 unix 时间戳，默认与开始时间相同 |
| alarm | 是否提醒 |
| alarmOffset | 提醒提前量，单位秒，默认 0 表示开始时提醒 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.chooseContact(option)

添加手机通讯录联系人。用户可以选择将该表单以「新增联系人」或「添加到已有联系人」的方式，写入手机系统通讯录。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/contact/chooseContact)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| phoneNumber | 手机号 |
| displayName | 联系人姓名 |
| phoneNumberList | 选定联系人的所有手机号（部分 Android 系统只能选联系人而不能选特定手机号） |

### Taro.addPhoneContact(option)

添加手机通讯录联系人。用户可以选择将该表单以「新增联系人」或「添加到已有联系人」的方式，写入手机系统通讯录。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/contact/addPhoneContact)

#### 参数

| 参数 | 说明 |
| --- | --- |
| firstName | 名字 |
| photoFilePath | 头像本地文件路径 |
| nickName | 昵称 |
| middleName | 中间名 |
| lastName | 姓氏 |
| remark | 备注 |
| mobilePhoneNumber | 手机号 |
| weChatNumber | 微信号 |
| addressCountry | 联系地址国家 |
| addressState | 联系地址省份 |
| addressCity | 联系地址城市 |
| addressStreet | 联系地址街道 |
| addressPostalCode | 联系地址邮政编码 |
| organization | 公司 |
| title | 职位 |
| workFaxNumber | 工作传真 |
| workPhoneNumber | 工作电话 |
| hostNumber | 公司电话 |
| email | 电子邮件 |
| url | 网站 |
| workAddressCountry | 工作地址国家 |
| workAddressState | 工作地址省份 |
| workAddressCity | 工作地址城市 |
| workAddressStreet | 工作地址街道 |
| workAddressPostalCode | 工作地址邮政编码 |
| homeFaxNumber | 住宅传真 |
| homePhoneNumber | 住宅电话 |
| homeAddressCountry | 住宅地址国家 |
| homeAddressState | 住宅地址省份 |
| homeAddressCity | 住宅地址城市 |
| homeAddressStreet | 住宅地址街道 |
| homeAddressPostalCode | 住宅地址邮政编码 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.checkIsOpenAccessibility(option)

检测是否开启视觉无障碍功能。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/accessibility/checkIsOpenAccessibility)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| open | iOS 上开启辅助功能旁白，安卓开启 talkback 时返回 true |

### Taro.getBatteryInfoSync()

Taro.getBatteryInfo 的同步版本

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/battery/getBatteryInfoSync)

#### 返回值

| 参数 | 说明 |
| --- | --- |
| isCharging | 是否正在充电中 |
| level | 设备电量，范围 1 - 100 |

### Taro.getBatteryInfo(option)

获取设备电量。同步 API Taro.getBatteryInfoSync 在 iOS 上不可用。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/battery/getBatteryInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| isCharging | 是否正在充电中 |
| level | 设备电量，范围 1 - 100 |
| errMsg | 调用结果 |

### Taro.setClipboardData(option)

设置系统剪贴板的内容。调用成功后，会弹出 toast 提示"内容已复制"，持续 1.5s

> Web: 部分实现

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/clipboard/setClipboardData)

#### Promised

| 参数 | 说明 |
| --- | --- |
| errMsg | 调用信息 |
| data | 剪贴板的内容 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| data | 剪贴板的内容 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getClipboardData(res)

获取系统剪贴板内容

> Web: 部分实现

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/clipboard/getClipboardData)

#### Promised

| 参数 | 说明 |
| --- | --- |
| errMsg | 调用信息 |
| data | 剪贴板的内容 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### SuccessCallbackOption

| 参数 | 说明 |
| --- | --- |
| data | 剪贴板的内容 |

### Taro.onNetworkWeakChange(callback)

监听弱网状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/network/onNetworkWeakChange)

#### 回调

弱网状态变化事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| weakNet | 当前是否处于弱网状态 |
| networkType | 当前网络类型 |

### Taro.onNetworkStatusChange(callback)

监听网络状态变化。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/network/onNetworkStatusChange)

#### 回调

网络状态变化事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| isConnected | 当前是否有网络连接 |
| networkType | 网络类型 |

### Taro.offNetworkWeakChange(callback)

取消监听弱网状态变化事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/network/offNetworkWeakChange)

### Taro.offNetworkStatusChange(callback)

取消监听网络状态变化事件，参数为空，则取消所有的事件监听。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/network/offNetworkStatusChange)

### Taro.getNetworkType(option)

获取网络类型。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/network/getNetworkType)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| networkType | 网络类型 |
| signalStrength | 信号强弱，单位 dbm |
| hasSystemProxy | 设备是否使用了网络代理 |
| errMsg | 调用结果 |

#### NetworkType

网络类型

| 参数 | 说明 |
| --- | --- |
| wifi | wifi 网络 |
| 2g | 2g 网络 |
| 3g | 3g 网络 |
| 4g | 4g 网络 |
| 5g | 5g 网络 |
| unknown | Android 下不常见的网络类型 |
| none | 无网络 |

### Taro.getLocalIPAddress(option)

获取局域网IP地址。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/network/getLocalIPAddress)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| localip | 本机局域网IP地址 |
| netmask | ，基础库 2.24.0 开始支持 |
| errMsg | 调用结果 |

### Taro.setVisualEffectOnCapture(option)

设置截屏/录屏时屏幕表现，仅支持在 Android 端调用

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/screen/setVisualEffectOnCapture)

#### 参数

| 参数 | 说明 |
| --- | --- |
| visualEffect | 截屏/录屏时的表现，仅支持 none / hidden，传入 hidden 则表示在截屏/录屏时隐藏屏幕 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setScreenBrightness(option)

设置屏幕亮度。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/screen/setScreenBrightness)

#### 参数

| 参数 | 说明 |
| --- | --- |
| value | 屏幕亮度值，范围 0 ~ 1。0 最暗，1 最亮 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.setKeepScreenOn(option)

设置是否保持常亮状态。仅在当前小程序生效，离开小程序后设置失效。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/screen/setKeepScreenOn)

#### Promised

| 参数 | 说明 |
| --- | --- |
| errMsg | 调用结果 |

#### 参数

| 参数 | 说明 |
| --- | --- |
| keepScreenOn | 是否保持屏幕常亮 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onUserCaptureScreen(callback)

监听用户主动截屏事件，用户使用系统截屏按键截屏时触发此事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/screen/onUserCaptureScreen)

#### 回调

用户主动截屏事件的回调函数

```tsx
(result: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

### Taro.onScreenRecordingStateChanged(callback)

监听用户录屏事件

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/screen/onScreenRecordingStateChanged)

#### ScreenRecordingState

| 参数 | 说明 |
| --- | --- |
| start | 开始录屏 |
| stop | 结束录屏 |

#### 回调

用户录屏事件的监听函数

```tsx
(state: keyof ScreenRecordingState) => void
```

| 参数 | 说明 |
| --- | --- |
| state | 录屏状态 |

### Taro.offUserCaptureScreen(callback)

用户主动截屏事件。取消事件监听。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/screen/offUserCaptureScreen)

### Taro.offScreenRecordingStateChanged(callback)

取消用户录屏事件的监听函数

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/screen/offScreenRecordingStateChanged)

### Taro.getScreenRecordingState(option)

查询用户是否在录屏

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/screen/getScreenRecordingState)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### ScreenRecordingState

| 参数 | 说明 |
| --- | --- |
| on | 开启 |
| off | 关闭 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| state | 录屏状态 |

### Taro.getScreenBrightness(option)

获取屏幕亮度。

**说明**
- 若安卓系统设置中开启了自动调节亮度功能，则屏幕亮度会根据光线自动调整，该接口仅能获取自动调节亮度之前的值，而非实时的亮度值。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/screen/getScreenBrightness)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### SuccessCallbackOption

| 参数 | 说明 |
| --- | --- |
| value | 屏幕亮度值，范围 0 ~ 1，0 最暗，1 最亮 |

### Taro.onKeyboardHeightChange(callback)

监听键盘高度变化

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/keyboard/onKeyboardHeightChange)

#### 回调

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| height | 键盘高度 |

### Taro.offKeyboardHeightChange(callback)

取消监听键盘高度变化事件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/keyboard/offKeyboardHeightChange)

### Taro.hideKeyboard(option)

在input、textarea等focus拉起键盘之后，手动调用此接口收起键盘

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/keyboard/hideKeyboard)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.getSelectedTextRange(option)

在input、textarea等focus之后，获取输入框的光标位置。注意：只有在focus的时候调用此接口才有效。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/keyboard/getSelectedTextRange)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| end | 输入框光标结束位置 |
| start | 输入框光标起始位置 |
| errMsg | 调用结果 |

### Taro.makePhoneCall(option)

拨打电话

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/phone/makePhoneCall)

#### 参数

| 参数 | 说明 |
| --- | --- |
| phoneNumber | 需要拨打的电话号码 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.stopAccelerometer(res)

停止监听加速度数据。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/accelerometer/stopAccelerometer)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startAccelerometer(res)

开始监听加速度数据。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/accelerometer/startAccelerometer)

#### 参数

| 参数 | 说明 |
| --- | --- |
| interval | 监听加速度数据回调函数的执行频率 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### Interval

| 参数 | 说明 |
| --- | --- |
| game | 适用于更新游戏的回调频率，在 20ms/次 左右 |
| ui | 适用于更新 UI 的回调频率，在 60ms/次 左右 |
| normal | 普通的回调频率，在 200ms/次 左右 |

### Taro.onAccelerometerChange(callback)

监听加速度数据，频率：5次/秒，接口调用后会自动开始监听，可使用 `Taro.stopAccelerometer` 停止监听。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/accelerometer/onAccelerometerChange)

#### 回调

```tsx
(res: Result) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

#### 返回值

| 参数 | 说明 |
| --- | --- |
| x | X 轴 |
| y | Y 轴 |
| z | Z 轴 |

### Taro.offAccelerometerChange(callback)

取消监听加速度数据事件，参数为空，则取消所有的事件监听。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/accelerometer/offAccelerometerChange)

### Taro.stopCompass(option)

停止监听罗盘数据

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/compass/stopCompass)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startCompass(option)

开始监听罗盘数据

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/compass/startCompass)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.onCompassChange(callback)

监听罗盘数据变化事件。频率：5 次/秒，接口调用后会自动开始监听，可使用 Taro.stopCompass 停止监听。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/compass/onCompassChange)

#### 回调

罗盘数据变化事件的回调函数

```tsx
(result: OnCompassChangeCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### OnCompassChangeCallbackResult

| 参数 | 说明 |
| --- | --- |
| accuracy | 精度<br />由于平台差异，accuracy 在 iOS/Android 的值不同。<br />- iOS：accuracy 是一个 number 类型的值，表示相对于磁北极的偏差。0 表示设备指向磁北，90 表示指向东，180 表示指向南，依此类推。<br />- Android：accuracy 是一个 string 类型的枚举值。 |
| direction | 面对的方向度数 |

#### accuracy

| 参数 | 说明 |
| --- | --- |
| high | 高精度 |
| medium | 中等精度 |
| low | 低精度 |
| no-contact | 不可信，传感器失去连接 |
| unreliable | 不可信，原因未知 |
| unknow ${value} | 未知的精度枚举值，即该 Android 系统此时返回的表示精度的 value 不是一个标准的精度枚举值 |

### Taro.offCompassChange(callback)

取消监听罗盘数据变化事件，参数为空，则取消所有的事件监听。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/compass/offCompassChange)

### Taro.stopDeviceMotionListening(option)

停止监听设备方向的变化。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/motion/stopDeviceMotionListening)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startDeviceMotionListening(option)

开始监听设备方向的变化。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/motion/startDeviceMotionListening)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| interval | 监听设备方向的变化回调函数的执行频率 |
| success | 接口调用成功的回调函数 |

#### Interval

| 参数 | 说明 |
| --- | --- |
| game | 适用于更新游戏的回调频率，在 20ms/次 左右 |
| ui | 适用于更新 UI 的回调频率，在 60ms/次 左右 |
| normal | 普通的回调频率，在 200ms/次 左右 |

### Taro.onDeviceMotionChange(callback)

监听设备方向变化事件。频率根据 Taro.startDeviceMotionListening() 的 interval 参数。可以使用 Taro.stopDeviceMotionListening() 停止监听。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/motion/onDeviceMotionChange)

#### 回调

设备方向变化事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| alpha | 当 手机坐标 X/Y 和 地球 X/Y 重合时，绕着 Z 轴转动的夹角为 alpha，范围值为 [0, 2*PI)。逆时针转动为正。 |
| beta | 当手机坐标 Y/Z 和地球 Y/Z 重合时，绕着 X 轴转动的夹角为 beta。范围值为 [-1*PI, PI) 。顶部朝着地球表面转动为正。也有可能朝着用户为正。 |
| gamma | 当手机 X/Z 和地球 X/Z 重合时，绕着 Y 轴转动的夹角为 gamma。范围值为 [-1*PI/2, PI/2)。右边朝着地球表面转动为正。 |

### Taro.offDeviceMotionChange(callback)

取消监听设备方向变化事件，参数为空，则取消所有的事件监听。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/motion/offDeviceMotionChange)

### Taro.stopGyroscope(option)

停止监听陀螺仪数据。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/gyroscope/stopGyroscope)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.startGyroscope(option)

开始监听陀螺仪数据。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/gyroscope/startGyroscope)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| interval | 监听陀螺仪数据回调函数的执行频率 |
| success | 接口调用成功的回调函数 |

#### Interval

监听陀螺仪数据回调函数的执行频率

| 参数 | 说明 |
| --- | --- |
| game | 适用于更新游戏的回调频率，在 20ms/次 左右 |
| ui | 适用于更新 UI 的回调频率，在 60ms/次 左右 |
| normal | 普通的回调频率，在 200ms/次 左右 |

### Taro.onGyroscopeChange(callback)

监听陀螺仪数据变化事件。频率根据 Taro.startGyroscope() 的 interval 参数。可以使用 Taro.stopGyroscope() 停止监听。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/gyroscope/onGyroscopeChange)

#### 回调

陀螺仪数据变化事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| x | x 轴的角速度 |
| y | y 轴的角速度 |
| z | z 轴的角速度 |

### Taro.offGyroscopeChange(callback)

取消监听陀螺仪数据变化事件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/gyroscope/offGyroscopeChange)

### Taro.onMemoryWarning(callback)

监听内存不足告警事件。

当 iOS/Android 向小程序进程发出内存警告时，触发该事件。触发该事件不意味小程序被杀，大部分情况下仅仅是告警，开发者可在收到通知后回收一些不必要资源避免进一步加剧内存紧张。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/memory/onMemoryWarning)

#### 回调

内存不足告警事件的回调函数

```tsx
(result: CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| level | 内存告警等级，只有 Android 才有，对应系统宏定义 |

#### Level

| 参数 | 说明 |
| --- | --- |
| 5 | TRIM_MEMORY_RUNNING_MODERATE |
| 10 | TRIM_MEMORY_RUNNING_LOW |
| 15 | TRIM_MEMORY_RUNNING_CRITICAL |

### Taro.offMemoryWarning(callback)

取消监听内存不足告警事件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/memory/offMemoryWarning)

### Taro.scanCode(option)

调起客户端扫码界面，扫码成功后返回对应的结果

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/scan/scanCode)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| onlyFromCamera | 是否只能从相机扫码，不允许从相册选择图片 |
| scanType | 扫码类型 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| charSet | 所扫码的字符集 |
| path | 当所扫的码为当前小程序二维码时，会返回此字段，内容为二维码携带的 path |
| rawData | 原始数据，base64编码 |
| result | 所扫码的内容 |
| scanType | 所扫码的类型 |
| errMsg | 调用结果 |

#### ScanType

扫码类型

| 参数 | 说明 |
| --- | --- |
| barCode | 一维码 |
| qrCode | 二维码 |
| datamatrix | Data Matrix 码 |
| pdf417 | PDF417 条码 |

#### QRType

所扫码的类型

| 参数 | 说明 |
| --- | --- |
| QR_CODE | 二维码 |
| AZTEC | 一维码 |
| CODABAR | 一维码 |
| CODE_39 | 一维码 |
| CODE_93 | 一维码 |
| CODE_128 | 一维码 |
| DATA_MATRIX | 二维码 |
| EAN_8 | 一维码 |
| EAN_13 | 一维码 |
| ITF | 一维码 |
| MAXICODE | 一维码 |
| PDF_417 | 二维码 |
| RSS_14 | 一维码 |
| RSS_EXPANDED | 一维码 |
| UPC_A | 一维码 |
| UPC_E | 一维码 |
| UPC_EAN_EXTENSION | 一维码 |
| WX_CODE | 二维码 |
| CODE_25 | 一维码 |

### Taro.sendSms(option)

拉起手机发送短信界面

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/sms/sendSms)

#### 参数

| 参数 | 说明 |
| --- | --- |
| phoneNumber | 预填到发送短信面板的手机号 |
| content | 预填到发送短信面板的内容 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.vibrateShort(option)

使手机发生较短时间的振动（15 ms）。仅在 iPhone `7 / 7 Plus` 以上及 Android 机型生效

`type` 参数支持微信小程序。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/vibrate/vibrateShort)

#### 参数

| 参数 | 说明 |
| --- | --- |
| type | 震动强度类型，有效值为：heavy、medium、light |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.vibrateLong(option)

使手机发生较长时间的振动（400ms）

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/device/vibrate/vibrateLong)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

## AI

### Taro.getInferenceEnvInfo(option)

获取通用AI推理引擎版本

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/inference/getInferenceEnvInfo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| ver | AI推理引擎版本 |

### Taro.createInferenceSession(option)

创建 AI 推理 Session

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/inference/createInferenceSession)

#### 参数

| 参数 | 说明 |
| --- | --- |
| model | 模型文件路径，目前只执行后缀为.onnx格式(支持代码包路径，和本地文件系统路径） |
| precesionLevel | 推理精度，有效值为 0 - 4。<br />一般来说，使用的precesionLevel等级越低，推理速度越快，但可能会损失精度。<br />推荐开发者在开发时，在效果满足需求时优先使用更低精度以提高推理速度，节约能耗。 |
| allowQuantize | 是否生成量化模型推理 |
| allowNPU | 是否使用NPU推理，仅对IOS有效 |
| typicalShape | 输入典型分辨率 |

#### PrecesionLevel

| 参数 | 说明 |
| --- | --- |
| 0 | 使用fp16 存储浮点，fp16计算，Winograd 算法也采取fp16 计算，开启近似math计算 |
| 1 | 使用fp16 存储浮点，fp16计算，禁用 Winograd 算法，开启近似math计算 |
| 2 | 使用fp16 存储浮点，fp32计算，开启 Winograd，开启近似math计算 |
| 3 | 使用fp32 存储浮点，fp32计算，开启 Winograd，开启近似math计算 |
| 4 | 使用fp32 存储浮点，fp32计算，开启 Winograd，关闭近似math计算 |

### InferenceSession

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/inference/InferenceSession)

##### destroy

销毁 InferenceSession 实例

```tsx
() => void
```

##### offError

取消监听模型加载失败事件. 传入指定回调函数则只取消指定回调，不传则取消所有回调

```tsx
(callback?: OnErrorCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offLoad

取消监听模型加载完成事件

```tsx
(callback?: OnLoadCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onError

监听模型加载失败事件

```tsx
(callback: OnErrorCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onLoad

监听模型加载完成事件

```tsx
(callback: OnLoadCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### run

运行推断
需要在 session.onLoad 回调后使用。接口参数为 Tensors 对象，返回 Promise。
一个 InferenceSession 被创建完成后可以重复多次调用 InferenceSession.run(), 直到调用 session.destroy() 进行销毁。

```tsx
(option: Tensors) => Promise<Tensors>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### Tensor

| 参数 | 说明 |
| --- | --- |
| shape | Tensor shape （Tensor 形状，例如 [1, 3, 224, 224] 即表示一个4唯Tensor，每个维度的长度分别为1, 3, 224, 224） |
| data | Tensor 值，一段 ArrayBuffer |
| type | ArrayBuffer 值的类型，合法值有 uint8, int8, uint32, int32, float32 |

##### Tensors

| 参数 | 说明 |
| --- | --- |
| __index |  |

##### OnErrorCallback

模型加载失败回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnLoadCallback

模型加载完成回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### Taro.isVKSupport(version)

判断支持版本

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/isVKSupport)

#### IVersion

vision kit 版本

| 参数 | 说明 |
| --- | --- |
| v1 | 旧版本 |
| v2 | v2 版本，目前只有 iOS 基础库 2.22.0 以上支持 |

### Taro.createVKSession(version)

创建 vision kit 会话对象

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/createVKSession)

#### IVersion

vision kit 版本

| 参数 | 说明 |
| --- | --- |
| v1 | 旧版本 |
| v2 | v2 版本，目前只有 iOS 基础库 2.22.0 以上支持 |

#### ITrack

跟踪配置

| 参数 | 说明 |
| --- | --- |
| plane | 平面跟踪配置 |

#### IPlane

平面跟踪配置

| 参数 | 说明 |
| --- | --- |
| mode | 平面跟踪配置模式 |

#### IPlaneMode

平面跟踪配置模式合法值

| 参数 | 说明 |
| --- | --- |
| 1 | 检测横向平面 |
| 2 | 检测纵向平面，只有 v2 版本支持 |
| 3 | 检测横向和纵向平面，只有 v2 版本支持 |

### VKBodyAnchor

人体 anchor

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKBodyAnchor)

#### 方法

| 参数 | 说明 |
| --- | --- |
| id | 唯一标识 |
| type | 类型 |
| detectId | 识别序号 |
| size | 相对视窗的尺寸，取值范围为 [0, 1]，0 为左/上边缘，1 为右/下边缘 |
| origin | 相对视窗的位置信息，取值范围为 [0, 1]，0 为左/上边缘，1 为右/下边缘 |
| confidence | 关键点的置信度 |
| points | 关键点 |
| score | 总体置信值 |

##### IType

类型

| 参数 | 说明 |
| --- | --- |
| 5 | 人体 |

##### ISize

相对视窗的尺寸

| 参数 | 说明 |
| --- | --- |
| width | 宽度 |
| height | 高度 |

##### IOrigin

相对视窗的位置信息

| 参数 | 说明 |
| --- | --- |
| x | 横坐标 |
| y | 纵坐标 |

##### IPoint

关键点

| 参数 | 说明 |
| --- | --- |
| x | 横坐标 |
| y | 纵坐标 |

### VKCamera

相机对象

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKCamera)

#### 方法

| 参数 | 说明 |
| --- | --- |
| viewMatrix | 视图矩阵 |
| intrinsics | 相机内参，只有 v2 版本支持 |

##### getProjectionMatrix

获取投影矩阵

```tsx
(near: number, far: number) => Float32Array
```

| 参数 | 说明 |
| --- | --- |
| near | 近视点 |
| far | 远视点 |

### VKDepthAnchor

depth anchor

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKDepthAnchor)

#### 方法

| 参数 | 说明 |
| --- | --- |
| id | 唯一标识 |
| type | 类型 |
| size | 相对视窗的尺寸，取值范围为 [0, 1]，0 为左/上边缘，1 为右/下边缘 |
| depthArray | 包含深度信息的数组 |

##### IType

类型

| 参数 | 说明 |
| --- | --- |
| 8 | DEPTH |

##### ISize

相对视窗的尺寸

| 参数 | 说明 |
| --- | --- |
| width | 宽度 |
| height | 高度 |

### VKFaceAnchor

人脸 anchor

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKFaceAnchor)

#### 方法

| 参数 | 说明 |
| --- | --- |
| id | 唯一标识 |
| type | 类型 |
| detectId | 识别序号 |
| origin | 相对视窗的位置信息，取值范围为 [0, 1]，0 为左/上边缘，1 为右/下边缘 |
| size | 相对视窗的尺寸，取值范围为 [0, 1]，0 为左/上边缘，1 为右/下边缘 |
| points | 人脸 106 个关键点的坐标 |
| angle | 人脸角度信息 |
| confidence | 关键点的置信度 |

##### IType

类型

| 参数 | 说明 |
| --- | --- |
| 3 | 人脸 |

##### ISize

相对视窗的尺寸

| 参数 | 说明 |
| --- | --- |
| width | 宽度 |
| height | 高度 |

##### IOrigin

相对视窗的位置信息

| 参数 | 说明 |
| --- | --- |
| x | 横坐标 |
| y | 纵坐标 |

##### IPoint

关键点

| 参数 | 说明 |
| --- | --- |
| x | 横坐标 |
| y | 纵坐标 |

### VKFrame

vision kit 会话对象

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKFrame)

#### 方法

| 参数 | 说明 |
| --- | --- |
| timestamp | 生成时间 |
| camera | 相机对象 |

##### getCameraTexture

获取当前帧纹理，目前只支持 YUV 纹理

```tsx
(ctx: WebGLRenderingContext) => IGetCameraTextureResult
```

| 参数 | 说明 |
| --- | --- |
| ctx |  |

##### getCameraBuffer

获取当前帧 rgba buffer。iOS 端微信在 v8.0.20 开始支持，安卓端微信在 v8.0.30 开始支持。
按 aspect-fill 规则裁剪，此接口要求在创建 VKSession 对象时必须传入 gl 参数。
此接口仅建议拿来做帧分析使用，上屏请使用 getCameraTexture 来代替。

```tsx
(widht: number, height: number) => ArrayBuffer
```

| 参数 | 说明 |
| --- | --- |
| widht |  |
| height |  |

##### getDisplayTransform

获取纹理调整矩阵。默认获取到的纹理是未经裁剪调整的纹理，此矩阵可用于在着色器中根据帧对象尺寸对纹理进行裁剪

```tsx
() => Float32Array
```

##### IGetCameraTextureResult

帧纹理对象

| 参数 | 说明 |
| --- | --- |
| yTexture | Y 分量纹理 |
| uvTexture | UV 分量纹理 |

### VKHandAnchor

手势 anchor

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKHandAnchor)

#### 方法

| 参数 | 说明 |
| --- | --- |
| id | 唯一标识 |
| type | 类型 |
| detectId | 识别序号 |
| size | 相对视窗的尺寸，取值范围为 [0, 1]，0 为左/上边缘，1 为右/下边缘 |
| origin | 相对视窗的位置信息，取值范围为 [0, 1]，0 为左/上边缘，1 为右/下边缘 |
| confidence | 关键点的置信度 |
| points | 关键点 |
| score | 总体置信值 |
| gesture | 手势分类, 返回整数 -1 到 18, -1 表示无效手势 |

##### IType

类型

| 参数 | 说明 |
| --- | --- |
| 7 | 手势 |

##### ISize

相对视窗的尺寸

| 参数 | 说明 |
| --- | --- |
| width | 宽度 |
| height | 高度 |

##### IOrigin

相对视窗的位置信息

| 参数 | 说明 |
| --- | --- |
| x | 横坐标 |
| y | 纵坐标 |

##### IPoint

关键点

| 参数 | 说明 |
| --- | --- |
| x | 横坐标 |
| y | 纵坐标 |

##### IGesture

手势分类

| 参数 | 说明 |
| --- | --- |
| 0 | 单手比心 |
| 1 | 布（数字5） |
| 2 | 剪刀（数字2） |
| 3 | 握拳 |
| 4 | 数字1 |
| 5 | 热爱 |
| 6 | 点赞 |
| 7 | 数字3 |
| 8 | 摇滚 |
| 9 | 数字6 |
| 10 | 数字8 |
| 11 | 双手抱拳（恭喜发财） |
| 12 | 数字4 |
| 13 | 比ok |
| 14 | 不喜欢（踩） |
| 15 | 双手比心 |
| 16 | 祈祷（双手合十） |
| 17 | 双手抱拳 |
| 18 | 无手势动作 |

### VKMarkerAnchor

marker anchor

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKMarkerAnchor)

#### 方法

| 参数 | 说明 |
| --- | --- |
| id | 唯一标识 |
| type | 类型 |
| transform | 包含位置、旋转、放缩信息的矩阵，以列为主序 |
| markerId | marker id |
| path | 图片路径 |

##### IType

类型

| 参数 | 说明 |
| --- | --- |
| 1 | marker |

### VKOCRAnchor

OCR anchor

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKOCRAnchor)

#### 方法

| 参数 | 说明 |
| --- | --- |
| id | 唯一标识 |
| type | 类型 |
| text | 识别的文字结果 |

##### IType

类型

| 参数 | 说明 |
| --- | --- |
| 6 | OCR |

### VKOSDAnchor

OSD anchor

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKOSDAnchor)

#### 方法

| 参数 | 说明 |
| --- | --- |
| id | 唯一标识 |
| type | 类型 |
| markerId | marker id |
| size | 相对视窗的尺寸，取值范围为 [0, 1]，0 为左/上边缘，1 为右/下边缘 |
| path | 图片路径 |
| origin | 相对视窗的位置信息，取值范围为 [0, 1]，0 为左/上边缘，1 为右/下边缘 |

##### IType

类型

| 参数 | 说明 |
| --- | --- |
| 2 | OSD |

##### ISize

相对视窗的尺寸

| 参数 | 说明 |
| --- | --- |
| width | 宽度 |
| height | 高度 |

##### IOrigin

相对视窗的位置信息

| 参数 | 说明 |
| --- | --- |
| x | 横坐标 |
| y | 纵坐标 |

### VKPlaneAnchor

平面 anchor，只有 v2 版本支持

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKPlaneAnchor)

#### 方法

| 参数 | 说明 |
| --- | --- |
| id | 唯一标识 |
| type | 类型 |
| transform | 包含位置、旋转、放缩信息的矩阵，以列为主序 |
| size | 尺寸 |
| alignment | 方向 |

##### IType

类型

| 参数 | 说明 |
| --- | --- |
| 0 | 平面 |

##### ISize

相对视窗的尺寸

| 参数 | 说明 |
| --- | --- |
| width | 宽度 |
| height | 高度 |

### VKSession

vision kit 会话对象

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/visionkit/VKSession)

#### 方法

| 参数 | 说明 |
| --- | --- |
| state | 会话状态 |
| config | 会话配置 |
| cameraSize | 相机尺寸 |

##### addMarker

添加一个 marker，要求调 Taro.createVKSession 时传入的 track.marker 为 true

```tsx
(path: string) => number
```

| 参数 | 说明 |
| --- | --- |
| path | 图片路径，目前只支持本地用户图片 |

##### addOSDMarker

添加一个 OSD marker（one-shot detection marker），要求调 Taro.createVKSession 时传入的 track.OSD 为 true

```tsx
(path: string) => number
```

| 参数 | 说明 |
| --- | --- |
| path | 图片路径，目前只支持本地用户图片 |

##### cancelAnimationFrame

取消由 requestAnimationFrame 添加到计划中的动画帧请求

```tsx
(requestID: number) => void
```

| 参数 | 说明 |
| --- | --- |
| requestID |  |

##### destroy

销毁会话

```tsx
() => void
```

##### detectBody

静态图像人体关键点检测。当 Taro.createVKSession 参数传入 {track: {body: {mode: 2} } } 时可用。

```tsx
(option: IDetectBodyOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### detectDepth

深度识别。当 Taro.createVKSession 参数传入 {track: {depth: {mode: 2} } } 时可用。

```tsx
(option: IDetectDepthOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### detectFace

静态图像人脸关键点检测。当 Taro.createVKSession 参数传入 {track: {face: {mode: 2} } } 时可用。安卓微信8.0.25开始支持，iOS微信8.0.24开始支持。

```tsx
(option: IDetectFaceOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### detectHand

静态图像手势关键点检测。当 Taro.createVKSession 参数传入 {track: {hand: {mode: 2} } } 时可用。

```tsx
(option: IDetectHandOption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### getAllMarker

获取所有 marker，要求调 Taro.createVKSession 时传入的 track.marker 为 true

```tsx
() => IMarker[]
```

##### getAllOSDMarker

获取所有 OSD marker，要求调 Taro.createVKSession 时传入的 track.OSD 为 true

```tsx
() => IOSDMarker[]
```

##### getVKFrame

获取帧对象，每调用一次都会触发一次帧分析过程

```tsx
(width: number, height: number) => VKFrame
```

| 参数 | 说明 |
| --- | --- |
| width | 宽度 |
| height | 高度 |

##### hitTest

触摸检测，v1 版本只支持单平面（即 hitTest 生成一次平面后，后续 hitTest 均不会再生成平面，而是以之前生成的平面为基础进行检测）。

如果需要重新识别其他平面，可以在调用此方法时将 reset 参数置为 true。

```tsx
(x: number, y: number, reset?: boolean) => IHitTestResult[]
```

| 参数 | 说明 |
| --- | --- |
| x | 相对视窗的横坐标，取值范围为 [0, 1]，0 为左边缘，1 为右边缘 |
| y | 相对视窗的纵坐标，取值范围为 [0, 1]，0 为上边缘，1 为下边缘 |
| reset | 是否需要重新识别其他平面，v2 版本不再需要此参数 |

##### off

取消监听会话事件。

```tsx
(eventName: string, fn: TaroGeneral.EventCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名称 |
| fn | 事件监听函数 |

##### on

监听会话事件。

```tsx
(eventName: string, fn: TaroGeneral.EventCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| eventName | 事件名称 |
| fn | 事件监听函数 |

##### removeMarker

删除一个 marker，要求调 Taro.createVKSession 时传入的 track.marker 为 true

```tsx
(markerId: number) => number
```

| 参数 | 说明 |
| --- | --- |
| markerId | marker id |

##### removeOSDMarker

删除一个 OSD marker，要求调 Taro.createVKSession 时传入的 track.OSD 为 true

```tsx
(markerId: number) => number
```

| 参数 | 说明 |
| --- | --- |
| markerId | marker id |

##### requestAnimationFrame

在下次进行重绘时执行。

```tsx
(callback: TaroGeneral.TFunc) => number
```

| 参数 | 说明 |
| --- | --- |
| callback | 执行函数 |

##### runOCR

静态图像 OCR 检测。当 Taro.createVKSession 参数传入 {track: {OCR: {mode: 2} } } 时可用。

```tsx
(option: IRunOCROption) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

##### start

开启会话。

```tsx
(callback: (status: keyof IStartStatus) => void) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 开启会话回调 |

##### stop

停止会话。

```tsx
() => void
```

##### update3DMode

开启 3D 模式

```tsx
(open3d: boolean) => void
```

| 参数 | 说明 |
| --- | --- |
| open3d | 是否开启 |

##### updateOSDThreshold

更新 OSD 识别精确度，要求调 Taro.createVKSession 时传入的 track.OSD 为 true

```tsx
(threshold: number) => void
```

| 参数 | 说明 |
| --- | --- |
| threshold | 阈值 |

##### IState

state 的合法值

| 参数 | 说明 |
| --- | --- |
| 0 | 不可用 |
| 1 | 运行中 |
| 2 | 暂停中 |
| 3 | 初始化中 |

##### IConfig

会话配置

| 参数 | 说明 |
| --- | --- |
| version | 不可用 |
| track | 运行中 |
| marker | marker 跟踪配置，基础库(3.0.0)开始允许同时支持v2的水平面检测能力 |
| OSD | OSD 跟踪配置 |
| depth | 深度识别配置 |
| face | 人脸检测配置。安卓微信8.0.25开始支持，iOS微信8.0.24开始支持。 |
| OCR | OCR 检测配置。 |
| body | 人体检测配置。 |
| hand | 手势检测配置。 |
| threeDof | 提供基础AR功能，输出相机旋转的3个自由度的位姿，利用手机陀螺仪传感器，实现快速稳定的AR定位能力，适用于简单AR场景。 |
| gl | 绑定的 WebGLRenderingContext 对象 |

##### IVersion

vision kit 版本

| 参数 | 说明 |
| --- | --- |
| v1 | 旧版本 |
| v2 | v2 版本，目前只有 iOS 基础库 2.22.0 以上支持 |

##### ITrack

跟踪配置

| 参数 | 说明 |
| --- | --- |
| plane | 平面跟踪配置 |

##### IPlane

平面跟踪配置

| 参数 | 说明 |
| --- | --- |
| mode | 平面跟踪配置模式 |

##### IPlaneMode

平面跟踪配置模式合法值

| 参数 | 说明 |
| --- | --- |
| 1 | 检测横向平面 |
| 2 | 检测纵向平面，只有 v2 版本支持 |
| 3 | 检测横向和纵向平面，只有 v2 版本支持 |

##### IDepth

深度识别配置

| 参数 | 说明 |
| --- | --- |
| mode |  |

##### IDepthMode

深度识别模式

| 参数 | 说明 |
| --- | --- |
| 1 | 通过摄像头实时检测 |
| 2 | 静态图片检测 |

##### IFace

人脸检测模式

| 参数 | 说明 |
| --- | --- |
| mode |  |

##### IFaceMode

人脸检测模式

| 参数 | 说明 |
| --- | --- |
| 1 | 通过摄像头实时检测 |
| 2 | 静态图片检测 |

##### IOCR

OCR 检测配置

| 参数 | 说明 |
| --- | --- |
| mode |  |

##### IOCRMode

OCR 检测模式

| 参数 | 说明 |
| --- | --- |
| 1 | 通过摄像头实时检测 |
| 2 | 静态图片检测 |

##### IBody

人体检测模式

| 参数 | 说明 |
| --- | --- |
| mode |  |

##### IBodyMode

人体检测模式

| 参数 | 说明 |
| --- | --- |
| 1 | 通过摄像头实时检测 |
| 2 | 静态图片检测 |

##### IHand

手势检测配置

| 参数 | 说明 |
| --- | --- |
| mode |  |

##### IHandMode

手势检测模式

| 参数 | 说明 |
| --- | --- |
| 1 | 通过摄像头实时检测 |
| 2 | 静态图片检测 |

##### ISize

相机尺寸

| 参数 | 说明 |
| --- | --- |
| width | 宽度 |
| height | 高度 |

##### IDetectBodyOption

| 参数 | 说明 |
| --- | --- |
| frameBuffer | 人脸图像像素点数据，每四项表示一个像素点的 RGBA |
| width | 图像宽度 |
| height | 图像高度 |
| scoreThreshold | 评分阈值。正常情况传入 0.8 即可。默认值 0.8 |
| sourceType | 图像源类型。正常情况传入 1 即可。当输入的图片是来自一个连续视频的每一帧图像时，sourceType 传入 0 会得到更优的效果。默认值1 |

##### ISourceType

图像源类型。

| 参数 | 说明 |
| --- | --- |
| 1 | 表示输入的图片是随机的图片 |
| 0 | 表示输入的图片是来自一个连续视频的每一帧图像 |

##### IDetectDepthOption

| 参数 | 说明 |
| --- | --- |
| frameBuffer | 人需要识别深度的图像像素点数据，每四项表示一个像素点的 RGBA |
| width | 图像宽度 |
| height | 图像高度 |

##### IDetectFaceOption

| 参数 | 说明 |
| --- | --- |
| frameBuffer | 人脸图像像素点数据，每四项表示一个像素点的 RGBA |
| width | 图像宽度 |
| height | 图像高度 |
| scoreThreshold | 评分阈值。正常情况传入 0.8 即可。默认值 0.8 |
| sourceType | 图像源类型。正常情况传入 1 即可。当输入的图片是来自一个连续视频的每一帧图像时，sourceType 传入 0 会得到更优的效果。默认值1 |
| modelModel | 算法模型类型。正常情况传入 1 即可。0、1、2 分别表示小、中、大模型，模型越大识别准确率越高，但资源占用也越高。建议根据用户设备性能进行选择。 |

##### IModelModel

算法模型类型

| 参数 | 说明 |
| --- | --- |
| 0 | 小模型 |
| 1 | 中模型 |
| 2 | 大模型 |

##### IDetectHandOption

| 参数 | 说明 |
| --- | --- |
| frameBuffer | 人脸图像像素点数据，每四项表示一个像素点的 RGBA |
| width | 图像宽度 |
| height | 图像高度 |
| scoreThreshold | 评分阈值。正常情况传入 0.8 即可。默认值0.8 |
| algoMode | 算法检测模式 |

##### IAlgoMode

算法检测模式

| 参数 | 说明 |
| --- | --- |
| 0 | 检测模式，输出框和点 |
| 1 | 手势模式，输出框和手势分类 |
| 2 | 结合0和1模式，输出框、点、手势分类 |

##### IMarker

| 参数 | 说明 |
| --- | --- |
| markerId | marker id |
| path | 图片路径 |

##### IOSDMarker

OSD marker

| 参数 | 说明 |
| --- | --- |
| markerId | marker id |
| path | 图片路径 |

##### IRunOCROption

| 参数 | 说明 |
| --- | --- |
| frameBuffer | 待识别图像的像素点数据，每四项表示一个像素点的 RGBA |
| width | 图像宽度 |
| height | 图像高度 |

##### IHitTestResult

hitTest 检测结果

| 参数 | 说明 |
| --- | --- |
| transform | 包含位置、旋转、放缩信息的矩阵，以列为主序 |

##### IStartStatus

start status 的合法值

| 参数 | 说明 |
| --- | --- |
| 0 | 成功 |
| 2000000 | 系统错误 |
| 2000001 | 参数错误 |
| 2000002 | 设备不支持 |
| 2000003 | 系统不支持 |
| 2003000 | 会话不可用 |
| 2003001 | 未开启系统相机权限 |
| 2003002 | 未开启小程序相机权限 |

### Taro.stopFaceDetect(option)

停止人脸识别

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/face/stopFaceDetect)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.initFaceDetect(option)

初始化人脸识别

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/face/initFaceDetect)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

### Taro.faceDetect(option)

人脸识别，使用前需要通过 Taro.initFaceDetect 进行一次初始化，推荐使用相机接口返回的帧数据

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ai/face/faceDetect)

#### 参数

| 参数 | 说明 |
| --- | --- |
| frameBuffer | 图像像素点数据，每四项表示一个像素点的 RGBA |
| width | 图像宽度 |
| height | 图像高度 |
| enablePoint | 是否返回当前图像的人脸（106 个点） |
| enableConf | 是否返回当前图像的人脸的置信度（可表示器官遮挡情况） |
| enableAngle | 是否返回当前图像的人脸角度信息 |
| enableMultiFace | 是否返回多张人脸的信息 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### SuccessCallbackOption

| 参数 | 说明 |
| --- | --- |
| faceInfo | 多人模式（enableMultiFace）下的人脸信息，每个对象包含上述其它属性 |

#### face

| 参数 | 说明 |
| --- | --- |
| detectRect | 脸部正方框数值，对象包含 height, weight, originX, originY 四个属性 |
| x | 脸部中心点横坐标，检测不到人脸则为 -1 |
| y | 脸部中心点纵坐标，检测不到人脸则为 -1 |
| pointArray | 人脸 106 个点位置数组，数组每个对象包含 x 和 y |
| confArray | 人脸置信度，取值范围 [0, 1]，数值越大置信度越高（遮挡越少） |
| angleArray | 人脸角度信息，取值范围 [-1, 1]，数值越接近 0 表示越正对摄像头 |

#### detectRect

脸部正方框数值

| 参数 | 说明 |
| --- | --- |
| height |  |
| weight |  |
| originX |  |
| originY |  |

#### point

| 参数 | 说明 |
| --- | --- |
| x |  |
| y |  |

#### conf

| 参数 | 说明 |
| --- | --- |
| global | 整体可信度 |
| leftEye | 左眼可信度 |
| rightEye | 右眼可信度 |
| mouth | 嘴巴可信度 |
| nose | 鼻子可信度 |

#### angle

| 参数 | 说明 |
| --- | --- |
| pitch | 仰俯角（点头） |
| yaw | 偏航角（摇头） |
| roll | 翻滚角（左右倾） |

### Taro.checkIsSupportFacialRecognition(option)

检查是否支持面部识别

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/facial/checkIsSupportFacialRecognition)

#### 参数

| 参数 | 说明 |
| --- | --- |
| checkAliveType | 交互方式 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |
| errCode | 错误码 |

### Taro.startFacialRecognitionVerify(option)

开始人脸识别认证

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/facial/startFacialRecognitionVerify)

#### 参数

| 参数 | 说明 |
| --- | --- |
| name | 身份证名称 |
| idCardNumber | 身份证名称 |
| checkAliveType | 交互方式 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |
| errCode | 错误码 |
| verifyResult | 认证结果 |

### Taro.startFacialRecognitionVerifyAndUploadVideo(option)

开始人脸识别认证并上传认证视频

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/open-api/facial/startFacialRecognitionVerifyAndUploadVideo)

#### 参数

| 参数 | 说明 |
| --- | --- |
| name | 身份证名称 |
| idCardNumber | 身份证名称 |
| checkAliveType | 交互方式 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 回调参数

| 参数 | 说明 |
| --- | --- |
| errMsg | 错误信息 |
| errCode | 错误码 |
| verifyResult | 认证结果 |

## Worker

### Taro.createWorker(scriptPath)

创建一个 Worker 线程。目前限制最多只能创建一个 Worker，创建下一个 Worker 前请先调用 [Worker.terminate](https://docs.taro.zone/docs/apis/worker/#terminate)

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/worker/createWorker)

### Worker

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/worker/Worker)

##### onMessage

监听主线程/Worker 线程向当前线程发送的消息的事件。

```tsx
(callback: OnMessageCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | 主线程/Worker 线程向当前线程发送的消息的事件的回调函数 |

##### onProcessKilled

监听 worker 线程被系统回收事件（当 iOS 系统资源紧张时，worker 线程存在被系统回收的可能，开发者可监听此事件并重新创建一个 worker）

```tsx
(callback: OnMessageCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback | worker 线程被系统回收事件的回调函数 |

##### postMessage

向主线程/Worker 线程发送的消息。

```tsx
(message: TaroGeneral.IAnyObject) => void
```

| 参数 | 说明 |
| --- | --- |
| message | 需要发送的消息，必须是一个可序列化的 JavaScript key-value 形式的对象。 |

##### terminate

结束当前 Worker 线程。仅限在主线程 worker 对象上调用。

```tsx
() => void
```

##### OnMessageCallback

```tsx
(result: OnMessageCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnMessageCallbackResult

| 参数 | 说明 |
| --- | --- |
| message | 主线程/Worker 线程向当前线程发送的消息 |

## WXML

### Taro.createSelectorQuery()

返回一个 SelectorQuery 对象实例。在自定义组件或包含自定义组件的页面中，应使用 `this.createSelectorQuery()` 来代替。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/wxml/createSelectorQuery)

### Taro.createIntersectionObserver(component, options)

创建并返回一个 IntersectionObserver 对象实例。在自定义组件或包含自定义组件的页面中，应使用 `this.createIntersectionObserver([options])` 来代替。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/wxml/createIntersectionObserver)

#### 参数

选项

| 参数 | 说明 |
| --- | --- |
| initialRatio | 初始的相交比例，如果调用时检测到的相交比例与这个值不相等且达到阈值，则会触发一次监听器的回调函数。 |
| observeAll | 是否同时观测多个目标节点（而非一个），如果设为 true ，observe 的 targetSelector 将选中多个节点（注意：同时选中过多节点将影响渲染性能） |
| thresholds | 一个数值数组，包含所有阈值。 |

### Taro.createMediaQueryObserver()

创建并返回一个 MediaQueryObserver 对象实例。在自定义组件或包含自定义组件的页面中，应使用 `this.createMediaQueryObserver()` 来代替。

**支持：** Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/wxml/createMediaQueryObserver)

### IntersectionObserver

`IntersectionObserver` 对象，用于推断某些节点是否可以被用户看见、有多大比例可以被用户看见。

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/wxml/IntersectionObserver)

##### disconnect

停止监听。回调函数将不再触发

```tsx
() => void
```

##### observe

指定目标节点并开始监听相交状态变化情况

```tsx
(targetSelector: string, callback: ObserveCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| targetSelector | 选择器 |
| callback | 监听相交状态变化的回调函数 |

##### relativeTo

使用选择器指定一个节点，作为参照区域之一。

```tsx
(selector: string, margins?: RelativeToMargins) => IntersectionObserver
```

| 参数 | 说明 |
| --- | --- |
| selector | 选择器 |
| margins | 用来扩展（或收缩）参照节点布局区域的边界 |

##### relativeToViewport

指定页面显示区域作为参照区域之一

```tsx
(margins?: RelativeToViewportMargins) => IntersectionObserver
```

| 参数 | 说明 |
| --- | --- |
| margins | 用来扩展（或收缩）参照节点布局区域的边界 |

##### ObserveCallback

监听相交状态变化的回调函数

```tsx
(result: ObserveCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### ObserveCallbackResult

| 参数 | 说明 |
| --- | --- |
| boundingClientRect | 目标边界 |
| intersectionRatio | 相交比例 |
| intersectionRect | 相交区域的边界 |
| relativeRect | 参照区域的边界 |
| time | 相交检测时的时间戳 |

##### RelativeRectResult

参照区域的边界

| 参数 | 说明 |
| --- | --- |
| bottom | 下边界 |
| left | 左边界 |
| right | 右边界 |
| top | 上边界 |

##### IntersectionRectResult

相交区域的边界

| 参数 | 说明 |
| --- | --- |
| bottom | 下边界 |
| height | 高度 |
| left | 左边界 |
| right | 右边界 |
| top | 上边界 |
| width | 宽度 |

##### BoundingClientRectResult

目标边界

| 参数 | 说明 |
| --- | --- |
| bottom | 下边界 |
| height | 高度 |
| left | 左边界 |
| right | 右边界 |
| top | 上边界 |
| width | 宽度 |

##### RelativeToMargins

用来扩展（或收缩）参照节点布局区域的边界

| 参数 | 说明 |
| --- | --- |
| bottom | 节点布局区域的下边界 |
| left | 节点布局区域的左边界 |
| right | 节点布局区域的右边界 |
| top | 节点布局区域的上边界 |

##### RelativeToViewportMargins

用来扩展（或收缩）参照节点布局区域的边界

| 参数 | 说明 |
| --- | --- |
| bottom | 节点布局区域的下边界 |
| left | 节点布局区域的左边界 |
| right | 节点布局区域的右边界 |
| top | 节点布局区域的上边界 |

### MediaQueryObserver

`MediaQueryObserver` 对象，用于监听页面 media query 状态的变化，如界面的长宽是不是在某个指定的范围内。

[查看 Taro 文档](https://docs.taro.zone/docs/apis/wxml/MediaQueryObserver)

##### observe

开始监听页面 media query 变化情况

```tsx
(descriptor: descriptor, callback: observeCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| descriptor |  |
| callback |  |

##### disconnect

停止监听。回调函数将不再触发

```tsx
() => void
```

##### descriptor

media query 描述符

| 参数 | 说明 |
| --- | --- |
| minWidth | 页面最小宽度 (单位: px) |
| maxWidth | 页面最大宽度 (单位: px) |
| width | 页面宽度 (单位: px) |
| minHeight | 页面最小高度 (单位: px) |
| maxHeight | 页面最大高度（px 为单位） |
| height | 页面高度（px 为单位） |
| orientation | 屏幕方向 |

##### observeCallback

监听 media query 状态变化的回调函数

```tsx
(res: { matches: boolean; }) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

### NodesRef

用于获取 `WXML` 节点信息的对象

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/wxml/NodesRef)

##### boundingClientRect

添加节点的布局位置的查询请求。相对于显示区域，以像素为单位。其功能类似于 DOM 的 `getBoundingClientRect`。返回 `NodesRef` 对应的 `SelectorQuery`。

```tsx
(callback?: BoundingClientRectCallback) => SelectorQuery
```

| 参数 | 说明 |
| --- | --- |
| callback | 回调函数，在执行 `SelectorQuery.exec` 方法后，节点信息会在 `callback` 中返回。 |

##### context

添加节点的 Context 对象查询请求。目前支持 [VideoContext](https://docs.taro.zone/docs/apis/media/video/VideoContext)、[CanvasContext](https://docs.taro.zone/docs/apis/canvas/CanvasContext)、[LivePlayerContext](https://docs.taro.zone/docs/apis/media/live/LivePlayerContext)、[EditorContext](https://docs.taro.zone/docs/apis/media/editor/EditorContext)和 [MapContext](https://docs.taro.zone/docs/apis/media/map/MapContext) 的获取。

```tsx
(callback?: ContextCallback) => SelectorQuery
```

| 参数 | 说明 |
| --- | --- |
| callback | 回调函数，在执行 `SelectorQuery.exec` 方法后，返回节点信息。 |

##### fields

获取节点的相关信息。需要获取的字段在fields中指定。返回值是 `nodesRef` 对应的 `selectorQuery`

**注意**
computedStyle 的优先级高于 size，当同时在 computedStyle 里指定了 width/height 和传入了 size: true，则优先返回 computedStyle 获取到的 width/height。

```tsx
(fields: Fields, callback?: FieldsCallback) => SelectorQuery
```

| 参数 | 说明 |
| --- | --- |
| fields |  |
| callback | 回调函数 |

##### node

获取 Node 节点实例。目前支持 [Canvas](https://docs.taro.zone/docs/components/canvas) 的获取。

```tsx
(callback?: NodeCallback) => SelectorQuery
```

| 参数 | 说明 |
| --- | --- |
| callback | 回调函数，在执行 `SelectorQuery.exec` 方法后，返回节点信息。 |

##### scrollOffset

添加节点的滚动位置查询请求。以像素为单位。节点必须是 `scroll-view` 或者 `viewport`，返回 `NodesRef` 对应的 `SelectorQuery`。

```tsx
(callback?: ScrollOffsetCallback) => SelectorQuery
```

| 参数 | 说明 |
| --- | --- |
| callback | 回调函数，在执行 `SelectorQuery.exec` 方法后，节点信息会在 `callback` 中返回。 |

##### BoundingClientRectCallback

回调函数，在执行 `SelectorQuery.exec` 方法后，节点信息会在 `callback` 中返回。

```tsx
(result: BoundingClientRectCallbackResult | BoundingClientRectCallbackResult[]) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### BoundingClientRectCallbackResult

| 参数 | 说明 |
| --- | --- |
| bottom | 节点的下边界坐标 |
| dataset | 节点的 dataset |
| height | 节点的高度 |
| id | 节点的 ID |
| left | 节点的左边界坐标 |
| right | 节点的右边界坐标 |
| top | 节点的上边界坐标 |
| width | 节点的宽度 |

##### ContextCallback

回调函数，在执行 `SelectorQuery.exec` 方法后，返回节点信息。

```tsx
(result: ContextCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### ContextCallbackResult

| 参数 | 说明 |
| --- | --- |
| context | 节点对应的 Context 对象 |

##### Fields

| 参数 | 说明 |
| --- | --- |
| computedStyle | 指定样式名列表，返回节点对应样式名的当前值 |
| context | 是否返回节点对应的 Context 对象 |
| dataset | 是否返回节点 dataset |
| id | 是否返回节点 id |
| mark | 是否返回节点 mark |
| node | 是否返回节点对应的 Node 实例 |
| properties | 指定属性名列表，返回节点对应属性名的当前属性值（只能获得组件文档中标注的常规属性值，id class style 和事件绑定的属性值不可获取） |
| rect | 是否返回节点布局位置（`left` `right` `top` `bottom`） |
| scrollOffset | 否 是否返回节点的 `scrollLeft` `scrollTop`，节点必须是 `scroll-view` 或者 `viewport` |
| size | 是否返回节点尺寸（`width` `height`） |

##### FieldsCallback

回调函数

```tsx
(res: TaroGeneral.IAnyObject) => void
```

| 参数 | 说明 |
| --- | --- |
| res | 节点的相关信息 |

##### NodeCallback

回调函数，在执行 `SelectorQuery.exec` 方法后，返回节点信息。

```tsx
(result: NodeCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### NodeCallbackResult

回调函数

| 参数 | 说明 |
| --- | --- |
| node | 节点对应的 Node 实例 |

##### ScrollOffsetCallback

回调函数，在执行 `SelectorQuery.exec` 方法后，节点信息会在 `callback` 中返回。

```tsx
(result: ScrollOffsetCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### ScrollOffsetCallbackResult

| 参数 | 说明 |
| --- | --- |
| dataset | 节点的 dataset |
| id | 节点的 ID |
| scrollLeft | 节点的水平滚动位置 |
| scrollTop | 节点的竖直滚动位置 |

### SelectorQuery

查询节点信息的对象

**支持：** 微信、Web

[查看 Taro 文档](https://docs.taro.zone/docs/apis/wxml/SelectorQuery)

##### exec

执行所有的请求。请求结果按请求次序构成数组，在callback的第一个参数中返回。

```tsx
(callback?: (...args: any[]) => any) => NodesRef
```

| 参数 | 说明 |
| --- | --- |
| callback | 回调函数 |

##### in

将选择器的选取范围更改为自定义组件 `component` 内。（初始时，选择器仅选取页面范围的节点，不会选取任何自定义组件中的节点）。

```tsx
(component: TaroGeneral.IAnyObject) => SelectorQuery
```

| 参数 | 说明 |
| --- | --- |
| component | 自定义组件实例 |

##### select

在当前页面下选择第一个匹配选择器 `selector` 的节点。返回一个 `NodesRef` 对象实例，可以用于获取节点信息。

**selector 语法**

selector类似于 CSS 的选择器，但仅支持下列语法。

- ID选择器：#the-id
- class选择器（可以连续指定多个）：.a-class.another-class
- 子元素选择器：.the-parent > .the-child
- 后代选择器：.the-ancestor .the-descendant
- 跨自定义组件的后代选择器：.the-ancestor >>> .the-descendant
- 多选择器的并集：#a-node, .some-other-nodes

```tsx
(selector: string) => NodesRef
```

| 参数 | 说明 |
| --- | --- |
| selector | 选择器 |

##### selectAll

在当前页面下选择匹配选择器 selector 的所有节点。

**selector 语法**

selector类似于 CSS 的选择器，但仅支持下列语法。

- ID选择器：#the-id
- class选择器（可以连续指定多个）：.a-class.another-class
- 子元素选择器：.the-parent > .the-child
- 后代选择器：.the-ancestor .the-descendant
- 跨自定义组件的后代选择器：.the-ancestor >>> .the-descendant
- 多选择器的并集：#a-node, .some-other-nodes

```tsx
(selector: string) => NodesRef
```

| 参数 | 说明 |
| --- | --- |
| selector | 选择器 |

##### selectViewport

选择显示区域。可用于获取显示区域的尺寸、滚动位置等信息。

```tsx
() => NodesRef
```

## 第三方平台

### Taro.getExtConfigSync()

Taro.getExtConfig 的同步版本。

**Tips**
1. 本接口暂时无法通过 Taro.canIUse 判断是否兼容，开发者需要自行判断 Taro.getExtConfigSync 是否存在来兼容

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ext/getExtConfigSync)

#### ExtInfo

| 参数 | 说明 |
| --- | --- |
| extConfig | 第三方平台自定义的数据 |

### Taro.getExtConfig(option)

获取[第三方平台](https://developers.weixin.qq.com/miniprogram/dev/devtools/ext.html)自定义的数据字段。

**Tips**
1. 本接口暂时无法通过 Taro.canIUse 判断是否兼容，开发者需要自行判断 Taro.getExtConfig 是否存在来兼容

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ext/getExtConfig)

#### 参数

| 参数 | 说明 |
| --- | --- |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

#### 成功回调

| 参数 | 说明 |
| --- | --- |
| extConfig | 第三方平台自定义的数据 |
| errMsg | 调用结果 |

## 广告

### Taro.createRewardedVideoAd(option)

创建激励视频广告组件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ad/createRewardedVideoAd)

#### 参数

| 参数 | 说明 |
| --- | --- |
| adUnitId | 小程序广告位 ID |
| multiton | 是否启用多例模式 |

### Taro.createInterstitialAd(option)

创建插屏广告组件。
请通过 getSystemInfoSync 返回对象的 SDKVersion 判断基础库版本号后再使用该 API。每次调用该方法创建插屏广告都会返回一个全新的实例（小程序端的插屏广告实例不允许跨页面使用）。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ad/createInterstitialAd)

#### 参数

| 参数 | 说明 |
| --- | --- |
| adUnitId | 广告单元 id |

### InterstitialAd

插屏广告组件。插屏广告组件是一个原生组件，层级比普通组件高。插屏广告组件每次创建都会返回一个全新的实例（小程序端的插屏广告实例不允许跨页面使用），默认是隐藏的，需要调用 InterstitialAd.show() 将其显示。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ad/InterstitialAd)

##### destroy

销毁插屏广告实例。

```tsx
() => void
```

##### offClose

取消监听插屏广告关闭事件

```tsx
(callback: OnCloseCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offError

取消监听插屏错误事件

```tsx
(callback: OnErrorCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offLoad

取消监听插屏广告加载事件

```tsx
(callback: OnLoadCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onClose

监听插屏广告关闭事件。

```tsx
(callback: OnCloseCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onError

监听插屏错误事件。

```tsx
(callback: OnErrorCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onLoad

监听插屏广告加载事件。

```tsx
(callback: OnLoadCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### load

加载插屏广告。

```tsx
() => Promise<any>
```

##### show

显示插屏广告。

**错误码信息表**

如果插屏广告显示失败，InterstitialAd.show() 方法会返回一个rejected Promise，开发者可以获取到错误码及对应的错误信息。

| 代码 | 异常情况 | 理由 |
| ------ | -------------- | -------------------------- |
| 2001  | 触发频率限制  | 小程序启动一定时间内不允许展示插屏广告 |
| 2002  | 触发频率限制  | 距离小程序插屏广告或者激励视频广告上次播放时间间隔不足，不允许展示插屏广告 |
| 2003  | 触发频率限制  | 当前正在播放激励视频广告或者插屏广告，不允许再次展示插屏广告 |
| 2004  | 广告渲染失败  | 该项错误不是开发者的异常情况，或因小程序页面切换导致广告渲染失败 |
| 2005  | 广告调用异常  | 插屏广告实例不允许跨页面调用 |

```tsx
() => Promise<any>
```

##### OnCloseCallback

插屏广告关闭事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnErrorCallback

插屏错误事件的回调函数

```tsx
(result: OnErrorCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnLoadCallback

插屏广告加载事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

##### OnErrorCallbackResult

| 参数 | 说明 |
| --- | --- |
| errCode | 错误码<br />[参考地址]( /docs/apis/General#aderrcode) |
| errMsg | 错误信息 |

### RewardedVideoAd

激励视频广告组件。激励视频广告组件是一个原生组件，层级比普通组件高。激励视频广告是一个单例（小游戏端是全局单例，小程序端是页面内单例，在小程序端的单例对象不允许跨页面使用），默认是隐藏的，需要调用 RewardedVideoAd.show() 将其显示。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/ad/RewardedVideoAd)

##### load

加载激励视频广告。

```tsx
() => Promise<any>
```

##### show

显示激励视频广告。激励视频广告将从屏幕下方推入。

```tsx
() => Promise<any>
```

##### destroy

销毁激励视频广告实例。

```tsx
() => void
```

##### offClose

取消监听用户点击 `关闭广告` 按钮的事件

```tsx
(callback: OnCloseCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offError

取消监听激励视频错误事件

```tsx
(callback: OnErrorCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### offLoad

取消监听激励视频广告加载事件

```tsx
(callback: OnLoadCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onClose

监听用户点击 `关闭广告` 按钮的事件。

```tsx
(callback: OnCloseCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onError

监听激励视频错误事件。

```tsx
(callback: OnErrorCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### onLoad

监听激励视频广告加载事件。

```tsx
(callback: OnLoadCallback) => void
```

| 参数 | 说明 |
| --- | --- |
| callback |  |

##### OnErrorCallbackResult

| 参数 | 说明 |
| --- | --- |
| errCode | 错误码<br />[参考地址]( /docs/apis/General#aderrcode) |
| errMsg | 错误信息 |

##### OnCloseCallbackResult

| 参数 | 说明 |
| --- | --- |
| isEnded | 视频是否是在用户完整观看的情况下被关闭的 |

##### OnCloseCallback

用户点击 `关闭广告` 按钮的事件的回调函数

```tsx
(result: OnCloseCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnErrorCallback

激励视频错误事件的回调函数

```tsx
(result: OnErrorCallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| result |  |

##### OnLoadCallback

激励视频广告加载事件的回调函数

```tsx
(res: TaroGeneral.CallbackResult) => void
```

| 参数 | 说明 |
| --- | --- |
| res |  |

## Skyline

### DraggableSheetContext

DraggableSheet 实例，可通过 Taro.createSelectorQuery 的 NodesRef.node 方法获取。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/skyline/DraggableSheetContext)

##### scrollTo

滚动到指定位置。size 取值 [0, 1]，size = 1 时表示撑满 draggable-sheet 组件。size 和 pixels 同时传入时，仅 size 生效。

```tsx
(option: Option) => void
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| size | 相对目标位置 |
| pixels | 绝对目标位置 |
| animated | 是否启用滚动动画 |
| duration | 滚动动画时长（ms) |
| easingFunction | 缓动函数 |

### Snapshot

Snapshot 实例，可通过 SelectorQuery 获取。

Snapshot 通过 id 跟一个 snapshot 组件绑定，操作对应的 snapshot 组件。

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/skyline/Snapshot)

#### 方法

| 参数 | 说明 |
| --- | --- |
| width | 画布宽度 |
| height | 画布高度 |

##### takeSnapshot

对 snapshot 组件子树进行截图

```tsx
(option: Option) => Promise<TaroGeneral.CallbackResult>
```

| 参数 | 说明 |
| --- | --- |
| option |  |

###### 参数

| 参数 | 说明 |
| --- | --- |
| type | 截图导出类型，'file' 保存到临时文件目录或 'arraybuffer' 返回图片二进制数据，默认值为 'file' |
| format | 截图文件格式，'rgba' 或 'png'，默认值为 'png' |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

###### 成功回调

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 截图保存的临时文件路径，当 type 为 file 该字段生效 |
| data | 截图对应的二进制数据，当 type 为 arraybuffer 该字段生效 |

## 云开发

### cloud

云开发 SDK 实例

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/cloud/cloud)

#### 方法

| 参数 | 说明 |
| --- | --- |
| Cloud | 声明新的云开发操作实例<br />example: 声明新的操作实例<br />```tsx<br />const c1 = new Taro.cloud.Cloud({<br />  resourceEnv: '我的某个环境ID',<br />})<br />```<br />example: 资源共享时跨账号访问资源<br />```tsx<br />// 声明<br />const c1 = new Taro.cloud.Cloud({<br />  resourceAppid: '资源方 AppID',<br />  resourceEnv: '我的某个环境ID',<br />})<br />// 等待初始化完成<br />await c1.init()<br />// 然后照常访问指定环境下的资源<br />c1.callFunction({<br /> name: '',<br /> data: {},<br />})<br />```<br />[参考地址](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-sdk-api/utils/Cloud.Cloud.html) |

##### init

在调用云开发各 API 前，需先调用初始化方法 init 一次（全局只需一次，多次调用时只有第一次生效）

```tsx
(config?: IInitConfig) => void
```

| 参数 | 说明 |
| --- | --- |
| config |  |

##### CloudID

声明字符串为 CloudID（开放数据 ID），该接口传入一个字符串，返回一个 CloudID 特殊对象，将该对象传至云函数可以获取其对应的开放数据。

```tsx
(cloudID: string) => void
```

| 参数 | 说明 |
| --- | --- |
| cloudID |  |

##### callFunction

调用云函数

```tsx
{ (param: OQ<CallFunctionParam>): void; (param: RQ<CallFunctionParam>): Promise<CallFunctionResult>; }
```

| 参数 | 说明 |
| --- | --- |
| param |  |

##### uploadFile

将本地资源上传至云存储空间，如果上传至同一路径则是覆盖写

```tsx
{ (param: OQ<UploadFileParam>): Taro.UploadTask; (param: RQ<UploadFileParam>): Promise<UploadFileResult>; }
```

| 参数 | 说明 |
| --- | --- |
| param |  |

##### downloadFile

从云存储空间下载文件

```tsx
{ (param: OQ<DownloadFileParam>): DownloadTask; (param: RQ<DownloadFileParam>): Promise<DownloadFileResult>; }
```

| 参数 | 说明 |
| --- | --- |
| param |  |

##### getTempFileURL

用云文件 ID 换取真实链接，公有读的文件获取的链接不会过期，私有的文件获取的链接十分钟有效期。一次最多取 50 个。

```tsx
{ (param: OQ<GetTempFileURLParam>): void; (param: RQ<GetTempFileURLParam>): Promise<GetTempFileURLResult>; }
```

| 参数 | 说明 |
| --- | --- |
| param |  |

##### deleteFile

从云存储空间删除文件，一次最多 50 个

```tsx
{ (param: OQ<DeleteFileParam>): void; (param: RQ<DeleteFileParam>): Promise<DeleteFileResult>; }
```

| 参数 | 说明 |
| --- | --- |
| param |  |

##### database

获取数据库实例

```tsx
(config?: IConfig) => Database
```

| 参数 | 说明 |
| --- | --- |
| config |  |

##### callContainer

调用云托管服务

```tsx
<R = any, P = any>(params: CallContainerParam<P>) => Promise<CallContainerResult<R>>
```

| 参数 | 说明 |
| --- | --- |
| params |  |

##### CallFunctionResult

云函数通用返回

| 参数 | 说明 |
| --- | --- |
| result | 云函数返回的结果 |
| errMsg | 调用结果 |

##### IApiParam

云函数通用参数

| 参数 | 说明 |
| --- | --- |
| config | 配置 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

##### IInitConfig

初始化配置

| 参数 | 说明 |
| --- | --- |
| env | 默认环境配置，传入字符串形式的环境 ID 可以指定所有服务的默认环境，传入对象可以分别指定各个服务的默认环境 |
| traceUser | 是否在将用户访问记录到用户管理中，在控制台中可见 |

##### IConfig

配置

| 参数 | 说明 |
| --- | --- |
| env | 使用的环境 ID，填写后忽略 init 指定的环境 |
| traceUser | 是否在将用户访问记录到用户管理中，在控制台中可见 |

##### ICloudAPIParam

云函数 API 通用参数

| 参数 | 说明 |
| --- | --- |
| config | 配置 |

##### CallFunctionParam

调用云函数参数

| 参数 | 说明 |
| --- | --- |
| name | 云函数名 |
| data | 传递给云函数的参数，在云函数中可通过 event 参数获取 |
| slow |  |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### UploadFileResult

上传文件结果

| 参数 | 说明 |
| --- | --- |
| fileID | 文件 ID |
| statusCode | 服务器返回的 HTTP 状态码 |
| errMsg | 调用结果 |

##### UploadFileParam

上传文件参数

| 参数 | 说明 |
| --- | --- |
| cloudPath | 云存储路径，命名限制见[文件名命名限制](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-sdk-api/guide/storage/naming.html) |
| filePath | 要上传文件资源的路径 |
| header |  |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### DownloadFileResult

下载文件结果

| 参数 | 说明 |
| --- | --- |
| tempFilePath | 临时文件路径 |
| statusCode | 服务器返回的 HTTP 状态码 |
| errMsg | 调用结果 |

##### DownloadFileParam

下载文件参数

| 参数 | 说明 |
| --- | --- |
| fileID | 云文件 ID |
| cloudPath |  |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### GetTempFileURLResult

获取临时文件结果

| 参数 | 说明 |
| --- | --- |
| fileList | 文件列表 |
| errMsg | 调用结果 |

##### GetTempFileURLResultItem

临时文件列表

| 参数 | 说明 |
| --- | --- |
| fileID | 云文件 ID |
| tempFileURL | 临时文件路径 |
| maxAge |  |
| status | 状态码 |
| errMsg | 调用结果 |

##### GetTempFileURLParam

获取临时文件参数

| 参数 | 说明 |
| --- | --- |
| fileList |  |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### DeleteFileResult

删除文件结果

| 参数 | 说明 |
| --- | --- |
| fileList | 文件列表 |
| errMsg | 调用结果 |

##### DeleteFileResultItem

删除文件列表

| 参数 | 说明 |
| --- | --- |
| fileID | 云文件 ID |
| status | 状态码 |
| errMsg | 调用结果 |

##### DeleteFileParam

删除文件参数

| 参数 | 说明 |
| --- | --- |
| fileList | 文件列表 |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### IOptions

新建云开发操作实例

| 参数 | 说明 |
| --- | --- |
| resourceAppid | 资源方 AppID, 不填则表示已登录的当前账号（如小程序中） |
| resourceEnv | 资源方云环境 ID |

##### CallContainerParam

调用云托管参数

| 参数 | 说明 |
| --- | --- |
| path | 服务路径 |
| method | HTTP请求方法，默认 GET |
| data | 请求数据 |
| header | 设置请求的 header，header 中不能设置 Referer。content-type 默认为 application/json |
| timeout | 超时时间，单位为毫秒 |
| dataType | 返回的数据格式 |
| responseType | 响应的数据类型 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### CallContainerResult

调用云托管返回值

| 参数 | 说明 |
| --- | --- |
| data | 开发者云托管服务返回的数据 |
| header | 开发者云托管返回的 HTTP Response Header |
| statusCode | 开发者云托管服务返回的 HTTP 状态码 |
| cookies | 开发者云托管返回的 cookies，格式为字符串数组，仅小程序端有此字段 |

### DB

**支持：** 微信

[查看 Taro 文档](https://docs.taro.zone/docs/apis/cloud/DB)

#### Database

云开发 SDK 数据库实例

| 参数 | 说明 |
| --- | --- |
| config | 数据库配置 |
| command | 数据库操作符，通过 db.command 获取<br />[参考地址](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-sdk-api/database/Command.html) |
| Geo | 数据库地理位置结构集<br />[参考地址](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-sdk-api/database/Geo.html) |

##### serverDate

构造一个服务端时间的引用。可用于查询条件、更新字段值或新增记录时的字段值。

```tsx
(options?: IOptions) => ServerDate
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### RegExp

构造正则表达式，仅需在普通 js 正则表达式无法满足的情况下使用

```tsx
(options: IRegExpOptions) => IRegExp
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### collection

获取集合的引用。方法接受一个 `name` 参数，指定需引用的集合名称。

```tsx
(collectionName: string) => Collection
```

| 参数 | 说明 |
| --- | --- |
| collectionName |  |

##### ServerDate

可用于查询条件、更新字段值或新增记录时的字段值。

| 参数 | 说明 |
| --- | --- |
| options |  |

###### IOptions

| 参数 | 说明 |
| --- | --- |
| offset |  |

##### IRegExp

构造正则表达式

| 参数 | 说明 |
| --- | --- |
| regexp |  |
| options |  |

###### IRegExpOptions

| 参数 | 说明 |
| --- | --- |
| regexp |  |
| options |  |

##### InternalSymbol

内部符号

#### Collection

数据库集合引用

| 参数 | 说明 |
| --- | --- |
| collectionName | 集合名称 |
| database | 集合所在数据库引用 |

##### doc

获取集合中指定记录的引用。方法接受一个 `id` 参数，指定需引用的记录的 `_id`。

```tsx
(docId: string | number) => Document
```

| 参数 | 说明 |
| --- | --- |
| docId | 记录 _id |

##### aggregate

发起聚合操作，定义完聚合流水线阶段之后需调用 end 方法标志结束定义并实际发起聚合操作

```tsx
() => Aggregate
```

##### where

指定查询条件，返回带新查询条件的新的集合引用

```tsx
(condition: IQueryCondition) => Collection
```

| 参数 | 说明 |
| --- | --- |
| condition |  |

##### limit

指定查询结果集数量上限

```tsx
(value: number) => Collection
```

| 参数 | 说明 |
| --- | --- |
| value |  |

##### orderBy

指定查询排序条件

```tsx
(fieldPath: string, string: "asc" | "desc") => Collection
```

| 参数 | 说明 |
| --- | --- |
| fieldPath |  |
| string |  |

##### skip

指定查询返回结果时从指定序列后的结果开始返回，常用于分页

```tsx
(offset: number) => Collection
```

| 参数 | 说明 |
| --- | --- |
| offset |  |

##### field

指定返回结果中记录需返回的字段

**说明**

方法接受一个必填对象用于指定需返回的字段，对象的各个 key 表示要返回或不要返回的字段，value 传入 true|false（或 1|-1）表示要返回还是不要返回。
如果指定的字段是数组字段，还可以用以下方法只返回数组的第一个元素：在该字段 key 后面拼接上 `.$` 成为 `字段.$` 的形式。
如果指定的字段是数组字段，还可以用 `db.command.project.slice` 方法返回数组的子数组：
方法既可以接收一个正数表示返回前 n 个元素，也可以接收一个负数表示返回后 n 个元素；还可以接收一个包含两个数字 `[ skip, limit ]` 的数组，如果 `skip` 是正数，表示跳过 `skip` 个元素后再返回接下来的 `limit` 个元素，如果 `skip` 是负数，表示从倒数第 `skip` 个元素开始，返回往后数的 `limit` 个元素

- 返回数组的前 5 个元素：`{ tags: db.command.project.slice(5) }`
- 返回数组的后 5 个元素：`{ tags: db.command.project.slice(-5) }`
- 跳过前 5 个元素，返回接下来 10 个元素：`{ tags: db.command.project.slice(5, 10) }`
- 从倒数第 5 个元素开始，返回接下来正方向数的 10 个元素：`{ tags: db.command.project.slice(-5, 10) }`

```tsx
(object: TaroGeneral.IAnyObject) => Collection
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### get

获取集合数据，或获取根据查询条件筛选后的集合数据。

**使用说明**

统计集合记录数或统计查询语句对应的结果记录数

小程序端与云函数端的表现会有如下差异：

- 小程序端：如果没有指定 limit，则默认且最多取 20 条记录。
- 云函数端：如果没有指定 limit，则默认且最多取 100 条记录。

如果没有指定 skip，则默认从第 0 条记录开始取，skip 常用于分页。

如果需要取集合中所有的数据，仅在数据量不大且在云函数中时

```tsx
() => Promise<IQueryResult>
```

##### count

统计匹配查询条件的记录的条数

```tsx
() => Promise<ICountResult>
```

##### add

新增记录，如果传入的记录对象没有 _id 字段，则由后台自动生成 _id；若指定了 _id，则不能与已有记录冲突

```tsx
{ (options: OQ<IAddDocumentOptions>): void; (options: RQ<IAddDocumentOptions>): Promise<IAddResult>; }
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### watch

监听集合中符合查询条件的数据的更新事件。注意使用 watch 时，只有 where 语句会生效，orderBy、limit 等不生效。

```tsx
(options: IWatchDocumentOptions) => IWatcher
```

| 参数 | 说明 |
| --- | --- |
| options |  |

#### Document

数据库记录引用

##### get

获取记录数据，或获取根据查询条件筛选后的记录数据

```tsx
{ (options: OQ<IDBAPIParam>): void; (options: RQ<IDBAPIParam>): Promise<IQuerySingleResult>; }
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### set

替换更新一条记

```tsx
{ (options: OQ<ISetSingleDocumentOptions>): void; (options: RQ<ISetSingleDocumentOptions>): Promise<ISetResult>; }
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### update

更新一条记录

```tsx
{ (options: OQ<IUpdateSingleDocumentOptions>): void; (options: RQ<IUpdateSingleDocumentOptions>): Promise<...>; }
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### remove

删除一条记录

```tsx
{ (options: OQ<IDBAPIParam>): void; (options: RQ<IDBAPIParam>): Promise<IRemoveResult>; }
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### DocumentId

记录 ID

##### IDocumentData

记录结构

| 参数 | 说明 |
| --- | --- |
| _id | 新增的记录 _id |
| __index |  |

##### IDBAPIParam

数据库 API 通用参数

| 参数 | 说明 |
| --- | --- |
| config | 配置 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

##### IAddDocumentOptions

新增记录的定义

| 参数 | 说明 |
| --- | --- |
| data | 新增记录的定义 |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### IWatchDocumentOptions

监听集合中符合查询条件的数据的更新事件

| 参数 | 说明 |
| --- | --- |
| onChange | 成功回调，回调传入的参数 snapshot 是变更快照 |
| onError | 失败回调 |

##### ISnapshot

变更快照

| 参数 | 说明 |
| --- | --- |
| docChanges | 更新事件数组 |
| docs | 数据快照，表示此更新事件发生后查询语句对应的查询结果 |
| type | 快照类型，仅在第一次初始化数据时有值为 init |
| id | 变更事件 id |

##### ChangeEvent

更新事件

| 参数 | 说明 |
| --- | --- |
| id | 更新事件 id |
| queueType | 列表更新类型，表示更新事件对监听列表的影响，枚举值 |
| dataType | 数据更新类型，表示记录的具体更新类型，枚举值 |
| docId | 更新的记录 id |
| doc | 更新的完整记录 |
| updatedFields | 所有更新的字段及字段更新后的值，`key` 为更新的字段路径，`value` 为字段更新后的值，仅在 `update` 操作时有此信息 |
| removedFields | 所有被删除的字段，仅在 `update` 操作时有此信息 |

##### QueueType

列表更新类型，表示更新事件对监听列表的影响，枚举值

| 参数 | 说明 |
| --- | --- |
| init | 初始化列表 |
| update | 列表中的记录内容有更新，但列表包含的记录不变 |
| enqueue | 记录进入列表 |
| dequeue | 记录离开列表 |

##### DataType

数据更新类型，表示记录的具体更新类型，枚举值

| 参数 | 说明 |
| --- | --- |
| init | 初始化列表 |
| update | 记录内容更新，对应 `update` 操作 |
| replace | 记录内容被替换，对应 `set` 操作 |
| add | 记录新增，对应 `add` 操作 |
| remove | 记录被删除，对应 `remove` 操作 |

###### close

关闭监听，无需参数，返回 Promise，会在关闭完成时 resolve

```tsx
() => Promise<any>
```

##### IGetDocumentOptions

获取记录参数

| 参数 | 说明 |
| --- | --- |
| config | 配置 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

##### ICountDocumentOptions

获取记录条数参数

| 参数 | 说明 |
| --- | --- |
| config | 配置 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

##### IUpdateDocumentOptions

更新记录参数

| 参数 | 说明 |
| --- | --- |
| data |  |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### IUpdateSingleDocumentOptions

更新单条记录参数

| 参数 | 说明 |
| --- | --- |
| data | 替换记录的定义 |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ISetDocumentOptions

替换记录参数

| 参数 | 说明 |
| --- | --- |
| data | 替换记录的定义 |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### ISetSingleDocumentOptions

替换一条记录参数

| 参数 | 说明 |
| --- | --- |
| data |  |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### IRemoveDocumentOptions

删除记录参数

| 参数 | 说明 |
| --- | --- |
| query |  |
| config | 配置 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |
| fail | 接口调用失败的回调函数 |
| success | 接口调用成功的回调函数 |

##### IRemoveSingleDocumentOptions

删除一条记录参数

| 参数 | 说明 |
| --- | --- |
| config | 配置 |
| success | 接口调用成功的回调函数 |
| fail | 接口调用失败的回调函数 |
| complete | 接口调用结束的回调函数（调用成功、失败都会执行） |

##### IUpdateCondition

更新记录定义

| 参数 | 说明 |
| --- | --- |
| __index |  |

#### Query

数据库 Query 引用

##### where

指定查询条件，返回带新查询条件的新的集合引用

```tsx
(condition: IQueryCondition) => Query
```

| 参数 | 说明 |
| --- | --- |
| condition |  |

##### orderBy

指定查询排序条件

```tsx
(fieldPath: string, order: string) => Query
```

| 参数 | 说明 |
| --- | --- |
| fieldPath |  |
| order |  |

##### limit

指定查询结果集数量上限

```tsx
(max: number) => Query
```

| 参数 | 说明 |
| --- | --- |
| max |  |

##### skip

指定查询返回结果时从指定序列后的结果开始返回，常用于分页

```tsx
(offset: number) => Query
```

| 参数 | 说明 |
| --- | --- |
| offset |  |

##### field

指定返回结果中记录需返回的字段

**说明**

方法接受一个必填对象用于指定需返回的字段，对象的各个 key 表示要返回或不要返回的字段，value 传入 true|false（或 1|-1）表示要返回还是不要返回。
如果指定的字段是数组字段，还可以用以下方法只返回数组的第一个元素：在该字段 key 后面拼接上 `.$` 成为 `字段.$` 的形式。
如果指定的字段是数组字段，还可以用 `db.command.project.slice` 方法返回数组的子数组：
方法既可以接收一个正数表示返回前 n 个元素，也可以接收一个负数表示返回后 n 个元素；还可以接收一个包含两个数字 `[ skip, limit ]` 的数组，如果 `skip` 是正数，表示跳过 `skip` 个元素后再返回接下来的 `limit` 个元素，如果 `skip` 是负数，表示从倒数第 `skip` 个元素开始，返回往后数的 `limit` 个元素

- 返回数组的前 5 个元素：`{ tags: db.command.project.slice(5) }`
- 返回数组的后 5 个元素：`{ tags: db.command.project.slice(-5) }`
- 跳过前 5 个元素，返回接下来 10 个元素：`{ tags: db.command.project.slice(5, 10) }`
- 从倒数第 5 个元素开始，返回接下来正方向数的 10 个元素：`{ tags: db.command.project.slice(-5, 10) }`

```tsx
(object: TaroGeneral.IAnyObject) => Query
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### get

获取集合数据，或获取根据查询条件筛选后的集合数据。

**使用说明**

统计集合记录数或统计查询语句对应的结果记录数

小程序端与云函数端的表现会有如下差异：

- 小程序端：如果没有指定 limit，则默认且最多取 20 条记录。
- 云函数端：如果没有指定 limit，则默认且最多取 100 条记录。

如果没有指定 skip，则默认从第 0 条记录开始取，skip 常用于分页。

如果需要取集合中所有的数据，仅在数据量不大且在云函数中时

```tsx
{ (options: OQ<IDBAPIParam>): void; (options: RQ<IDBAPIParam>): Promise<IQueryResult>; }
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### count

统计匹配查询条件的记录的条数

```tsx
{ (options: OQ<IDBAPIParam>): void; (options: RQ<IDBAPIParam>): Promise<ICountResult>; }
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### IQueryCondition

| 参数 | 说明 |
| --- | --- |
| __index |  |

##### IQueryResult

| 参数 | 说明 |
| --- | --- |
| data | 查询的结果数组，数据的每个元素是一个 Object，代表一条记录 |
| errMsg | 调用结果 |

##### IQuerySingleResult

| 参数 | 说明 |
| --- | --- |
| data |  |
| errMsg | 调用结果 |

##### IAddResult

| 参数 | 说明 |
| --- | --- |
| _id |  |
| errMsg | 调用结果 |

##### IUpdateResult

| 参数 | 说明 |
| --- | --- |
| stats |  |
| errMsg | 调用结果 |

##### ISetResult

| 参数 | 说明 |
| --- | --- |
| _id |  |
| stats |  |
| errMsg | 调用结果 |

##### IRemoveResult

| 参数 | 说明 |
| --- | --- |
| stats |  |
| errMsg | 调用结果 |

##### ICountResult

| 参数 | 说明 |
| --- | --- |
| total | 结果数量 |
| errMsg | 调用结果 |

#### Command

数据库操作符，通过 db.command 获取

##### eq

查询筛选条件，表示字段等于某个值。eq 指令接受一个字面量 (literal)，可以是 number, boolean, string, object, array, Date。

```tsx
(val: any) => DatabaseQueryCommand
```

##### neq

查询筛选条件，表示字段不等于某个值。eq 指令接受一个字面量 (literal)，可以是 number, boolean, string, object, array, Date。

```tsx
(val: any) => DatabaseQueryCommand
```

##### gt

查询筛选操作符，表示需大于指定值。可以传入 Date 对象用于进行日期比较。

```tsx
(val: any) => DatabaseQueryCommand
```

##### gte

查询筛选操作符，表示需大于或等于指定值。可以传入 Date 对象用于进行日期比较。

```tsx
(val: any) => DatabaseQueryCommand
```

##### lt

查询筛选操作符，表示需小于指定值。可以传入 Date 对象用于进行日期比较。

```tsx
(val: any) => DatabaseQueryCommand
```

##### lte

查询筛选操作符，表示需小于或等于指定值。可以传入 Date 对象用于进行日期比较。

```tsx
(val: any) => DatabaseQueryCommand
```

##### in

查询筛选操作符，表示要求值在给定的数组内。

```tsx
(val: any[]) => DatabaseQueryCommand
```

| 参数 | 说明 |
| --- | --- |
| val |  |

##### nin

查询筛选操作符，表示要求值不在给定的数组内。

```tsx
(val: any[]) => DatabaseQueryCommand
```

| 参数 | 说明 |
| --- | --- |
| val |  |

##### geoNear

按从近到远的顺序，找出字段值在给定点的附近的记录。

```tsx
(options: NearCommandOptions) => DatabaseQueryCommand
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### geoWithin

找出字段值在指定区域内的记录，无排序。指定的区域必须是多边形（Polygon）或多边形集合（MultiPolygon）。

```tsx
(options: WithinCommandOptions) => DatabaseQueryCommand
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### geoIntersects

找出给定的地理位置图形相交的记录

```tsx
(options: IntersectsCommandOptions) => DatabaseQueryCommand
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### and

查询操作符，用于表示逻辑 "与" 的关系，表示需同时满足多个查询筛选条件

```tsx
(...expressions: (IQueryCondition | DatabaseLogicCommand)[]) => DatabaseLogicCommand
```

| 参数 | 说明 |
| --- | --- |
| expressions |  |

##### or

查询操作符，用于表示逻辑 "或" 的关系，表示需同时满足多个查询筛选条件。或指令有两种用法，一是可以进行字段值的 “或” 操作，二是也可以进行跨字段的 “或” 操作。

```tsx
(...expressions: (IQueryCondition | DatabaseLogicCommand)[]) => DatabaseLogicCommand
```

| 参数 | 说明 |
| --- | --- |
| expressions |  |

##### set

查询操作符，用于表示逻辑 "与" 的关系，表示需同时满足多个查询筛选条件

```tsx
(val: any) => DatabaseUpdateCommand
```

##### remove

更新操作符，用于表示删除某个字段。

```tsx
() => DatabaseUpdateCommand
```

##### inc

更新操作符，原子操作，用于指示字段自增

```tsx
(val: number) => DatabaseUpdateCommand
```

| 参数 | 说明 |
| --- | --- |
| val |  |

##### mul

更新操作符，原子操作，用于指示字段自乘某个值

```tsx
(val: number) => DatabaseUpdateCommand
```

| 参数 | 说明 |
| --- | --- |
| val |  |

##### push

数组更新操作符。对一个值为数组的字段，往数组添加一个或多个值。或字段原为空，则创建该字段并设数组为传入值。

```tsx
(...values: any[]) => DatabaseUpdateCommand
```

| 参数 | 说明 |
| --- | --- |
| values |  |

##### pop

数组更新操作符，对一个值为数组的字段，将数组尾部元素删除

```tsx
() => DatabaseUpdateCommand
```

##### shift

数组更新操作符，对一个值为数组的字段，将数组头部元素删除。

```tsx
() => DatabaseUpdateCommand
```

##### unshift

数组更新操作符，对一个值为数组的字段，往数组头部添加一个或多个值。或字段原为空，则创建该字段并设数组为传入值。

```tsx
(...values: any[]) => DatabaseUpdateCommand
```

| 参数 | 说明 |
| --- | --- |
| values |  |

##### DatabaseLogicCommand

数据库逻辑操作符

| 参数 | 说明 |
| --- | --- |
| fieldName | 作用域名称 |
| operator | 操作符 |
| operands | 操作数 |
| _setFieldName | 设置作用域名称 |

###### and

查询操作符，用于表示逻辑 "与" 的关系，表示需同时满足多个查询筛选条件

```tsx
(...expressions: (IQueryCondition | DatabaseLogicCommand)[]) => DatabaseLogicCommand
```

| 参数 | 说明 |
| --- | --- |
| expressions |  |

###### or

查询操作符，用于表示逻辑 "或" 的关系，表示需同时满足多个查询筛选条件。或指令有两种用法，一是可以进行字段值的 “或” 操作，二是也可以进行跨字段的 “或” 操作。

```tsx
(...expressions: (IQueryCondition | DatabaseLogicCommand)[]) => DatabaseLogicCommand
```

| 参数 | 说明 |
| --- | --- |
| expressions |  |

##### DatabaseQueryCommand

数据库查询操作符

| 参数 | 说明 |
| --- | --- |
| operator | 操作符 |
| _setFieldName | 设置作用域名称 |

###### eq

查询筛选条件，表示字段等于某个值。eq 指令接受一个字面量 (literal)，可以是 number, boolean, string, object, array, Date。

```tsx
(val: any) => DatabaseLogicCommand
```

###### neq

查询筛选条件，表示字段不等于某个值。eq 指令接受一个字面量 (literal)，可以是 number, boolean, string, object, array, Date。

```tsx
(val: any) => DatabaseLogicCommand
```

###### gt

查询筛选操作符，表示需大于指定值。可以传入 Date 对象用于进行日期比较。

```tsx
(val: any) => DatabaseLogicCommand
```

###### gte

查询筛选操作符，表示需大于或等于指定值。可以传入 Date 对象用于进行日期比较。

```tsx
(val: any) => DatabaseLogicCommand
```

###### lt

查询筛选操作符，表示需小于指定值。可以传入 Date 对象用于进行日期比较。

```tsx
(val: any) => DatabaseLogicCommand
```

###### lte

查询筛选操作符，表示需小于或等于指定值。可以传入 Date 对象用于进行日期比较。

```tsx
(val: any) => DatabaseLogicCommand
```

###### in

查询筛选操作符，表示要求值在给定的数组内。

```tsx
(val: any[]) => DatabaseLogicCommand
```

| 参数 | 说明 |
| --- | --- |
| val |  |

###### nin

查询筛选操作符，表示要求值不在给定的数组内。

```tsx
(val: any[]) => DatabaseLogicCommand
```

| 参数 | 说明 |
| --- | --- |
| val |  |

###### geoNear

按从近到远的顺序，找出字段值在给定点的附近的记录。

```tsx
(options: NearCommandOptions) => DatabaseLogicCommand
```

| 参数 | 说明 |
| --- | --- |
| options |  |

###### geoWithin

找出字段值在指定区域内的记录，无排序。指定的区域必须是多边形（Polygon）或多边形集合（MultiPolygon）。

```tsx
(options: WithinCommandOptions) => DatabaseLogicCommand
```

| 参数 | 说明 |
| --- | --- |
| options |  |

###### geoIntersects

找出给定的地理位置图形相交的记录

```tsx
(options: IntersectsCommandOptions) => DatabaseLogicCommand
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### DatabaseUpdateCommand

数据库更新操作符

| 参数 | 说明 |
| --- | --- |
| fieldName | 作用域名称 |
| operator | 操作符 |
| operands | 操作数 |
| _setFieldName | 设置作用域名称 |

##### LOGIC_COMMANDS_LITERAL

逻辑命令字面量

| 参数 | 说明 |
| --- | --- |
| and | 与 |
| or | 或 |
| not | 非 |
| nor | 都不 |

##### QUERY_COMMANDS_LITERAL

查询命令字面量

| 参数 | 说明 |
| --- | --- |
| eq | 等于 |
| neq | 不等于 |
| gt | 大于 |
| gte | 大于等于 |
| lt | 小于 |
| lte | 小于等于 |
| in | 范围内 |
| nin | 范围外 |
| geoNear | 附近排序 |
| geoWithin | 指定区域内 |
| geoIntersects | 相交区域 |

##### UPDATE_COMMANDS_LITERAL

更新命令字面量

| 参数 | 说明 |
| --- | --- |
| set | 等于 |
| remove | 删除 |
| inc | 自增 |
| mul | 自乘 |
| push | 尾部添加 |
| pop | 尾部删除 |
| shift | 头部删除 |
| unshift | 头部添加 |

##### NearCommandOptions

按从近到远的顺序，找出字段值在给定点的附近的记录参数

| 参数 | 说明 |
| --- | --- |
| geometry | 地理位置点 (Point) |
| maxDistance | 最大距离，单位为米 |
| minDistance | 最小距离，单位为米 |

##### WithinCommandOptions

找出字段值在指定区域内的记录，无排序参数

| 参数 | 说明 |
| --- | --- |
| geometry | 地理信息结构，Polygon，MultiPolygon，或 { centerSphere } |

##### IntersectsCommandOptions

找出给定的地理位置图形相交的记录

| 参数 | 说明 |
| --- | --- |
| geometry | 地理信息结构 |

#### Aggregate

数据库集合的聚合操作实例

##### addFields

聚合阶段。添加新字段到输出的记录。经过 addFields 聚合阶段，输出的所有记录中除了输入时带有的字段外，还将带有 addFields 指定的字段。

```tsx
(object: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### bucket

聚合阶段。将输入记录根据给定的条件和边界划分成不同的组，每组即一个 bucket。

```tsx
(object: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### bucketAuto

聚合阶段。将输入记录根据给定的条件划分成不同的组，每组即一个 bucket。与 bucket 的其中一个不同之处在于无需指定 boundaries，bucketAuto 会自动尝试将记录尽可能平均的分散到每组中。

```tsx
(object: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### count

聚合阶段。计算上一聚合阶段输入到本阶段的记录数，输出一个记录，其中指定字段的值为记录数。

```tsx
(fieldName: string) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| fieldName |  |

##### end

标志聚合操作定义完成，发起实际聚合操作

```tsx
() => Promise<Object>
```

##### geoNear

聚合阶段。将记录按照离给定点从近到远输出。

```tsx
(options: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| options |  |

##### group

聚合阶段。将输入记录按给定表达式分组，输出时每个记录代表一个分组，每个记录的 _id 是区分不同组的 key。输出记录中也可以包括累计值，将输出字段设为累计值即会从该分组中计算累计值。

```tsx
(object: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### limit

聚合阶段。限制输出到下一阶段的记录数。

```tsx
(value: number) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| value |  |

##### lookup

聚合阶段。聚合阶段。联表查询。与同个数据库下的一个指定的集合做 left outer join(左外连接)。对该阶段的每一个输入记录，lookup 会在该记录中增加一个数组字段，该数组是被联表中满足匹配条件的记录列表。lookup 会将连接后的结果输出给下个阶段。

```tsx
(object: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### match

聚合阶段。根据条件过滤文档，并且把符合条件的文档传递给下一个流水线阶段。

```tsx
(object: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### project

聚合阶段。把指定的字段传递给下一个流水线，指定的字段可以是某个已经存在的字段，也可以是计算出来的新字段。

```tsx
(object: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### replaceRoot

聚合阶段。指定一个已有字段作为输出的根节点，也可以指定一个计算出的新字段作为根节点。

```tsx
(object: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### sample

聚合阶段。随机从文档中选取指定数量的记录。

```tsx
(size: number) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| size |  |

##### skip

聚合阶段。指定一个正整数，跳过对应数量的文档，输出剩下的文档。

```tsx
(value: number) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| value |  |

##### sort

聚合阶段。根据指定的字段，对输入的文档进行排序。

```tsx
(object: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### sortByCount

聚合阶段。根据传入的表达式，将传入的集合进行分组（group）。然后计算不同组的数量，并且将这些组按照它们的数量进行排序，返回排序后的结果。

```tsx
(object: Object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| object |  |

##### unwind

聚合阶段。使用指定的数组字段中的每个元素，对文档进行拆分。拆分后，文档会从一个变为一个或多个，分别对应数组的每个元素。

```tsx
(value: string | object) => Aggregate
```

| 参数 | 说明 |
| --- | --- |
| value |  |

#### IGeo

数据库地理位置结构集

##### Point

构造一个地理位置 ”点“。方法接受两个必填参数，第一个是经度（longitude），第二个是纬度（latitude），务必注意顺序。

如存储地理位置信息的字段有被查询的需求，务必对字段建立地理位置索引

```tsx
(longitude: number, latitide: number) => GeoPoint
```

| 参数 | 说明 |
| --- | --- |
| longitude |  |
| latitide |  |

##### LineString

构造一个地理位置的 ”线“。一个线由两个或更多的点有序连接组成。

如存储地理位置信息的字段有被查询的需求，务必对字段建立地理位置索引

```tsx
(points: JSONMultiPoint | GeoPoint[]) => GeoMultiPoint
```

| 参数 | 说明 |
| --- | --- |
| points |  |

##### Polygon

构造一个地理位置 ”多边形“

如存储地理位置信息的字段有被查询的需求，务必对字段建立地理位置索引

**说明**

一个多边形由一个或多个线性环（Linear Ring）组成，一个线性环即一个闭合的线段。一个闭合线段至少由四个点组成，其中最后一个点和第一个点的坐标必须相同，以此表示环的起点和终点。如果一个多边形由多个线性环组成，则第一个线性环表示外环（外边界），接下来的所有线性环表示内环（即外环中的洞，不计在此多边形中的区域）。如果一个多边形只有一个线性环组成，则这个环就是外环。

多边形构造规则：

1. 第一个线性环必须是外环
2. 外环不能自交
3. 所有内环必须完全在外环内
4. 各个内环间不能相交或重叠，也不能有共同的边
5. 外环应为逆时针，内环应为顺时针

```tsx
(lineStrings: JSONPolygon | GeoLineString[]) => GeoPolygon
```

| 参数 | 说明 |
| --- | --- |
| lineStrings |  |

##### MultiPoint

构造一个地理位置的 ”点“ 的集合。一个点集合由一个或更多的点组成。

如存储地理位置信息的字段有被查询的需求，务必对字段建立地理位置索引

```tsx
(polygons: JSONMultiPolygon | GeoPolygon[]) => GeoMultiPolygon
```

| 参数 | 说明 |
| --- | --- |
| polygons |  |

##### MultiLineString

构造一个地理位置 ”线“ 集合。一个线集合由多条线组成。

如存储地理位置信息的字段有被查询的需求，务必对字段建立地理位置索引

```tsx
(lineStrings: JSONMultiLineString | GeoLineString[]) => GeoMultiLineString
```

| 参数 | 说明 |
| --- | --- |
| lineStrings |  |

##### MultiPolygon

构造一个地理位置 ”多边形“ 集合。一个多边形集合由多个多边形组成。

如存储地理位置信息的字段有被查询的需求，务必对字段建立地理位置索引

**说明**

一个多边形由一个或多个线性环（Linear Ring）组成，一个线性环即一个闭合的线段。一个闭合线段至少由四个点组成，其中最后一个点和第一个点的坐标必须相同，以此表示环的起点和终点。如果一个多边形由多个线性环组成，则第一个线性环表示外环（外边界），接下来的所有线性环表示内环（即外环中的洞，不计在此多边形中的区域）。如果一个多边形只有一个线性环组成，则这个环就是外环。

多边形构造规则：

1. 第一个线性环必须是外环
2. 外环不能自交
3. 所有内环必须完全在外环内
4. 各个内环间不能相交或重叠，也不能有共同的边
5. 外环应为逆时针，内环应为顺时针

```tsx
(polygons: JSONMultiPolygon | GeoPolygon[]) => GeoMultiPolygon
```

| 参数 | 说明 |
| --- | --- |
| polygons |  |

##### GeoPoint

地理位置 “点”

| 参数 | 说明 |
| --- | --- |
| longitude | 经度 |
| latitude | 纬度 |

###### toJSON

格式化为 JSON 结构

```tsx
() => object
```

###### toString

格式化为字符串

```tsx
() => string
```

##### GeoLineString

地理位置的 ”线“。一个线由两个或更多的点有序连接组成。

| 参数 | 说明 |
| --- | --- |
| points | 点集合 |

###### toJSON

格式化为 JSON 结构

```tsx
() => JSONLineString
```

###### toString

格式化为字符串

```tsx
() => string
```

##### GeoPolygon

地理位置 ”多边形“

| 参数 | 说明 |
| --- | --- |
| lines | 线集合 |

###### toJSON

格式化为 JSON 结构

```tsx
() => JSONPolygon
```

###### toString

格式化为字符串

```tsx
() => string
```

##### GeoMultiPoint

地理位置的 ”点“ 的集合。一个点集合由一个或更多的点组成。

| 参数 | 说明 |
| --- | --- |
| points | 点集合 |

###### toJSON

格式化为 JSON 结构

```tsx
() => JSONMultiPoint
```

###### toString

格式化为字符串

```tsx
() => string
```

##### GeoMultiLineString

地理位置 ”线“ 集合。一个线集合由多条线组成。

| 参数 | 说明 |
| --- | --- |
| lines | 线集合 |

###### toJSON

格式化为 JSON 结构

```tsx
() => JSONMultiLineString
```

###### toString

格式化为字符串

```tsx
() => string
```

##### GeoMultiPolygon

地理位置 ”多边形“ 集合。一个多边形集合由多个多边形组成。

| 参数 | 说明 |
| --- | --- |
| polygons | 多边形集合 |

###### toJSON

格式化为 JSON 结构

```tsx
() => JSONMultiPolygon
```

###### toString

格式化为字符串

```tsx
() => string
```

##### JSONPoint

地理位置 “点” 的 JSON 结构

| 参数 | 说明 |
| --- | --- |
| type | 类型 |
| coordinates | 坐标 |

##### JSONLineString

地理位置 ”线“ 的 JSON 结构

| 参数 | 说明 |
| --- | --- |
| type | 类型 |
| coordinates | 坐标 |

##### JSONPolygon

地理位置 ”多边形“ 的 JSON 结构

| 参数 | 说明 |
| --- | --- |
| type | 类型 |
| coordinates | 坐标 |

##### JSONMultiPoint

地理位置的 ”点“ 集合的 JSON 结构

| 参数 | 说明 |
| --- | --- |
| type | 类型 |
| coordinates | 坐标 |

##### JSONMultiLineString

地理位置 ”线“ 集合的 JSON 结构

| 参数 | 说明 |
| --- | --- |
| type | 类型 |
| coordinates | 坐标 |

##### JSONMultiPolygon

地理位置 ”多边形“ 集合的 JSON 结构

| 参数 | 说明 |
| --- | --- |
| type | 类型 |
| coordinates | 坐标 |
