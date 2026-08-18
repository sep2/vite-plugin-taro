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

以下组件可以从 `virtual:taro/components` 导入：

| 组件 | 用途 |
| --- | --- |
| [`CoverImage`](https://docs.taro.zone/docs/components/viewContainer/cover-image) | 显示可覆盖在原生组件上的图片。 |
| [`CoverView`](https://docs.taro.zone/docs/components/viewContainer/cover-view) | 显示可覆盖在原生组件上的视图。 |
| [`MatchMedia`](https://docs.taro.zone/docs/components/viewContainer/match-media) | 仅在媒体查询条件匹配时显示内容。 |
| [`MovableArea`](https://docs.taro.zone/docs/components/viewContainer/movable-area) | 定义 `MovableView` 的移动范围。 |
| [`MovableView`](https://docs.taro.zone/docs/components/viewContainer/movable-view) | 在 `MovableArea` 内拖动或缩放视图。 |
| [`PageContainer`](https://docs.taro.zone/docs/components/viewContainer/page-container) | 显示带进入和退出动画的页面容器。 |
| [`RootPortal`](https://docs.taro.zone/docs/components/viewContainer/root-portal) | 将子节点渲染到页面根节点。 |
| [`ScrollView`](https://docs.taro.zone/docs/components/viewContainer/scroll-view) | 显示可滚动的内容区域。 |
| [`Swiper`](https://docs.taro.zone/docs/components/viewContainer/swiper) | 显示可滑动切换的轮播容器。 |
| [`SwiperItem`](https://docs.taro.zone/docs/components/viewContainer/swiper-item) | 定义 `Swiper` 中的单个轮播项。 |
| [`View`](https://docs.taro.zone/docs/components/viewContainer/view) | 通用布局容器。 |
| [`Icon`](https://docs.taro.zone/docs/components/base/icon) | 显示内置图标。 |
| [`Progress`](https://docs.taro.zone/docs/components/base/progress) | 显示进度条。 |
| [`RichText`](https://docs.taro.zone/docs/components/base/rich-text) | 渲染富文本节点。 |
| [`Text`](https://docs.taro.zone/docs/components/base/text) | 显示文本内容。 |
| [`Button`](https://docs.taro.zone/docs/components/forms/button) | 触发操作或微信开放能力。 |
| [`Checkbox`](https://docs.taro.zone/docs/components/forms/checkbox) | 提供单个多选项。 |
| [`CheckboxGroup`](https://docs.taro.zone/docs/components/forms/checkbox-group) | 管理一组多选项及其变更事件。 |
| [`Editor`](https://docs.taro.zone/docs/components/forms/editor) | 提供富文本编辑区域。 |
| [`Form`](https://docs.taro.zone/docs/components/forms/form) | 收集控件值并触发表单提交或重置。 |
| [`Input`](https://docs.taro.zone/docs/components/forms/input) | 提供单行文本输入。 |
| [`KeyboardAccessory`](https://docs.taro.zone/docs/components/forms/keyboard-accessory) | 在输入法键盘上方显示工具栏。 |
| [`Label`](https://docs.taro.zone/docs/components/forms/label) | 为表单控件提供可点击标签。 |
| [`Picker`](https://docs.taro.zone/docs/components/forms/picker) | 显示从底部弹出的选择器。 |
| [`PickerView`](https://docs.taro.zone/docs/components/forms/picker-view) | 在页面内显示滚动选择器。 |
| [`PickerViewColumn`](https://docs.taro.zone/docs/components/forms/picker-view-column) | 定义 `PickerView` 的一列选项。 |
| [`Radio`](https://docs.taro.zone/docs/components/forms/radio) | 提供单个单选项。 |
| [`RadioGroup`](https://docs.taro.zone/docs/components/forms/radio-group) | 管理一组单选项及其变更事件。 |
| [`Slider`](https://docs.taro.zone/docs/components/forms/slider) | 通过滑块选择数值。 |
| [`Switch`](https://docs.taro.zone/docs/components/forms/switch) | 切换开关状态。 |
| [`Textarea`](https://docs.taro.zone/docs/components/forms/textarea) | 提供多行文本输入。 |
| [`DraggableSheet`](https://docs.taro.zone/docs/components/skyline/draggable-sheet) | 显示可拖动的面板。 |
| [`GridBuilder`](https://docs.taro.zone/docs/components/skyline/grid-builder) | 在自定义滚动容器中按需构建网格项。 |
| [`GridView`](https://docs.taro.zone/docs/components/skyline/grid-view) | 在自定义滚动容器中排列网格内容。 |
| [`ListBuilder`](https://docs.taro.zone/docs/components/skyline/list-builder) | 在自定义滚动容器中按需构建列表项。 |
| [`ListView`](https://docs.taro.zone/docs/components/skyline/list-view) | 在自定义滚动容器中排列列表内容。 |
| [`NestedScrollBody`](https://docs.taro.zone/docs/components/skyline/nested-scroll-body) | 定义参与嵌套滚动的主体区域。 |
| [`NestedScrollHeader`](https://docs.taro.zone/docs/components/skyline/nested-scroll-header) | 定义参与嵌套滚动的头部区域。 |
| [`OpenContainer`](https://docs.taro.zone/docs/components/skyline/open-container) | 在页面跳转时执行容器转场动画。 |
| [`ShareElement`](https://docs.taro.zone/docs/components/skyline/share-element) | 在页面之间执行共享元素转场。 |
| [`Snapshot`](https://docs.taro.zone/docs/components/skyline/snapshot) | 将子节点的渲染结果导出为图片。 |
| [`Span`](https://docs.taro.zone/docs/components/skyline/span) | 在 Skyline 文本中显示行内内容。 |
| [`StickyHeader`](https://docs.taro.zone/docs/components/skyline/sticky-header) | 在滚动时固定头部内容。 |
| [`StickySection`](https://docs.taro.zone/docs/components/skyline/sticky-section) | 对吸顶区块及其内容分组。 |
| [`DoubleTapGestureHandler`](https://docs.taro.zone/docs/components/gesture/double-tap-gesture-handler) | 识别双击手势。 |
| [`ForcePressGestureHandler`](https://docs.taro.zone/docs/components/gesture/force-press-gesture-handler) | 识别重按手势。 |
| [`HorizontalDragGestureHandler`](https://docs.taro.zone/docs/components/gesture/horizontal-drag-gesture-handler) | 识别水平拖动手势。 |
| [`LongPressGestureHandler`](https://docs.taro.zone/docs/components/gesture/long-press-gesture-handler) | 识别长按手势。 |
| [`PanGestureHandler`](https://docs.taro.zone/docs/components/gesture/pan-gesture-handler) | 识别平移手势。 |
| [`ScaleGestureHandler`](https://docs.taro.zone/docs/components/gesture/scale-gesture-handler) | 识别双指缩放手势。 |
| [`TapGestureHandler`](https://docs.taro.zone/docs/components/gesture/tap-gesture-handler) | 识别点击手势。 |
| [`VerticalDragGestureHandler`](https://docs.taro.zone/docs/components/gesture/vertical-drag-gesture-handler) | 识别垂直拖动手势。 |
| [`FunctionalPageNavigator`](https://docs.taro.zone/docs/components/navig/functional-page-navigator) | 跳转到插件提供的功能页。 |
| [`NavigationBar`](https://docs.taro.zone/docs/components/navig/navigation-bar) | 在 `PageMeta` 中配置页面导航栏。 |
| [`Navigator`](https://docs.taro.zone/docs/components/navig/navigator) | 以声明式链接跳转页面。 |
| [`Audio`](https://docs.taro.zone/docs/components/media/audio) | 播放音频。 |
| [`Camera`](https://docs.taro.zone/docs/components/media/camera) | 显示系统相机画面。 |
| [`ChannelLive`](https://docs.taro.zone/docs/components/media/channel-live) | 显示微信视频号直播。 |
| [`ChannelVideo`](https://docs.taro.zone/docs/components/media/channel-video) | 显示微信视频号视频。 |
| [`Image`](https://docs.taro.zone/docs/components/media/image) | 显示图片。 |
| [`LivePlayer`](https://docs.taro.zone/docs/components/media/live-player) | 播放实时音视频流。 |
| [`LivePusher`](https://docs.taro.zone/docs/components/media/live-pusher) | 推送实时音视频流。 |
| [`Video`](https://docs.taro.zone/docs/components/media/video) | 播放视频。 |
| [`VoipRoom`](https://docs.taro.zone/docs/components/media/voip-room) | 提供多人实时音视频通话。 |
| [`Map`](https://docs.taro.zone/docs/components/maps/map) | 显示腾讯地图。 |
| [`Canvas`](https://docs.taro.zone/docs/components/canvas/) | 使用 Canvas 绘制图形。 |
| [`Ad`](https://docs.taro.zone/docs/components/open/ad) | 显示广告。 |
| [`AdCustom`](https://docs.taro.zone/docs/components/open/ad-custom) | 显示原生模板广告。 |
| [`OfficialAccount`](https://docs.taro.zone/docs/components/open/official-account) | 显示微信公众号关注组件。 |
| [`OpenData`](https://docs.taro.zone/docs/components/open/open-data) | 显示微信开放数据。 |
| [`WebView`](https://docs.taro.zone/docs/components/open/web-view) | 在小程序中承载网页。 |
| [`PageMeta`](https://docs.taro.zone/docs/components/page-meta) | 动态配置页面元信息。 |
| [`CustomWrapper`](https://docs.taro.zone/docs/components/viewContainer/custom-wrapper) | 缩小深层数据更新影响的节点范围。 |
| [`NativeSlot`](https://docs.taro.zone/docs/components/viewContainer/native-slot) | 为编译后的原生组件声明插槽。 |
| [`Slot`](https://docs.taro.zone/docs/components/viewContainer/slot) | 向自定义组件的指定插槽传入内容。 |

具体属性及微信小程序与 Web 的支持差异以 Taro 组件文档为准。

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
