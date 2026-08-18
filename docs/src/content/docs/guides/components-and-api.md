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

## 支持的组件

以下组件可以从 `virtual:taro/components` 导入。点击组件名称查看属性、事件和平台支持。

### 视图容器

- [`CoverImage`](/references/components/#coverimage)：显示可覆盖在原生组件上的图片。
- [`CoverView`](/references/components/#coverview)：显示可覆盖在原生组件上的视图。
- [`MatchMedia`](/references/components/#matchmedia)：仅在媒体查询条件匹配时显示内容。
- [`MovableArea`](/references/components/#movablearea)：定义 `MovableView` 的移动范围。
- [`MovableView`](/references/components/#movableview)：在 `MovableArea` 内拖动或缩放视图。
- [`PageContainer`](/references/components/#pagecontainer)：显示带进入和退出动画的页面容器。
- [`RootPortal`](/references/components/#rootportal)：将子节点渲染到页面根节点。
- [`ScrollView`](/references/components/#scrollview)：显示可滚动的内容区域。
- [`Swiper`](/references/components/#swiper)：显示可滑动切换的轮播容器。
- [`SwiperItem`](/references/components/#swiperitem)：定义 `Swiper` 中的单个轮播项。
- [`View`](/references/components/#view)：通用布局容器。

### 基础内容

- [`Icon`](/references/components/#icon)：显示内置图标。
- [`Progress`](/references/components/#progress)：显示进度条。
- [`RichText`](/references/components/#richtext)：渲染富文本节点。
- [`Text`](/references/components/#text)：显示文本内容。

### 表单

- [`Button`](/references/components/#button)：触发操作或微信开放能力。
- [`Checkbox`](/references/components/#checkbox)：提供单个多选项。
- [`CheckboxGroup`](/references/components/#checkboxgroup)：管理一组多选项及其变更事件。
- [`Editor`](/references/components/#editor)：提供富文本编辑区域。
- [`Form`](/references/components/#form)：收集控件值并触发表单提交或重置。
- [`Input`](/references/components/#input)：提供单行文本输入。
- [`KeyboardAccessory`](/references/components/#keyboardaccessory)：在输入法键盘上方显示工具栏。
- [`Label`](/references/components/#label)：为表单控件提供可点击标签。
- [`Picker`](/references/components/#picker)：显示从底部弹出的选择器。
- [`PickerView`](/references/components/#pickerview)：在页面内显示滚动选择器。
- [`PickerViewColumn`](/references/components/#pickerviewcolumn)：定义 `PickerView` 的一列选项。
- [`Radio`](/references/components/#radio)：提供单个单选项。
- [`RadioGroup`](/references/components/#radiogroup)：管理一组单选项及其变更事件。
- [`Slider`](/references/components/#slider)：通过滑块选择数值。
- [`Switch`](/references/components/#switch)：切换开关状态。
- [`Textarea`](/references/components/#textarea)：提供多行文本输入。

### Skyline 布局

- [`DraggableSheet`](/references/components/#draggablesheet)：显示可拖动的面板。
- [`GridBuilder`](/references/components/#gridbuilder)：在自定义滚动容器中按需构建网格项。
- [`GridView`](/references/components/#gridview)：在自定义滚动容器中排列网格内容。
- [`ListBuilder`](/references/components/#listbuilder)：在自定义滚动容器中按需构建列表项。
- [`ListView`](/references/components/#listview)：在自定义滚动容器中排列列表内容。
- [`NestedScrollBody`](/references/components/#nestedscrollbody)：定义参与嵌套滚动的主体区域。
- [`NestedScrollHeader`](/references/components/#nestedscrollheader)：定义参与嵌套滚动的头部区域。
- [`OpenContainer`](/references/components/#opencontainer)：在页面跳转时执行容器转场动画。
- [`ShareElement`](/references/components/#shareelement)：在页面之间执行共享元素转场。
- [`Snapshot`](/references/components/#snapshot)：将子节点的渲染结果导出为图片。
- [`Span`](/references/components/#span)：在 Skyline 文本中显示行内内容。
- [`StickyHeader`](/references/components/#stickyheader)：在滚动时固定头部内容。
- [`StickySection`](/references/components/#stickysection)：对吸顶区块及其内容分组。

### Skyline 手势

- [`DoubleTapGestureHandler`](/references/components/#doubletapgesturehandler)：识别双击手势。
- [`ForcePressGestureHandler`](/references/components/#forcepressgesturehandler)：识别重按手势。
- [`HorizontalDragGestureHandler`](/references/components/#horizontaldraggesturehandler)：识别水平拖动手势。
- [`LongPressGestureHandler`](/references/components/#longpressgesturehandler)：识别长按手势。
- [`PanGestureHandler`](/references/components/#pangesturehandler)：识别平移手势。
- [`ScaleGestureHandler`](/references/components/#scalegesturehandler)：识别双指缩放手势。
- [`TapGestureHandler`](/references/components/#tapgesturehandler)：识别点击手势。
- [`VerticalDragGestureHandler`](/references/components/#verticaldraggesturehandler)：识别垂直拖动手势。

### 导航

- [`FunctionalPageNavigator`](/references/components/#functionalpagenavigator)：跳转到插件提供的功能页。
- [`NavigationBar`](/references/components/#navigationbar)：在 `PageMeta` 中配置页面导航栏。
- [`Navigator`](/references/components/#navigator)：以声明式链接跳转页面。

### 媒体

- [`Audio`](/references/components/#audio)：播放音频。
- [`Camera`](/references/components/#camera)：显示系统相机画面。
- [`ChannelLive`](/references/components/#channellive)：显示微信视频号直播。
- [`ChannelVideo`](/references/components/#channelvideo)：显示微信视频号视频。
- [`Image`](/references/components/#image)：显示图片。
- [`LivePlayer`](/references/components/#liveplayer)：播放实时音视频流。
- [`LivePusher`](/references/components/#livepusher)：推送实时音视频流。
- [`Video`](/references/components/#video)：播放视频。
- [`VoipRoom`](/references/components/#voiproom)：提供多人实时音视频通话。

### 地图与画布

- [`Map`](/references/components/#map)：显示腾讯地图。
- [`Canvas`](/references/components/#canvas)：使用 Canvas 绘制图形。

### 开放能力

- [`Ad`](/references/components/#ad)：显示广告。
- [`AdCustom`](/references/components/#adcustom)：显示原生模板广告。
- [`OfficialAccount`](/references/components/#officialaccount)：显示微信公众号关注组件。
- [`OpenData`](/references/components/#opendata)：显示微信开放数据。
- [`WebView`](/references/components/#webview)：在小程序中承载网页。

### 配置与插槽

- [`PageMeta`](/references/components/#pagemeta)：动态配置页面元信息。
- [`CustomWrapper`](/references/components/#customwrapper)：缩小深层数据更新影响的节点范围。
- [`NativeSlot`](/references/components/#nativeslot)：为编译后的原生组件声明插槽。
- [`Slot`](/references/components/#slot)：向自定义组件的指定插槽传入内容。

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

组件支持见[组件参考](/references/components/)，API 支持见 [Taro API 文档](https://docs.taro.zone/docs/apis/about/desc)。微信小程序专用接口应使用[条件编译](/guides/conditional-directives/)与 Web 代码隔离。
