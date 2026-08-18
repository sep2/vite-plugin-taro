---
title: 组件参考
description: VPT 支持的 Taro 组件、属性、事件与平台差异。
---

<!-- Adapted from NervJS/taro-docs, MIT License, Copyright (c) 2018. -->

应用代码从 `virtual:taro/components` 导入组件。通用写法参见[组件与 API](/guides/components-and-api/)。

## 通用属性与事件

### StandardProps

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| id | 页面内唯一标识。 |  | ✔️ | ✔️ |
| className | 样式类名。 |  | ✔️ | ✔️ |
| style | 内联样式。 |  | ✔️ | ✔️ |
| key | React 列表项的唯一标识。 |  | ✔️ | ✔️ |
| hidden | 是否隐藏组件。 |  | ✔️ | ✔️ |
| animation | 动画属性 |  |  |  |
| ref | 引用 |  |  |  |
| dangerouslySetInnerHTML | 渲染 HTML<br />[参考地址](https://docs.taro.zone/docs/html) |  |  |  |

### FormItemProps

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| name | 表单数据标识。 |  | ✔️ | ✔️ |

### EventProps

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| onTouchStart | 手指触摸动作开始 |  |  |  |
| onTouchMove | 手指触摸后移动 |  |  |  |
| onTouchCancel | 手指触摸动作被打断，如来电提醒，弹窗 |  |  |  |
| onTouchEnd | 手指触摸动作结束 |  |  |  |
| onClick | 手指触摸后马上离开 |  |  |  |
| onLongPress | 手指触摸后，超过350ms再离开，如果指定了事件回调函数并触发了这个事件，tap事件将不被触发 |  |  |  |
| onLongClick | 手指触摸后，超过350ms再离开（推荐使用 longpress 事件代替） |  |  |  |
| onTransitionEnd | 会在 WXSS transition 或 Taro.createAnimation 动画结束后触发 |  |  |  |
| onAnimationStart | 会在一个 WXSS animation 动画开始时触发 |  |  |  |
| onAnimationIteration | 会在一个 WXSS animation 一次迭代结束时触发 |  |  |  |
| onAnimationEnd | 会在一个 WXSS animation 动画完成时触发 |  |  |  |
| onTouchForceChange | 在支持 3D Touch 的 iPhone 设备，重按时会触发 |  |  |  |

### CommonEvent 与 BaseEventOrig

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| type | 事件类型 |  |  |  |
| timeStamp | 事件生成时的时间戳 |  |  |  |
| target | 触发事件的组件的一些属性值集合 |  |  |  |
| currentTarget | 当前组件的一些属性值集合 |  |  |  |
| detail | 额外的信息 |  |  |  |
| preventDefault | 阻止元素发生默认的行为 |  |  |  |
| stopPropagation | 阻止事件冒泡到父元素,阻止任何父事件处理程序被执行 |  |  |  |

### BaseTouchEvent、CanvasTouchEvent 与 ITouchEvent

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| touches | 触摸事件，当前停留在屏幕中的触摸点信息的数组 |  |  |  |
| changedTouches | 触摸事件，当前变化的触摸点信息的数组 |  |  |  |

### CanvasTouch

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| identifier | 触摸点标识。 |  |  |  |
| x | Canvas 内的横坐标。 |  |  |  |
| y | Canvas 内的纵坐标。 |  |  |  |

### ITouch

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| identifier | 触摸点的标识符 |  |  |  |
| pageX | 距离文档左上角的距离，文档的左上角为原点 ，横向为X轴，纵向为Y轴 |  |  |  |
| pageY | 距离文档左上角的距离，文档的左上角为原点 ，横向为X轴，纵向为Y轴 |  |  |  |
| clientX | 距离页面可显示区域（屏幕除去导航条）左上角距离，横向为X轴，纵向为Y轴 |  |  |  |
| clientY | 距离页面可显示区域（屏幕除去导航条）左上角距离，横向为X轴，纵向为Y轴 |  |  |  |

### Target 与 currentTarget

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| id | 事件源组件的id |  |  |  |
| tagName | 当前组件的类型 |  |  |  |
| dataset | 事件源组件上由data-开头的自定义属性组成的集合 |  |  |  |

### NetStatus

网络状态数据

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| videoBitrate | 视频编码器输出码率，单位 kbps。 |  |  |  |
| audioBitrate | 音频编码器输出码率，单位 kbps。 |  |  |  |
| videoFPS | 视频帧率。 |  |  |  |
| videoGOP | 关键帧间隔，单位秒。 |  |  |  |
| netSpeed | 发送或接收速度。 |  |  |  |
| netJitter | 网络抖动程度。 |  |  |  |
| videoWidth | 视频画面宽度。 |  |  |  |
| videoHeight | 视频画面高度。 |  |  |  |

### TaroEvent

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| srcElement | 事件源。 |  |  |  |
| target | 事件派发目标。 |  |  |  |
| detail | 事件数据。 |  |  |  |

## CoverImage

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/cover-image)

覆盖在原生组件之上的图片视图。可覆盖的原生组件同cover-view，支持嵌套在cover-view里。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| src | 图标路径，支持临时路径、网络地址、云文件ID。暂不支持base64格式。 |  | ✔️ | ✔️ |
| referrerPolicy | 格式固定为 https://servicewechat.com/{appid}/{version}/page-frame.html，其中 {appid} 为小程序的 appid，{version} 为小程序的版本号，版本号为 0 表示为开发版、体验版以及审核版本，版本号为 devtools 表示为开发者工具，其余为正式版本； |  | ✔️ |  |
| onLoad | 图片加载成功时触发 |  | ✔️ | ✔️ |
| onError | 图片加载失败时触发 |  | ✔️ | ✔️ |

## CoverView

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/cover-view)

覆盖在原生组件之上的文本视图。可覆盖的原生组件包括 map、video、canvas、camera、live-player、live-pusher 只支持嵌套 cover-view、cover-image，可在 cover-view 中使用 button。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| scrollTop | 设置顶部滚动偏移量，仅在设置了 overflow-y: scroll 成为滚动元素后生效 |  | ✔️ |  |

## MatchMedia

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/match-media)

media query 匹配检测节点。可以指定一组 media query 规则，满足时，这个节点才会被展示。
通过这个节点可以实现“页面宽高在某个范围时才展示某个区域”这样的效果。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| minWidth | 页面最小宽度（ px 为单位） |  | ✔️ |  |
| maxWidth | 页面最大宽度（ px 为单位） |  | ✔️ |  |
| width | 页面宽度（ px 为单位） |  | ✔️ |  |
| minHeight | 页面最小高度（ px 为单位） |  | ✔️ |  |
| maxHeight | 页面最大高度（ px 为单位） |  | ✔️ |  |
| height | 页面高度（ px 为单位） |  | ✔️ |  |
| orientation | 屏幕方向（ landscape 或 portrait ） |  | ✔️ |  |

## MovableArea

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/movable-area)

movable-view 的可移动区域

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| scaleArea | 当里面的 movable-view 设置为支持双指缩放时，设置此值可将缩放手势生效区域修改为整个 movable-area | `false` | ✔️ | ✔️ |

## MovableView

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/movable-view)

可移动的视图容器，在页面中可以拖拽滑动。movable-view 必须在 movable-area 组件中，并且必须是直接子节点，否则不能移动。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| direction | movable-view 的移动方向，属性值有`all`、`vertical`、`horizontal`、`none` | `none` | ✔️ | ✔️ |
| inertia | movable-view 是否带有惯性 | `false` | ✔️ | ✔️ |
| outOfBounds | 超过可移动区域后，movable-view 是否还可以移动 | `false` | ✔️ | ✔️ |
| x | 定义 x 轴方向的偏移，如果 x 的值不在可移动范围内，会自动移动到可移动范围；改变 x 的值会触发动画 |  | ✔️ | ✔️ |
| y | 定义 y 轴方向的偏移，如果 y 的值不在可移动范围内，会自动移动到可移动范围；改变 y 的值会触发动画 |  | ✔️ | ✔️ |
| damping | 阻尼系数，用于控制x或y改变时的动画和过界回弹的动画，值越大移动越快 | `20` | ✔️ | ✔️ |
| friction | 摩擦系数，用于控制惯性滑动的动画，值越大摩擦力越大，滑动越快停止；必须大于 0，否则会被设置成默认值 | `2` | ✔️ | ✔️ |
| disabled | 是否禁用 | `false` | ✔️ | ✔️ |
| scale | 是否支持双指缩放，默认缩放手势生效区域是在 movable-view 内 | `false` | ✔️ | ✔️ |
| scaleMin | 定义缩放倍数最小值 | `0.5` | ✔️ | ✔️ |
| scaleMax | 定义缩放倍数最大值 | `10` | ✔️ | ✔️ |
| scaleValue | 定义缩放倍数，取值范围为 0.5 - 10 | `1` | ✔️ | ✔️ |
| animation | 是否使用动画 | `true` | ✔️ | ✔️ |
| onChange | 拖动过程中触发的事件 |  | ✔️ |  |
| onScale | 缩放过程中触发的事件 |  | ✔️ | ✔️ |
| onTouchEnd | 手指触摸动作结束 |  |  | ✔️(此事件的触发顺序会因为当前事件机制引起组件内外注册的事件执行顺序不正常，外部注册的事件可能会优先于内部执行，如需保证执行顺序一致，需要在回调函数中包裹 setTimeout 临时处理) |
| onHTouchMove | 初次手指触摸后移动为横向的移动，如果 catch 此事件，则意味着 touchmove 事件也被 catch |  | ✔️ | ✔️ |
| onVTouchMove | 初次手指触摸后移动为纵向的移动，如果 catch 此事件，则意味着 touchmove 事件也被 catch |  | ✔️ | ✔️ |

#### TChangeSource

拖动过程中触发的事件

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| touch | 拖动 |  |  |  |
| touch-out-of-bounds | 超出移动范围 |  |  |  |
| out-of-bounds | 超出移动范围后的回弹 |  |  |  |
| friction | 惯性 |  |  |  |
| `''` | setData |  |  |  |

#### onChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| x | X 坐标 |  |  |  |
| y | Y 坐标 |  |  |  |
| source | 触发事件 |  |  |  |

#### onScaleEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| x | X 坐标 |  |  |  |
| y | Y 坐标 |  |  |  |
| scale | 缩放比例 |  |  |  |

## PageContainer

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/page-container)

页面容器

小程序如果在页面内进行复杂的界面设计（如在页面内弹出半屏的弹窗、在页面内加载一个全屏的子页面等），用户进行返回操作会直接离开当前页面，不符合用户预期，预期应为关闭当前弹出的组件。
为此提供“假页”容器组件，效果类似于 `popup` 弹出层，页面内存在该容器时，当用户进行返回操作，关闭该容器不关闭页面。返回操作包括三种情形，右滑手势、安卓物理返回键和调用 `navigateBack` 接口。

Bug & Tip
 1. tip: 当前页面最多只有 1 个容器，若已存在容器的情况下，无法增加新的容器
 2. tip: wx.navigateBack 无法在页面栈顶调用，此时没有上一级页面

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| show | 是否显示容器组件 | `false` | ✔️ |  |
| duration | 动画时长，单位毫秒 | `300` | ✔️ |  |
| zIndex | z-index 层级 | `100` | ✔️ |  |
| overlay | 是否显示遮罩层 | `true` | ✔️ |  |
| position | 弹出位置，可选值为 top bottom right center | `bottom` | ✔️ |  |
| round | 是否显示圆角 | `false` | ✔️ |  |
| overlayStyle | 自定义遮罩层样式 |  | ✔️ |  |
| customStyle | 自定义弹出层样式 |  | ✔️ |  |
| closeOnSlideDown | 是否在下滑一段距离后关闭 | `false` | ✔️ |  |
| onBeforeEnter | 进入前触发 |  | ✔️ |  |
| onEnter | 进入中触发 |  | ✔️ |  |
| onAfterEnter | 进入后触发 |  | ✔️ |  |
| onBeforeLeave | 离开前触发 |  | ✔️ |  |
| onLeave | 离开中触发 |  | ✔️ |  |
| onAfterLeave | 离开后触发 |  | ✔️ |  |
| onClickOverlay | 点击遮罩层时触发 |  | ✔️ |  |

#### Position

弹出位置

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| top | 上方弹出 |  |  |  |
| bottom | 下方弹出 |  |  |  |
| right | 右边弹出 |  |  |  |
| center | 中央弹出 |  |  |  |

## RootPortal

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/root-portal)

root-portal
使整个子树从页面中脱离出来，类似于在 CSS 中使用 fixed position 的效果。主要用于制作弹窗、弹出层等。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| enable | 是否从页面中脱离出来 | `true` | ✔️ |  |

## ScrollView

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/scroll-view)

可滚动视图区域。使用竖向滚动时，需要给scroll-view一个固定高度，通过 WXSS 设置 height。组件属性的长度单位默认为 px

Tips:
H5 中 ScrollView 组件是通过一个高度（或宽度）固定的容器内部滚动来实现的，因此务必正确的设置容器的高度。例如: 如果 ScrollView 的高度将 body 撑开，就会同时存在两个滚动条（body 下的滚动条，以及 ScrollView 的滚动条）。
微信小程序 中 ScrollView 组件如果设置 scrollX 横向滚动时，并且子元素为多个时（单个子元素时设置固定宽度则可以正常横向滚动），需要通过 WXSS 设置 `white-space: nowrap` 来保证元素不换行，并对 ScrollView 内部元素设置 `display: inline-block` 来使其能够横向滚动。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| scrollX | 允许横向滚动 | `false` | ✔️ | ✔️ |
| scrollY | 允许纵向滚动 | `false` | ✔️ | ✔️ |
| upperThreshold | 距顶部/左边多远时（单位px），触发 scrolltoupper 事件 | `50` | ✔️ | ✔️ |
| lowerThreshold | 距底部/右边多远时（单位px），触发 scrolltolower 事件 | `50` | ✔️ | ✔️ |
| scrollTop | 设置竖向滚动条位置 |  | ✔️ | ✔️ |
| scrollLeft | 设置横向滚动条位置 |  | ✔️ | ✔️ |
| scrollIntoView | 值应为某子元素id（id不能以数字开头）。设置哪个方向可滚动，则在哪个方向滚动到该元素 |  | ✔️ | ✔️ |
| scrollWithAnimation | 在设置滚动条位置时使用动画过渡 | `false` | ✔️ | ✔️ |
| enableBackToTop | iOS 点击顶部状态栏、安卓双击标题栏时，滚动条返回顶部，只支持竖向 | `false` | ✔️ |  |
| enableFlex | 启用 flexbox 布局。开启后，当前节点声明了 `display: flex` 就会成为 flex container，并作用于其孩子节点。 | `false` | ✔️ |  |
| scrollAnchoring | 开启 scroll anchoring 特性，即控制滚动位置不随内容变化而抖动，仅在 iOS 下生效，安卓下可参考 CSS `overflow-anchor` 属性。 | `false` | ✔️ |  |
| refresherEnabled | 开启自定义下拉刷新 | `false` | ✔️ |  |
| refresherThreshold | 设置自定义下拉刷新阈值 | `45` | ✔️ |  |
| refresherDefaultStyle | 设置自定义下拉刷新默认样式，支持设置 `black or white or none`， none 表示不使用默认样式 | `'black'` | ✔️ |  |
| refresherBackground | 设置自定义下拉刷新区域背景颜色 | `'#FFF'` | ✔️ |  |
| refresherTriggered | 设置当前下拉刷新状态，true 表示下拉刷新已经被触发，false 表示下拉刷新未被触发 | `false` | ✔️ |  |
| enhanced | 启用 scroll-view 增强特性 | `false` | ✔️ |  |
| usingSticky | 使 scroll-view 下的 position sticky 特性生效，否则滚动一屏后 sticky 元素会被隐藏 | `false` | ✔️ |  |
| bounces | iOS 下 scroll-view 边界弹性控制 (同时开启 enhanced 属性后生效) | `true` | ✔️ |  |
| showScrollbar | 滚动条显隐控制 (同时开启 enhanced 属性后生效) | `true` | ✔️ |  |
| pagingEnabled | 分页滑动效果 (同时开启 enhanced 属性后生效) | `false` | ✔️ |  |
| fastDeceleration | 滑动减速速率控制，同时开启 `enhanced` 后生效。 | `false` | ✔️ |  |
| enablePassive | 开启 passive 特性，能优化一定的滚动性能 | `false` | ✔️ |  |
| type | 渲染模式<br />list - 列表模式。只会渲染在屏节点，会根据直接子节点是否在屏来按需渲染，若只有一个直接子节点则性能会退化<br />custom - 自定义模式。只会渲染在屏节点，子节点可以是 sticky-section list-view grid-view 等组件<br />nested - 嵌套模式。用于处理父子 scroll-view 间的嵌套滚动，子节点可以是 nested-scroll-header nested-scroll-body 组件或自定义 refresher | `'list'` | ✔️ |  |
| associativeContainer | 关联的滚动容器<br />draggable-sheet	  - 关联 draggable-sheet 组件	3.2.0<br />nested-scroll-view	- 关联 type=nested 嵌套模式	3.2.0<br />pop-gesture	      - 关联 页面手势返回 3.4.0 | `''` | ✔️ |  |
| reverse | 是否反向滚动。一般初始滚动位置是在顶部，反向滚动则是在底部。 | `false` | ✔️ |  |
| clip | 是否对溢出进行裁剪，默认开启 | `true` | ✔️ |  |
| cacheExtent | 指定视口外渲染区域的距离，默认情况下视口外节点不渲染。指定 cache-extent 可优化滚动体验和加载速度，但会提高内存占用且影响首屏速度，可按需启用。 |  | ✔️ |  |
| minDragDistance | 指定 scroll-view 触发滚动的最小拖动距离。仅在 scroll-view 和其他组件存在手势冲突时使用，可通过调整该属性使得滚动更加灵敏。 | `18` | ✔️ |  |
| padding | 长度为 4 的数组，按 top、right、bottom、left 顺序指定内边距 | `[0,0,0,0]` | ✔️ |  |
| scrollIntoViewWithinExtent | 只 scroll-into-view 到 cacheExtent 以内的目标节点，性能更佳 | `false` | ✔️ |  |
| scrollIntoViewAlignment | 指定 scroll-into-view 目标节点在视口内的位置。<br />start - 目标节点显示在视口开始处<br />center - 目标节点显示在视口中间<br />end - 目标节点显示在视口结束处<br />nearest - 目标节点在就近的视口边缘显示，若节点已在视口内则不触发滚动 | `'start'` | ✔️ | ✔️ |
| refresherTwoLevelEnabled | 开启下拉二级能力 | `false` | ✔️ |  |
| refresherTwoLevelTriggered | 设置打开/关闭二级 | `false` | ✔️ |  |
| refresherTwoLevelThreshold | 下拉二级阈值 | `150` | ✔️ |  |
| refresherTwoLevelCloseThreshold | 滑动返回时关闭二级的阈值 | `80` | ✔️ |  |
| refresherTwoLevelScrollEnabled | 处于二级状态时是否可滑动 | `false` | ✔️ |  |
| refresherBallisticRefreshEnabled | 惯性滚动是否触发下拉刷新 | `false` | ✔️ |  |
| refresherTwoLevelPinned | 即将打开二级时是否定住。 | `false` | ✔️ |  |
| onScrollToUpper | 滚动到顶部/左边，会触发 scrolltoupper 事件 |  | ✔️ | ✔️ |
| onScrollToLower | 滚动到底部/右边，会触发 scrolltolower 事件 |  | ✔️ | ✔️ |
| onScroll | 滚动时触发 |  | ✔️ | ✔️ |
| onScrollStart | 滚动开始事件 |  | ✔️ |  |
| onScrollEnd | 滚动结束事件 |  | ✔️ |  |
| onRefresherPulling | 自定义下拉刷新控件被下拉 |  | ✔️ |  |
| onRefresherRefresh | 自定义下拉刷新被触发 |  | ✔️ |  |
| onRefresherRestore | 自定义下拉刷新被复位 |  | ✔️ |  |
| onRefresherAbort | 自定义下拉刷新被中止 |  | ✔️ |  |
| onRefresherWillRefresh | 自定义下拉刷新即将触发刷新（拖动超过 refresher-threshold 时）的事件 |  | ✔️ |  |
| onRefresherStatusChange | 下拉刷新状态回调 |  | ✔️ |  |
| onDragStart | 滑动开始事件 (同时开启 enhanced 属性后生效) |  | ✔️ |  |
| onDragging | 滑动事件 (同时开启 enhanced 属性后生效) |  | ✔️ |  |
| onDragEnd | 滑动结束事件 (同时开启 enhanced 属性后生效) |  | ✔️ |  |
| onScrollStartWorklet | 同 bindscrollstart，但仅支持 worklet 作为回调 |  | ✔️ |  |
| onScrollUpdateWorklet | 同 bindscroll ，但仅支持 worklet 作为回调 |  | ✔️ |  |
| onScrollEndWorklet | 同 bindscrollend，但仅支持 worklet 作为回调 |  | ✔️ |  |
| adjustDecelerationVelocityWorklet | 指定手指抬起时做惯性滚动的初速度。(velocity: number) => number |  | ✔️ |  |

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| RefreshStatus |  |  |  |  |

#### onScrollDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| scrollLeft | 横向滚动条位置 |  |  |  |
| scrollTop | 竖向滚动条位置 |  |  |  |
| scrollHeight | 滚动条高度 |  |  |  |
| scrollWidth | 滚动条宽度 |  |  |  |
| deltaX |  |  |  |  |
| deltaY |  |  |  |  |
| isDrag |  |  |  |  |

#### onDragDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| scrollLeft | 横向滚动条位置 |  |  |  |
| scrollTop | 竖向滚动条位置 |  |  |  |
| velocity | 滚动速度 |  |  |  |

#### RefresherStatusChange

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| status |  |  |  |  |
| dy |  |  |  |  |

## Swiper

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/swiper)

滑块视图容器。其中只可放置 swiper-item 组件，否则会导致未定义的行为。
> 不要为 `SwiperItem` 设置 **style** 属性，可以通过 class 设置样式。[7147](https://github.com/NervJS/taro/issues/7147)

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| indicatorDots | 是否显示面板指示点 | `false` | ✔️ | ✔️ |
| indicatorColor | 指示点颜色 | `"rgba(0, 0, 0, .3)"` | ✔️ | ✔️ |
| indicatorActiveColor | 当前选中的指示点颜色 | `"#000000"` | ✔️ | ✔️ |
| autoplay | 是否自动切换 | `false` | ✔️ | ✔️ |
| current | 当前所在滑块的 index | `0` | ✔️ | ✔️ |
| currentItemId | 当前所在滑块的 item-id ，不能与 current 被同时指定 | `""` | (deprecated) | ✔️ |
| interval | 自动切换时间间隔 | `5000` | ✔️ | ✔️ |
| duration | 滑动动画时长 | `500` | ✔️ | ✔️ |
| circular | 是否采用衔接滑动 | `false` | ✔️ | ✔️ |
| vertical | 滑动方向是否为纵向 | `false` | ✔️ | ✔️ |
| previousMargin | 前边距，可用于露出前一项的一小部分，接受 px 和 rpx 值 | `"0px"` | ✔️ | ✔️ |
| nextMargin | 后边距，可用于露出后一项的一小部分，接受 px 和 rpx 值 | `"0px"` | ✔️ | ✔️ |
| snapToEdge | 当 swiper-item 的个数大于等于 2，关闭 circular 并且开启 previous-margin 或 next-margin 的时候，可以指定这个边距是否应用到第一个、最后一个元素 | `false` | ✔️ |  |
| displayMultipleItems | 同时显示的滑块数量 | `1` | ✔️ | ✔️ |
| easingFunction | 指定 swiper 切换缓动动画类型 | `"default"` | ✔️ |  |
| zoom | 是否启用缩放 | `false` |  | ✔️ |
| full | 是否开启全屏 | `false` |  | ✔️ |
| effectsProps | swiper11 相关的动效参数，具体见文档 https://swiperjs.com/swiper-api#parameters |  |  | ✔️ |
| onChange | current 改变时会触发 change 事件 |  | ✔️ | ✔️ |
| onTransition | swiper-item 的位置发生改变时会触发 transition 事件 |  | ✔️ |  |
| onAnimationFinish | 动画结束时会触发 animationfinish 事件 |  | ✔️ | ✔️ |
| layoutType | 渲染模式 | `normal` | ✔️ |  |
| transformerType | layout-type 为 transformer 时指定动画类型 | `scaleAndFade` | ✔️ |  |
| indicatorType | 指示点动画类型 | `normal` | ✔️ |  |
| indicatorMargin | 指示点四周边距 | `10` | ✔️ |  |
| indicatorSpacing | 指示点间距 | `4` | ✔️ |  |
| indicatorRadius | 指示点圆角大小 | `4` | ✔️ |  |
| indicatorWidth | 指示点宽度 | `8` | ✔️ |  |
| indicatorHeight | 指示点高度 | `8` | ✔️ |  |
| indicatorAlignment | 指示点的相对位置 | `auto` | ✔️ |  |
| indicatorOffset | 指示点位置的偏移量 | `[0, 0]` | ✔️ |  |
| scrollWithAnimation | 改变 current 时使用动画过渡 | `true` | ✔️ |  |
| cacheExtent | 缓存区域大小，值为 1 表示提前渲染上下各一屏区域（swiper 容器大小） | `0` | ✔️ |  |
| onScrollStartWorklet | 滑动开始时触发，仅支持 worklet 作为回调。event.detail = {dx: dx, dy: dy} |  | ✔️ |  |
| onScrollUpdateWorklet | 滑动位置更新时触发，仅支持 worklet 作为回调。event.detail = {dx: dx, dy: dy} |  | ✔️ |  |
| onScrollEndWorklet | 滑动结束时触发，仅支持 worklet 作为回调。event.detail = {dx: dx, dy: dy} |  | ✔️ |  |

#### TChangeSource

导致变更的原因

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| autoplay | 自动播放 |  |  |  |
| touch | 用户划动 |  |  |  |
|  | 其它原因 |  |  |  |

#### TEasingFunction

指定 swiper 切换缓动动画类型

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| default | 默认缓动函数 |  |  |  |
| linear | 线性动画 |  |  |  |
| easeInCubic | 缓入动画 |  |  |  |
| easeOutCubic | 缓出动画 |  |  |  |
| easeInOutCubic | 缓入缓出动画 |  |  |  |

#### onCommonEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| current | 当前所在滑块的索引 |  |  |  |
| source | 导致变更的原因 |  |  |  |

#### onChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| current | 当前所在滑块的索引 |  |  |  |
| source | 导致变更的原因 |  |  |  |
| currentItemId | SwiperItem的itemId参数值 |  |  |  |

#### onTransitionEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| dx | X 坐标 |  |  |  |
| dy | Y 坐标 |  |  |  |

## SwiperItem

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/swiper-item)

仅可放置在 swiper 组件中，宽高自动设置为100%
> 不要为 `SwiperItem` 设置 **style** 属性，可以通过 class 设置样式。[7147](https://github.com/NervJS/taro/issues/7147)

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| itemId | 该 swiper-item 的标识符 |  | ✔️ | ✔️ |
| skipHiddenItemLayout | 是否跳过未显示的滑块布局，设为 true 可优化复杂情况下的滑动性能，但会丢失隐藏状态滑块的布局信息 | `false` | ✔️ |  |

## View

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/view)

视图容器

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| hoverClass | 指定按下去的样式类。当 `hover-class="none"` 时，没有点击态效果 | `none` | ✔️ | ✔️ |
| hoverStopPropagation | 指定是否阻止本节点的祖先节点出现点击态 | `false` | ✔️ |  |
| hoverStartTime | 按住后多久出现点击态，单位毫秒 | `50` | ✔️ | ✔️ |
| hoverStayTime | 手指松开后点击态保留时间，单位毫秒 | `400` | ✔️ | ✔️ |
| catchMove | 是否以 catch 的形式绑定 touchmove 事件<br />version: 3.1.0+ |  | ✔️ |  |

## Icon

[查看 Taro 文档](https://docs.taro.zone/docs/components/base/icon)

图标。组件属性的长度单位默认为 px

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| type | icon 的类型 |  | ✔️ | ✔️ |
| size | icon 的大小，单位px | `23` | ✔️ | ✔️ |
| color | icon 的颜色，同 css 的 color |  | ✔️ | ✔️ |

#### TIconType

icon 的类型

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| success | 成功图标 |  |  |  |
| success_no_circle | 成功图标（不带外圈） |  |  |  |
| info | 信息图标 |  |  |  |
| warn | 警告图标 |  |  |  |
| waiting | 等待图标 |  |  |  |
| cancel | 取消图标 |  |  |  |
| download | 下载图标 |  |  |  |
| search | 搜索图标 |  |  |  |
| clear | 清除图标 |  |  |  |
| circle | 圆环图标(多选控件图标未选择)「微信文档未标注属性」 |  |  |  |
| info_circle | 带圆环的信息图标「微信文档未标注属性」 |  |  |  |

## Progress

[查看 Taro 文档](https://docs.taro.zone/docs/components/base/progress)

进度条。组件属性的长度单位默认为 px

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| percent | 百分比 0~100 |  | ✔️ | ✔️ |
| showInfo | 在进度条右侧显示百分比 | `false` | ✔️ | ✔️ |
| borderRadius | 圆角大小 | `0` | ✔️ | ✔️ |
| fontSize | 右侧百分比字体大小 | `16` | ✔️ | ✔️ |
| strokeWidth | 进度条线的宽度 | `6` | ✔️ | ✔️ |
| color | 进度条颜色 (请使用 activeColor) | `"#09BB07"` | ✔️ | ✔️ |
| activeColor | 已选择的进度条的颜色 | `"#09BB07"` | ✔️ | ✔️ |
| backgroundColor | 未选择的进度条的颜色 | `"#EBEBEB"` | ✔️ | ✔️ |
| active | 进度条从左往右的动画 | `false` | ✔️ | ✔️ |
| activeMode | backwards: 动画从头播<br /><br />forwards: 动画从上次结束点接着播 | `backwards` | ✔️ | ✔️ |
| duration | 进度增加 1% 所需毫秒数 | `30` | ✔️ | ✔️ |
| onActiveEnd | 动画完成事件 |  | ✔️ | ✔️ |

## RichText

[查看 Taro 文档](https://docs.taro.zone/docs/components/base/rich-text)

富文本

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| userSelect | 文本是否可选，该属性会使节点显示为 block | `false` | ✔️ | ✔️ |
| nodes | 节点列表/ HTML String |  | ✔️ | ✔️ |
| space | 显示连续空格 |  | ✔️ | ✔️ |
| selectable | 富文本是否可以长按选中，可用于复制，粘贴，长按搜索等场景 | `false（基础库 3.150.1 以前版本）true（基础库 3.150.1 及以后版本）` |  | ✔️ |
| mode | 布局兼容模式 | `default` | ✔️ |  |

#### TSpace

space 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| ensp | 中文字符空格一半大小 |  |  |  |
| emsp | 中文字符空格大小 |  |  |  |
| nbsp | 根据字体设置的空格大小 |  |  |  |

#### Text

文本节点

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| type | 文本类型 |  |  |  |
| text | 文本字符串<br />`支持 entities` | `""` |  |  |

#### HTMLElement

元素节点，默认为元素节点
全局支持class和style属性，不支持 id 属性。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| type | HTML 类型 |  |  |  |
| name | 标签名<br />`支持部分受信任的 HTML 节点` |  |  |  |
| attrs | 属性<br />`支持部分受信任的属性，遵循 Pascal 命名法` |  |  |  |
| children | 子节点列表<br />`结构和 nodes 一致` |  |  |  |

### Nodes

节点类型
> 现支持两种节点，通过type来区分，分别是元素节点和文本节点，默认是元素节点，在富文本区域里显示的HTML节点 元素节点：type = node*

#### 类型

```tsx
(Text | HTMLElement)[] | string
```

## Text

[查看 Taro 文档](https://docs.taro.zone/docs/components/base/text)

文本

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| selectable | 文本是否可选 | `false` | ✔️ | ✔️ |
| userSelect | 文本是否可选，该属性会使文本节点显示为 inline-block | `false` | ✔️ | ✔️ |
| space | 显示连续空格 |  | ✔️ | ✔️ |
| decode | 是否解码 | `false` | ✔️ | (默认解码，不支持设置) |
| overflow | 文本溢出处理 | `'visible'` | ✔️ |  |
| maxLines | 限制文本最大行数 |  | ✔️ |  |

#### TSpace

space 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| ensp | 中文字符空格一半大小 |  |  |  |
| emsp | 中文字符空格大小 |  |  |  |
| nbsp | 根据字体设置的空格大小 |  |  |  |

#### Overflow

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| clip | 修剪文本 |  |  |  |
| fade | 淡出 |  |  |  |
| ellipsis | 显示省略号 |  |  |  |
| visible | 文本不截断 |  |  |  |

## Button

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/button)

按钮

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| size | 按钮的大小 | `default` | ✔️ | ✔️ |
| type | 按钮的样式类型 | `default` | ✔️ | ✔️ |
| plain | 按钮是否镂空，背景色透明 | `false` | ✔️ | ✔️ |
| disabled | 是否禁用 | `false` | ✔️ | ✔️ |
| loading | 名称前是否带 loading 图标 | `false` | ✔️ | ✔️ |
| formType | 用于 `<form/>` 组件，点击分别会触发 `<form/>` 组件的 submit/reset 事件 |  | ✔️ |  |
| openType | 微信开放能力 |  | ✔️ |  |
| hoverClass | 指定按下去的样式类。当 `hover-class="none"` 时，没有点击态效果 | `button-hover` | ✔️ | ✔️ |
| hoverStopPropagation | 指定是否阻止本节点的祖先节点出现点击态 | `false` | ✔️ |  |
| hoverStartTime | 按住后多久出现点击态，单位毫秒 | `20` | ✔️ | ✔️ |
| hoverStayTime | 手指松开后点击态保留时间，单位毫秒 | `70` | ✔️ | ✔️ |
| lang | 指定返回用户信息的语言，zh_CN 简体中文，zh_TW 繁体中文，en 英文。<br /><br />生效时机: `open-type="getUserInfo"` |  | ✔️ |  |
| sessionFrom | 会话来源<br /><br />生效时机：`open-type="contact"` |  | ✔️ |  |
| sendMessageTitle | 会话内消息卡片标题<br /><br />生效时机：`open-type="contact"` | `当前标题` | ✔️ |  |
| sendMessagePath | 会话内消息卡片点击跳转小程序路径<br /><br />生效时机：`open-type="contact"` | `当前标题` | ✔️ |  |
| sendMessageImg | 会话内消息卡片图片<br /><br />生效时机：`open-type="contact"` | `截图` | ✔️ |  |
| appParameter | 打开 APP 时，向 APP 传递的参数<br /><br />生效时机：`open-type="launchApp"` |  | ✔️ |  |
| showMessageCard | 显示会话内消息卡片<br /><br />生效时机：`open-type="contact"` | `false` | ✔️ |  |
| onGetUserInfo | 用户点击该按钮时，会返回获取到的用户信息，回调的detail数据与 Taro.getUserInfo 返回的一致<br /><br />生效时机: `open-type="getUserInfo"` |  | ✔️ |  |
| onContact | 客服消息回调<br /><br />生效时机：`open-type="contact"` |  | ✔️ |  |
| onGetPhoneNumber | 获取用户手机号回调<br /><br />生效时机：`open-type="getPhoneNumber"` |  | ✔️ |  |
| onGetRealTimePhoneNumber | 手机号实时验证回调，`open-type="getRealtimePhoneNumber"` 时有效 |  | ✔️ |  |
| onError | 当使用开放能力时，发生错误的回调<br /><br />生效时机：`open-type="launchApp"` |  | ✔️ |  |
| onOpenSetting | 在打开授权设置页后回调<br /><br />生效时机：`open-type="openSetting"` |  | ✔️ |  |
| onLaunchApp | 打开 APP 成功的回调<br /><br />生效时机：`open-type="launchApp"` |  | ✔️ |  |
| onChooseAvatar | 获取用户头像回调<br /><br />生效时机：`open-type="chooseAvatar"` |  | ✔️ |  |
| onAgreePrivacyAuthorization | 用户同意隐私协议事件回调，`open-type="agreePrivacyAuthorization"`时有效 |  | ✔️ |  |

#### Size

size 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| default | 默认大小 |  |  |  |
| mini | 小尺寸 |  |  |  |

#### Type

type 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| primary | 绿色 |  |  |  |
| default | 白色 |  |  |  |
| warn | 红色 |  |  |  |

#### FormType

form-type 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| submit | 提交表单 |  |  |  |
| reset | 重置表单 |  |  |  |

#### OpenType

open-type 的合法值

#### openTypeKeys

open-type 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| weapp |  |  |  |  |

#### Lang

lang 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| en | 英文 |  |  |  |
| zh_CN | 简体中文 |  |  |  |
| zh_TW | 繁体中文 |  |  |  |

#### onGetUserInfoEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| userInfo |  |  |  |  |
| rawData | 不包括敏感信息的原始数据 `JSON` 字符串，用于计算签名 |  |  |  |
| signature | 使用 `sha1(rawData + sessionkey)` 得到字符串，用于校验用户信息 |  |  |  |
| encryptedData | 包括敏感数据在内的完整用户信息的加密数据 |  |  |  |
| iv | 加密算法的初始向量 |  |  |  |
| errMsg |  |  |  |  |
| cloudID | 敏感数据对应的云 ID，开通[云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)的小程序才会返回，可通过云调用直接获取开放数据，详细见[云调用直接获取开放数据](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#method-cloud) |  |  |  |

#### Gender

性别的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| 0 | 未知 |  |  |  |
| 1 | 男 |  |  |  |
| 2 | 女 |  |  |  |

#### onContactEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| errMsg |  |  |  |  |
| path | 小程序消息指定的路径 |  |  |  |
| query | 小程序消息指定的查询参数 |  |  |  |

#### onGetPhoneNumberEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| errMsg |  |  |  |  |
| encryptedData | 包括敏感数据在内的完整用户信息的加密数据 |  |  |  |
| iv | 加密算法的初始向量 |  |  |  |
| code | 动态令牌。可通过动态令牌换取用户手机号。<br />[参考地址](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/share.html#%E4%BD%BF%E7%94%A8%E6%8C%87%E5%BC%95) |  |  |  |

#### onGetRealTimePhoneNumberEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| code |  |  |  |  |

#### onOpenSettingEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| errMsg |  |  |  |  |
| authSetting |  |  |  |  |

## Checkbox

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/checkbox)

多选项目

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | `<Checkbox/>`标识，选中时触发`<CheckboxGroup/>`的 change 事件，并携带 `<Checkbox/>` 的 value |  | ✔️ | ✔️ |
| disabled | 是否禁用 | `false` | ✔️ | ✔️ |
| checked | 当前是否选中，可用来设置默认选中 | `false` | ✔️ | ✔️ |
| color | checkbox的颜色，同 css 的 color |  | ✔️ | ✔️ |
| name | Checkbox 的名字 |  |  | ✔️ |
| nativeProps | 用于透传 `WebComponents` 上的属性到内部 H5 标签上 |  |  | ✔️ |
| onChange | 选中项发生变化时触发 change 事件，小程序无此 API |  |  | ✔️ |

## CheckboxGroup

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/checkbox-group)

多项选择器，内部由多个checkbox组成

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| name | 表单组件中加上 name 来作为 key |  |  | ✔️ |
| onChange | `<CheckboxGroup/>` 中选中项发生改变是触发 change 事件 |  | ✔️ | ✔️ |

## Editor

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/editor)

富文本编辑器，可以对图片、文字进行编辑。

编辑器导出内容支持带标签的 html和纯文本的 text，编辑器内部采用 delta 格式进行存储。

通过 setContents 接口设置内容时，解析插入的 html 可能会由于一些非法标签导致解析错误，建议开发者在小程序内使用时通过 delta 进行插入。

富文本组件内部引入了一些基本的样式使得内容可以正确的展示，开发时可以进行覆盖。需要注意的是，在其它组件或环境中使用富文本组件导出的 html 时，需要额外引入 这段样式，并维护 `<ql-container><ql-editor></ql-editor></ql-container>` 的结构。

图片控件仅初始化时设置有效。

*编辑器内支持部分 HTML 标签和内联样式，不支持 **class** 和 **id***

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| readOnly | 设置编辑器为只读 | `false` | ✔️ |  |
| placeholder | 提示信息 |  | ✔️ |  |
| showImgSize | 点击图片时显示图片大小控件 | `false` | ✔️ |  |
| showImgToolbar | 点击图片时显示工具栏控件 | `false` | ✔️ |  |
| showImgResize | 点击图片时显示修改尺寸控件 | `false` | ✔️ |  |
| onReady | 编辑器初始化完成时触发 |  | ✔️ |  |
| onFocus | 编辑器聚焦时触发 |  | ✔️ |  |
| onBlur | 编辑器失去焦点时触发<br />detail = { html, text, delta } |  | ✔️ |  |
| onInput | 编辑器内容改变时触发<br />detail = { html, text, delta } |  | ✔️ |  |
| onStatusChange | 通过 Context 方法改变编辑器内样式时触发，返回选区已设置的样式 |  | ✔️ |  |

## Form

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/form)

表单。将组件内的用户输入的 switch input checkbox slider radio picker 提交。

当点击 form 表单中 form-type 为 submit 的 button 组件时，会将表单组件中的 value 值进行提交，需要在表单组件中加上 name 来作为 key。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| reportSubmit | 是否返回 `formId` 用于发送模板消息。 | `false` | ✔️ | ✔️ |
| reportSubmitTimeout | 等待一段时间（毫秒数）以确认 `formId` 是否生效。<br />如果未指定这个参数，`formId` 有很小的概率是无效的（如遇到网络失败的情况）。<br />指定这个参数将可以检测 `formId` 是否有效，<br />以这个参数的时间作为这项检测的超时时间。<br />如果失败，将返回 `requestFormId:fail` 开头的 `formId`。 | `0` | ✔️ |  |
| onSubmit | 携带 form 中的数据触发 submit 事件 |  | ✔️ | ✔️ |
| onReset | 表单重置时会触发 reset 事件 |  | ✔️ | ✔️ |

#### onSubmitEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 当点击 `<form>` 表单中 `form-type` 为 `submit` 的 `<button>` 组件时，<br />会将表单组件中的 `value` 值进行提交，<br />需要在表单组件中加上 `name` 来作为 `key`。 |  |  |  |
| formId | 当 `reportSubmit` 为 `true` 时，返回 `formId` 用于发送模板消息。 |  |  |  |

## Input

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/input)

输入框。该组件是原生组件，使用时请注意相关限制

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 输入框的初始内容 |  | ✔️ | ✔️ |
| defaultValue | 设置 React 非受控输入框的初始内容 |  | ✔️ | ✔️ |
| type | input 的类型 | `"text"` | ✔️ | ✔️ |
| password | 是否是密码类型 | `false` | ✔️ | ✔️ |
| placeholder | 输入框为空时占位符 |  | ✔️ | ✔️ |
| placeholderStyle | 指定 placeholder 的样式 |  | ✔️ |  |
| placeholderClass | 指定 placeholder 的样式类 | `"input-placeholder"` | ✔️ |  |
| disabled | 是否禁用 | `false` | ✔️ | ✔️ |
| maxlength | 最大输入长度，设置为 -1 的时候不限制最大长度 | `140` | ✔️ | ✔️ |
| cursorSpacing | 指定光标与键盘的距离，单位 px 。取 input 距离底部的距离和 cursor-spacing 指定的距离的最小值作为光标与键盘的距离 | `0` | ✔️ |  |
| autoFocus | (即将废弃，请直接使用 focus )自动聚焦，拉起键盘<br />**不推荐使用** | `false` | ✔️ | ✔️ |
| focus | 获取焦点 | `false` | ✔️ | ✔️ |
| confirmType | 设置键盘右下角按钮的文字，仅在type='text'时生效 | `done` | ✔️ |  |
| confirmHold | 点击键盘右下角按钮时是否保持键盘不收起 | `false` | ✔️ |  |
| cursor | 指定focus时的光标位置 |  | ✔️ |  |
| cursorColor | 光标颜色。iOS 下的格式为十六进制颜色值 #000000，安卓下的只支持 default 和 green，Skyline 下无限制 |  | ✔️ |  |
| selectionStart | 光标起始位置，自动聚集时有效，需与selection-end搭配使用 | `-1` | ✔️ |  |
| selectionEnd | 光标结束位置，自动聚集时有效，需与selection-start搭配使用 | `-1` | ✔️ |  |
| adjustPosition | 键盘弹起时，是否自动上推页面 | `true` | ✔️ |  |
| holdKeyboard | focus 时，点击页面的时候不收起键盘 | `false` | ✔️ |  |
| alwaysEmbed | 强制 input 处于同层状态，默认 focus 时 input 会切到非同层状态 (仅在 iOS 下生效) | `false` | ✔️ |  |
| safePasswordCertPath | 安全键盘加密公钥的路径，只支持包内路径 |  | ✔️ |  |
| safePasswordLength | 安全键盘输入密码长度 |  | ✔️ |  |
| safePasswordTimeStamp | 安全键盘加密时间戳 |  | ✔️ |  |
| safePasswordNonce | 安全键盘加密盐值 |  | ✔️ |  |
| safePasswordSalt | 安全键盘计算hash盐值，若指定custom-hash 则无效 |  | ✔️ |  |
| safePasswordCustomHash | 安全键盘计算hash的算法表达式，如 `md5(sha1('foo' + sha256(sm3(password + 'bar'))))` |  | ✔️ |  |
| nativeProps | 用于透传 `WebComponents` 上的属性到内部 H5 标签上 |  |  | ✔️ |
| onInput | 当键盘输入时，触发input事件，event.detail = {value, cursor, keyCode}，处理函数可以直接 return 一个字符串，将替换输入框的内容。 |  | ✔️ | ✔️ |
| onFocus | 输入框聚焦时触发，event.detail = { value, height }，height 为键盘高度 |  | ✔️ | ✔️ |
| onBlur | 输入框失去焦点时触发 |  | ✔️ | ✔️ |
| onConfirm | 点击完成按钮时触发 |  | ✔️ | ✔️ |
| onKeyboardHeightChange | 键盘高度发生变化的时候触发此事件 |  | ✔️ |  |
| onNickNameReview | 用户昵称审核完毕后触发，仅在 type 为 "nickname" 时有效，event.detail = { pass, timeout } |  | ✔️ |  |
| onSelectionChange | 选区改变事件, {selectionStart, selectionEnd} |  | ✔️ |  |
| onKeyboardCompositionStart | 输入法开始新的输入时触发 （仅当输入法支持时触发） |  | ✔️ |  |
| onKeyboardCompositionUpdate | 输入法输入字符时触发（仅当输入法支持时触发） |  | ✔️ |  |
| onKeyboardCompositionEnd | 输入法输入结束时触发（仅当输入法支持时触发） |  | ✔️ |  |
| onKeyoardHeightChangeWorklet | 键盘高度变化时触发。event.detail = {height: height, pageBottomPadding: pageBottomPadding}； height: 键盘高度，pageBottomPadding: 页面上推高度 |  | ✔️ |  |

#### Type

Input 类型

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| text | 文本输入键盘 |  | ✔️ | ✔️ |
| number | 数字输入键盘 |  | ✔️ | ✔️ |
| idcard | 身份证输入键盘 |  | ✔️ |  |
| digit | 带小数点的数字键盘 |  | ✔️ | ✔️ |
| safe-password | 密码安全输入键盘[指引](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/safe-password.html) |  | ✔️ |  |
| nickname | 昵称输入键盘 |  | ✔️ |  |

#### ConfirmType

Confirm 类型

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| send | 右下角按钮为“发送” |  |  |  |
| search | 右下角按钮为“搜索” |  |  |  |
| next | 右下角按钮为“下一个” |  |  |  |
| go | 右下角按钮为“前往” |  |  |  |
| done | 右下角按钮为“完成” |  |  |  |

#### inputEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 输入值 |  |  |  |
| cursor | 光标位置 |  |  |  |
| keyCode | 键值 |  |  |  |

#### inputForceEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 输入值 |  |  |  |
| height | 键盘高度 |  |  |  |

#### inputValueEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 输入值 |  |  |  |

#### onKeyboardHeightChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| height | 键盘高度 |  |  |  |
| duration | 持续时间 |  |  |  |

## KeyboardAccessory

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/keyboard-accessory)

设置 Input / Textarea 聚焦时键盘上方 CoverView / CoverImage 工具栏视图。

## Label

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/label)

用来改进表单组件的可用性。

使用for属性找到对应的id，或者将控件放在该标签下，当点击时，就会触发对应的控件。 for优先级高于内部控件，内部有多个控件的时候默认触发第一个控件。 目前可以绑定的控件有：button, checkbox, radio, switch。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| for | 绑定控件的 id |  | ✔️ | ✔️ |

## Picker

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/picker)

从底部弹起的滚动选择器

### 通用属性

选择器通用参数

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| headerText | 选择器的标题，微信小程序中仅安卓可用 |  | ✔️ |  |
| mode | 选择器类型，默认是普通选择器 | `"selector"` | ✔️ | ✔️ |
| disabled | 是否禁用 | `false` | ✔️ | ✔️ |
| onCancel | 取消选择或点遮罩层收起 picker 时触发 |  | ✔️ | ✔️ |
| textProps | 用于替换组件内部文本 |  |  | ✔️ |

#### Mode

选择器类型

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| selector | 普通选择器 |  |  |  |
| multiSelector | 多列选择器 |  |  |  |
| time | 时间选择器 |  |  |  |
| date | 日期选择器 |  |  |  |
| region | 省市区选择器 |  |  |  |

#### PickerText

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| okText |  |  |  |  |
| cancelText |  |  |  |  |

### 普通选择器属性

普通选择器：mode = selector

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| mode | 选择器类型 |  | ✔️ | ✔️ |
| range | mode为 selector 或 multiSelector 时，range 有效 | `[]` | ✔️ | ✔️ |
| rangeKey | 当 range 是一个 Object Array 时，通过 rangeKey 来指定 Object 中 key 的值作为选择器显示内容 |  | ✔️ | ✔️ |
| value | 表示选择了 range 中的第几个（下标从 0 开始） | `0` | ✔️ | ✔️ |
| defaultValue | 设置 React 非受控状态下的初始取值 |  | ✔️ | ✔️ |
| onChange | value 改变时触发 change 事件 |  | ✔️ | ✔️ |

#### ChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 表示变更值的下标 |  |  |  |

### 多列选择器属性

多列选择器：mode = multiSelector

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| mode | 选择器类型 |  | ✔️ | ✔️ |
| range | mode为 selector 或 multiSelector 时，range 有效 | `[]` | ✔️ | ✔️ |
| rangeKey | 当 range 是一个 Object Array 时，通过 rangeKey 来指定 Object 中 key 的值作为选择器显示内容 |  | ✔️ | ✔️ |
| value | 表示选择了 range 中的第几个（下标从 0 开始） | `[]` | ✔️ | ✔️ |
| onChange | 当 value 改变时触发 change 事件 |  | ✔️ | ✔️ |
| onColumnChange | 列改变时触发 |  | ✔️ | ✔️ |

#### ChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 表示变更值的下标 |  |  |  |

#### ColumnChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| column | 表示改变了第几列（下标从0开始） |  |  |  |
| value | 表示变更值的下标 |  |  |  |

### 时间选择器属性

时间选择器：mode = time

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| mode | 选择器类型 |  | ✔️ | ✔️ |
| value | value 的值表示选择了 range 中的第几个（下标从 0 开始） |  | ✔️ | ✔️ |
| defaultValue | 设置 React 非受控状态下的初始取值 |  | ✔️ | ✔️ |
| start | 仅当 mode 为 "time" 或 "date" 时有效，表示有效时间范围的开始，字符串格式为"hh:mm" |  | ✔️ | ✔️ |
| end | 仅当 mode 为 "time" 或 "date" 时有效，表示有效时间范围的结束，字符串格式为"hh:mm" |  | ✔️ | ✔️ |
| onChange | value 改变时触发 change 事件 |  | ✔️ | ✔️ |

#### ChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 表示选中的时间 |  |  |  |

### 日期选择器属性

日期选择器：mode = date

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| mode | 选择器类型 |  | ✔️ | ✔️ |
| value | 表示选中的日期，格式为"YYYY-MM-DD" | `0` | ✔️ | ✔️ |
| defaultValue | 设置 React 非受控状态下的初始取值 |  | ✔️ | ✔️ |
| start | 仅当 mode 为 "time" 或 "date" 时有效，表示有效时间范围的开始，字符串格式为"YYYY-MM-DD" |  | ✔️ | ✔️ |
| end | 仅当 mode 为 "time" 或 "date" 时有效，表示有效时间范围的结束，字符串格式为"YYYY-MM-DD" |  | ✔️ | ✔️ |
| fields | 有效值 year, month, day，表示选择器的粒度 | `"day"` | ✔️ | ✔️ |
| onChange | value 改变时触发 change 事件 |  | ✔️ | ✔️ |

#### Fields

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| year | 选择器粒度为年 |  |  |  |
| month | 选择器粒度为月份 |  |  |  |
| day | 选择器粒度为天 |  |  |  |

#### ChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 表示选中的日期 |  |  |  |

### 省市区选择器属性

省市区选择器：mode = region

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| mode | 选择器类型 |  | ✔️ | ✔️ |
| value | 表示选中的省市区，默认选中每一列的第一个值 | `[]` | ✔️ | ✔️ |
| defaultValue | 设置 React 非受控状态下的初始取值 |  | ✔️ | ✔️ |
| customItem | 可为每一列的顶部添加一个自定义的项 |  | ✔️ | ✔️ |
| level | 选择器层级 | `"region"` | ✔️ |  |
| onChange | value 改变时触发 change 事件 |  | ✔️ | ✔️ |

#### ChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 表示选中的省市区 |  |  |  |
| code | 统计用区划代码 |  |  |  |
| postcode | 邮政编码 |  |  |  |

#### RegionData

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value |  |  |  |  |
| code |  |  |  |  |
| postcode |  |  |  |  |
| children |  |  |  |  |

#### Level

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| province | 省级选择器 |  |  |  |
| city | 市级选择器 |  |  |  |
| region | 区级选择器 |  |  |  |
| sub-district | 街道选择器 |  |  |  |

## PickerView

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/picker-view)

嵌入页面的滚动选择器
其中只可放置 picker-view-column 组件，其它节点不会显示

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 数组中的数字依次表示 picker-view 内的 picker-view-column 选择的第几项（下标从 0 开始），数字大于 picker-view-column 可选项长度时，选择最后一项。 |  | ✔️ |  |
| defaultValue | 设置 React 非受控状态下的初始取值 |  | ✔️ |  |
| indicatorStyle | 设置选择器中间选中框的样式 |  | ✔️ |  |
| indicatorClass | 设置选择器中间选中框的类名 |  | ✔️ |  |
| maskStyle | 设置蒙层的样式 |  | ✔️ |  |
| maskClass | 设置蒙层的类名 |  | ✔️ |  |
| immediateChange | 是否在手指松开时立即触发 change 事件。若不开启则会在滚动动画结束后触发 change 事件。 | `false` | ✔️ |  |
| onChange | 当滚动选择，value 改变时触发 change 事件，event.detail = {value: value}；value为数组，表示 picker-view 内的 picker-view-column 当前选择的是第几项（下标从 0 开始） |  | ✔️ |  |
| onPickStart | 当滚动选择开始时候触发事件 |  | ✔️ |  |
| onPickEnd | 当滚动选择结束时候触发事件 |  | ✔️ |  |

#### onChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value |  |  |  |  |

## PickerViewColumn

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/picker-view-column)

滚动选择器子项
仅可放置于 `<PickerView />` 中，其孩子节点的高度会自动设置成与 picker-view 的选中框的高度一致

## Radio

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/radio)

单选项目

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | `<Radio/>` 标识。当该`<Radio/>` 选中时，`<RadioGroup/>`的 change 事件会携带`<Radio/>`的 value |  | ✔️ | ✔️ |
| checked | 当前是否选中 | `false` | ✔️ | ✔️ |
| disabled | 是否禁用 | `false` | ✔️ | ✔️ |
| color | Radio 的颜色，同 css 的 color | `"#09BB07"` | ✔️ |  |
| name | Radio 的名字 |  |  | ✔️ |
| nativeProps | 用于透传 `WebComponents` 上的属性到内部 H5 标签上 |  |  | ✔️ |
| onChange | <radio-group/> 中的选中项发生变化时触发 change 事件 |  |  | ✔️ |

## RadioGroup

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/radio-group)

单项选择器，内部由多个 Radio 组成。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| onChange | RadioGroup 中选中项发生改变时触发 change 事件，detail = {value:[选中的radio的value的数组]} |  | ✔️ | ✔️ |

#### onChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value |  |  |  |  |

## Slider

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/slider)

滑动选择器

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| min | 最小值 | `0` | ✔️ | ✔️ |
| max | 最大值 | `100` | ✔️ | ✔️ |
| step | 步长，取值必须大于 0，并且可被(max - min)整除 | `1` | ✔️ | ✔️ |
| disabled | 是否禁用 | `false` | ✔️ | ✔️ |
| value | 当前取值 | `0` | ✔️ | ✔️ |
| defaultValue | 设置 React 非受控状态下的初始取值 |  | ✔️ | ✔️ |
| color | 背景条的颜色（请使用 backgroundColor） | `"#e9e9e9"` | ✔️ |  |
| selectedColor | 已选择的颜色（请使用 activeColor） | `"#1aad19"` | ✔️ |  |
| activeColor | 已选择的颜色 | `"#1aad19"` | ✔️ | ✔️ |
| backgroundColor | 背景条的颜色 | `"#e9e9e9"` | ✔️ | ✔️ |
| blockSize | 滑块的大小，取值范围为 12 - 28 | `28` | ✔️ | ✔️ |
| blockColor | 滑块的颜色 | `"#ffffff"` | ✔️ | ✔️ |
| showValue | 是否显示当前 value | `false` | ✔️ | ✔️ |
| onChange | 完成一次拖动后触发的事件 |  | ✔️ | ✔️ |
| onChanging | 拖动过程中触发的事件 |  | ✔️ | ✔️ |

## Switch

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/switch)

开关选择器

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| checked | 是否选中 | `false` | ✔️ | ✔️ |
| defaultChecked | 设置在 React 非受控状态下，当前是否选中 |  | ✔️ | ✔️ |
| disabled | 是否禁用 | `false` | ✔️ | ✔️ |
| type | 样式，有效值：switch, checkbox | `"switch"` | ✔️ | ✔️ |
| color | switch 的颜色，同 css 的 color | `"#04BE02"` | ✔️ | ✔️ |
| nativeProps | 用于透传 `WebComponents` 上的属性到内部 H5 标签上 |  |  | ✔️ |
| onChange | checked 改变时触发 change 事件 |  | ✔️ | ✔️ |

#### onChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value |  |  |  |  |

## Textarea

[查看 Taro 文档](https://docs.taro.zone/docs/components/forms/textarea)

多行输入框。该组件是原生组件，使用时请注意相关限制

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 输入框的内容 |  | ✔️ | ✔️ |
| defaultValue | 设置 React 非受控输入框的初始内容 |  | ✔️ | ✔️ |
| placeholder | 输入框为空时占位符 |  | ✔️ | ✔️ |
| placeholderStyle | 指定 placeholder 的样式<br />需传入对象，格式为 { fontSize: number, fontWeight: string, color: string } |  | ✔️ |  |
| placeholderClass | 指定 placeholder 的样式类 | `"textarea-placeholder"` | ✔️ |  |
| disabled | 是否禁用 | `false` | ✔️ | ✔️ |
| maxlength | 最大输入长度，设置为 -1 的时候不限制最大长度 | `140` | ✔️ | ✔️ |
| autoFocus | 自动聚焦，拉起键盘 | `false` | ✔️ | ✔️ |
| focus | 获取焦点 | `false` | ✔️ | ✔️ |
| autoHeight | 是否自动增高，设置 autoHeight 时，style.height不生效 | `false` | ✔️ | ✔️ |
| fixed | 如果 Textarea 是在一个 `position:fixed` 的区域，需要显示指定属性 fixed 为 true | `false` | ✔️ |  |
| cursorSpacing | 指定光标与键盘的距离，单位 px 。取 Textarea 距离底部的距离和 cursorSpacing 指定的距离的最小值作为光标与键盘的距离 | `0` | ✔️ |  |
| cursor | 指定 focus 时的光标位置 | `-1` | ✔️ |  |
| showConfirmBar | 是否显示键盘上方带有”完成“按钮那一栏 | `true` | ✔️ |  |
| selectionStart | 光标起始位置，自动聚集时有效，需与 selectionEnd 搭配使用 | `-1` | ✔️ |  |
| selectionEnd | 光标结束位置，自动聚集时有效，需与 selectionStart 搭配使用 | `-1` | ✔️ |  |
| adjustPosition | 键盘弹起时，是否自动上推页面 | `true` | ✔️ |  |
| holdKeyboard | focus 时，点击页面的时候不收起键盘 | `false` | ✔️ |  |
| disableDefaultPadding | 是否去掉 iOS 下的默认内边距 | `false` | ✔️ |  |
| nativeProps | 用于透传 `WebComponents` 上的属性到内部 H5 标签上 |  |  | ✔️ |
| confirmType | 设置键盘右下角按钮的文字 |  | ✔️ |  |
| confirmHold | 点击键盘右下角按钮时是否保持键盘不收起 |  | ✔️ |  |
| adjustKeyboardTo | 键盘对齐位置 | `false` | ✔️ |  |
| onFocus | 输入框聚焦时触发 |  | ✔️ | ✔️ |
| onBlur | 输入框失去焦点时触发 |  | ✔️ | ✔️ |
| onLineChange | 输入框行数变化时调用 |  | ✔️ |  |
| onInput | 当键盘输入时，触发 input 事件<br /><br />**onInput 处理函数的返回值并不会反映到 textarea 上** |  | ✔️ | ✔️ |
| onConfirm | 点击完成时， 触发 confirm 事件 |  | ✔️ | ✔️ |
| onKeyboardHeightChange | 键盘高度发生变化的时候触发此事件 |  | ✔️ |  |
| onSelectionChange | 选区改变事件, {selectionStart, selectionEnd} |  | ✔️ |  |
| onKeyboardCompositionStart | 输入法开始新的输入时触发 （仅当输入法支持时触发） |  | ✔️ |  |
| onKeyboardCompositionUpdate | 输入法输入字符时触发（仅当输入法支持时触发） |  | ✔️ |  |
| onKeyboardCompositionEnd | 输入法输入结束时触发（仅当输入法支持时触发） |  | ✔️ |  |

#### onFocusEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 输入值 |  |  |  |
| height | 键盘高度 |  |  |  |

#### onBlurEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 输入值 |  |  |  |
| cursor | 光标位置 |  |  |  |

#### onLineChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| height |  |  |  |  |
| heightRpx |  |  |  |  |
| lineCount |  |  |  |  |

#### onInputEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 输入值 |  |  |  |
| cursor | 光标位置 |  |  |  |
| keyCode | 键值 |  |  |  |

#### onConfirmEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| value | 输入值 |  |  |  |

#### onKeyboardHeightChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| height | 键盘高度 |  |  |  |
| duration | 持续时间 |  |  |  |

## DraggableSheet

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/draggable-sheet)

半屏可拖拽组件
该组件需配合 DraggableSheetContext 接口使用。 目前仅在 Skyline 渲染引擎下支持。
页面内拖拽是一种常见的交互效果，开发者可通过手势系统灵活实现。draggable-sheet 组件封装了常见的交互逻辑，实现起来更加简单。
该组件需结合 scroll-view 使用。scroll-view 组件声明 associative-container 属性后，可与 draggable-sheet 关联起来。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| initialChildSize | 初始时占父容器的比例 | `0.5` | ✔️ |  |
| minChildSize | 最小时占父容器的比例 | `0.25` | ✔️ |  |
| maxChildSize | 最大时占父容器的比例 | `1.0` | ✔️ |  |
| snap | 拖拽后是否自动对齐关键点 | `false` | ✔️ |  |
| snapSizes | 拖拽后对齐的关键点，无需包含最小和最大值 | `[]` | ✔️ |  |
| onSizeUpdateWorklet | 尺寸发生变化时触发，仅支持 worklet 作为回调。event = {pixels, size} |  | ✔️ |  |

## GridBuilder

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/grid-builder)

网格构造器，仅支持作为 `<scroll-view type="custom">` 模式的直接子节点，仅 Skyline 支持。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| type | 布局方式 | `"aligned"<br /><br />可选值:<br />- aligned: 每行高度由同一行中最大高度子节点决定<br />- masonry: 瀑布流，根据子元素高度自动布局` | ✔️ |  |
| list | 需要用于渲染的列表 | `[]` | ✔️ |  |
| childCount | 完整列表的长度，如果不传则取 list 的长度作为其值 |  | ✔️ |  |
| crossAxisCount | 交叉轴元素数量 | `2` | ✔️ |  |
| maxCrossAxisExtent | 交叉轴元素最大范围 | `0` | ✔️ |  |
| mainAxisGap | 主轴方向间隔 | `0` | ✔️ |  |
| crossAxisGap | 交叉轴方向间隔 | `0` | ✔️ |  |
| padding | 长度为 4 的数组，按 top、right、bottom、left 顺序指定内边距 | `[0, 0, 0, 0]` | ✔️ |  |
| onItemBuild | 列表项创建时触发，event.detail = {index}，index 即被创建的列表项序号 |  | ✔️ |  |
| onItemDispose | 列表项回收时触发，event.detail = {index}，index 即被回收的列表项序号 |  | ✔️ |  |

## GridView

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/grid-view)

网格布局容器，仅支持作为 scroll-view 自定义模式下的直接子节点或 sticky-section 组件直接子节点。仅 Skyline 支持。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| type | 布局方式 | `"aligned"<br /><br />可选值:<br />- aligned: 每行高度由同一行中最大高度子节点决定<br />- masonry: 瀑布流，根据子元素高度自动布局` | ✔️ |  |
| crossAxisCount | 交叉轴元素数量 | `2` | ✔️ |  |
| mainAxisGap | 主轴方向间隔 | `0` | ✔️ |  |
| crossAxisGap | 交叉轴方向间隔 | `0` | ✔️ |  |
| maxCrossAxisExtent | 交叉轴元素最大范围 | `0` | ✔️ |  |
| padding | 长度为 4 的数组，按 top、right、bottom、left 顺序指定内边距 | `[0, 0, 0, 0]` | ✔️ |  |

## ListBuilder

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/list-builder)

列表构造器，仅支持作为 `<scroll-view type="custom">` 模式的直接子节点，仅 Skyline 支持。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| type | 布局方式 | `"aligned"<br /><br />可选值:<br />- static: 定高模式，所有列表项等高，需要传入 child-height<br />- dynamic: 不定高模式` | ✔️ |  |
| list | 需要用于渲染的列表 | `[]` | ✔️ |  |
| childCount | 完整列表的长度，如果不传则取 list 的长度作为其值 |  | ✔️ |  |
| childHeight | 列表项的高度，当 type 为 static 时必须传入 |  | ✔️ |  |
| padding | 长度为 4 的数组，按 top、right、bottom、left 顺序指定内边距 | `[0, 0, 0, 0]` | ✔️ |  |
| onItemBuild | 列表项创建时触发，event.detail = {index}，index 即被创建的列表项序号 |  | ✔️ |  |
| onItemDispose | 列表项回收时触发，event.detail = {index}，index 即被回收的列表项序号 |  | ✔️ |  |

## ListView

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/list-view)

列表布局容器，仅支持作为 scroll-view 自定义模式下的直接子节点或 sticky-section 组件直接子节点。仅 Skyline 支持。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| padding | 长度为 4 的数组，按 top、right、bottom、left 顺序指定内边距 | `[0, 0, 0, 0]` | ✔️ |  |

## NestedScrollBody

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/nested-scroll-body)

嵌套 scroll-view 场景中属于里层 scroll-view 的节点，
仅支持作为 `<scroll-view type="nested">` 模式的直接子节点。
不支持复数子节点，渲染时会取其第一个子节点来渲染。具体用法可参考 scroll-view

## NestedScrollHeader

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/nested-scroll-header)

嵌套 scroll-view 场景中属于外层 scroll-view 的节点，
仅支持作为 `<scroll-view type="nested">` 模式的直接子节点。
不支持复数子节点，渲染时会取其第一个子节点来渲染。具体用法可参考 scroll-view

## OpenContainer

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/open-container)

容器转场动画组件
点击 OpenContainer 组件，当使用 wx.navigateTo 跳转下一页面时，对其子节点和下一个页面进行过渡。
下个页面从 OpenContainer 所在位置大小渐显放大，同时 OpenContainer 内容渐隐，过渡效果包含背景色、圆角和阴影。
源页面 OpenContainer 为 closed 状态，转场动画后为 open 状态。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| transitionType | 动画类型 | `"fade"<br /><br />可选值:<br />- fade: 将传入元素淡入传出元素之上<br />- fadeThrough: 首先淡出传出元素，并在传出元素完全淡出后开始淡入传入元素` | ✔️ |  |
| transitionDuration | 动画时长 | `300` | ✔️ |  |
| closedColor | 初始容器背景色 | `"white"` | ✔️ |  |
| closedElevation | 初始容器影深大小 | `0` | ✔️ |  |
| closeBorderRadius | 初始容器圆角大小 | `0` | ✔️ |  |
| middleColor | fadeThrough 模式下的过渡背景色 | `""` | ✔️ |  |
| openColor | 打开状态下容器背景色 | `"white"` | ✔️ |  |
| openElevation | 打开状态下容器影深大小 | `0` | ✔️ |  |
| openBorderRadius | 打开状态下容器圆角大小 | `0` | ✔️ |  |

## ShareElement

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/share-element)

共享元素

共享元素是一种动画形式，类似于 [`flutter Hero`](https://flutterchina.club/animations/hero-animations/) 动画，表现为元素像是在页面间穿越一样。该组件需与 [`PageContainer`](https://docs.taro.zone/docs/components/viewContainer/page-container) 组件结合使用。
使用时需在当前页放置 `ShareElement` 组件，同时在 `PageContainer` 容器中放置对应的 `ShareElement` 组件，对应关系通过属性值 key 映射。当设置 `PageContainer` `显示时，transform` 属性为 `true` 的共享元素会产生动画。当前页面容器退出时，会产生返回动画。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| key | 映射标记<br />不推荐: 使用mapkey替换key |  | ✔️ |  |
| mapkey | 映射标记 |  | ✔️ |  |
| transform | 是否进行动画 | `false` | ✔️ |  |
| duration | 动画时长，单位毫秒 | `300` | ✔️ |  |
| easingFunction | css缓动函数 | `ease-out` | ✔️ |  |
| transitionOnGesture | 手势返回时是否进行动画 | `false` | ✔️ |  |
| shuttleOnPush | 指定 push 阶段的飞跃物 | `"to"` | ✔️ |  |
| shuttleOnPop | 指定 pop 阶段的飞跃物 | `"to"` | ✔️ |  |
| rectTweenType | 动画插值曲线 | `"materialRectArc"` | ✔️ |  |
| onFrameWorklet | 动画帧回调 |  | ✔️ |  |

## Snapshot

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/snapshot)

截图组件
支持将其子节点的渲染结果导出成图片，该组件需配合 snapshot 接口使用。 目前仅在 Skyline 渲染引擎 下支持。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| mode | 渲染模式 | `'view'<br /><br />可选值:<br />- view: 以真实节点渲染<br />- picture: 对子节点生成的内容截图渲染` | ✔️ |  |

## Span

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/span)

用于支持内联文本和 image / navigator 的混排

## StickyHeader

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/sticky-header)

吸顶布局容器，仅支持作为 scroll-view 自定义模式下的直接子节点或 sticky-section 组件直接子节点。仅 Skyline 支持。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| offsetTop | 吸顶时与顶部的距(px) | `0` | ✔️ |  |
| padding | 长度为 4 的数组，按 top、right、bottom、left 顺序指定内边距 | `[0, 0, 0, 0]` | ✔️ |  |
| onStickOnTopChange | 吸顶状态变化事件，仅支持非 worklet 的组件方法作为回调。event.detail = { isStickOnTop }，当 sticky-header 吸顶时为 true，否则为 false。<br />version: >=3.6.2 |  | ✔️ |  |

## StickySection

[查看 Taro 文档](https://docs.taro.zone/docs/components/skyline/sticky-section)

吸顶布局容器，仅支持作为 scroll-view 自定义模式下的直接子节点。仅 Skyline 支持。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| pushPinnedHeader | 吸顶元素重叠时是否继续上推 | `true` | ✔️ |  |
| padding | 长度为 4 的数组，按 top、right、bottom、left 顺序指定内边距 | `[0, 0, 0, 0]` | ✔️ |  |

## DoubleTapGestureHandler

[查看 Taro 文档](https://docs.taro.zone/docs/components/gesture/double-tap-gesture-handler)

双击时触发手势
微信小程序下 skyline 的手势标签，只能在 CompileMode 中使用

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| tag | 声明手势协商时的组件标识 |  | ✔️ |  |
| onGestureWorklet | 手势识别成功的回调 |  | ✔️ |  |
| shouldResponseOnMoveWorklet | 手指移动过程中手势是否响应 |  | ✔️ |  |
| shouldAcceptGestureWorklet | 手势是否应该被识别 |  | ✔️ |  |
| simultaneousHandlers | 声明可同时触发的手势节点 |  | ✔️ |  |
| nativeView | 代理的原生节点类型 |  | ✔️ |  |

## ForcePressGestureHandler

[查看 Taro 文档](https://docs.taro.zone/docs/components/gesture/force-press-gesture-handler)

iPhone 设备重按时触发手势
微信小程序下 skyline 的手势标签，只能在 CompileMode 中使用

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| tag | 声明手势协商时的组件标识 |  | ✔️ |  |
| onGestureWorklet | 手势识别成功的回调 |  | ✔️ |  |
| shouldAcceptGestureWorklet | 手势是否应该被识别 |  | ✔️ |  |
| simultaneousHandlers | 声明可同时触发的手势节点 |  | ✔️ |  |
| nativeView | 代理的原生节点类型 |  | ✔️ |  |

## HorizontalDragGestureHandler

[查看 Taro 文档](https://docs.taro.zone/docs/components/gesture/horizontal-drag-gesture-handler)

横向滑动时触发手势
微信小程序下 skyline 的手势标签，只能在 CompileMode 中使用

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| tag | 声明手势协商时的组件标识 |  | ✔️ |  |
| onGestureWorklet | 手势识别成功的回调 |  | ✔️ |  |
| shouldResponseOnMoveWorklet | 手指移动过程中手势是否响应 |  | ✔️ |  |
| shouldAcceptGestureWorklet | 手势是否应该被识别 |  | ✔️ |  |
| simultaneousHandlers | 声明可同时触发的手势节点 |  | ✔️ |  |
| nativeView | 代理的原生节点类型 |  | ✔️ |  |

## LongPressGestureHandler

[查看 Taro 文档](https://docs.taro.zone/docs/components/gesture/long-press-gesture-handler)

长按时触发手势
微信小程序下 skyline 的手势标签，只能在 CompileMode 中使用

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| tag | 声明手势协商时的组件标识 |  | ✔️ |  |
| onGestureWorklet | 手势识别成功的回调 |  | ✔️ |  |
| shouldResponseOnMoveWorklet | 手指移动过程中手势是否响应 |  | ✔️ |  |
| shouldAcceptGestureWorklet | 手势是否应该被识别 |  | ✔️ |  |
| simultaneousHandlers | 声明可同时触发的手势节点 |  | ✔️ |  |
| nativeView | 代理的原生节点类型 |  | ✔️ |  |

## PanGestureHandler

[查看 Taro 文档](https://docs.taro.zone/docs/components/gesture/pan-gesture-handler)

拖动（横向/纵向）时触发手势
微信小程序下 skyline 的手势标签，只能在 CompileMode 中使用

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| tag | 声明手势协商时的组件标识 |  | ✔️ |  |
| onGestureWorklet | 手势识别成功的回调 |  | ✔️ |  |
| shouldResponseOnMoveWorklet | 手指移动过程中手势是否响应 |  | ✔️ |  |
| shouldAcceptGestureWorklet | 手势是否应该被识别 |  | ✔️ |  |
| simultaneousHandlers | 声明可同时触发的手势节点 |  | ✔️ |  |
| nativeView | 代理的原生节点类型 |  | ✔️ |  |

## ScaleGestureHandler

[查看 Taro 文档](https://docs.taro.zone/docs/components/gesture/scale-gesture-handler)

多指缩放时触发手势
微信小程序下 skyline 的手势标签，只能在 CompileMode 中使用

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| tag | 声明手势协商时的组件标识 |  | ✔️ |  |
| onGestureWorklet | 手势识别成功的回调 |  | ✔️ |  |
| shouldResponseOnMoveWorklet | 手指移动过程中手势是否响应 |  | ✔️ |  |
| shouldAcceptGestureWorklet | 手势是否应该被识别 |  | ✔️ |  |
| simultaneousHandlers | 声明可同时触发的手势节点 |  | ✔️ |  |
| nativeView | 代理的原生节点类型 |  | ✔️ |  |

## TapGestureHandler

[查看 Taro 文档](https://docs.taro.zone/docs/components/gesture/tap-gesture-handler)

点击时触发手势
微信小程序下 skyline 的手势标签，只能在 CompileMode 中使用

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| tag | 声明手势协商时的组件标识 |  | ✔️ |  |
| onGestureWorklet | 手势识别成功的回调 |  | ✔️ |  |
| shouldResponseOnMoveWorklet | 手指移动过程中手势是否响应 |  | ✔️ |  |
| shouldAcceptGestureWorklet | 手势是否应该被识别 |  | ✔️ |  |
| simultaneousHandlers | 声明可同时触发的手势节点 |  | ✔️ |  |
| nativeView | 代理的原生节点类型 |  | ✔️ |  |

## VerticalDragGestureHandler

[查看 Taro 文档](https://docs.taro.zone/docs/components/gesture/vertical-drag-gesture-handler)

纵向滑动时触发手势
微信小程序下 skyline 的手势标签，只能在 CompileMode 中使用

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| tag | 声明手势协商时的组件标识 |  | ✔️ |  |
| onGestureWorklet | 手势识别成功的回调 |  | ✔️ |  |
| shouldResponseOnMoveWorklet | 手指移动过程中手势是否响应 |  | ✔️ |  |
| shouldAcceptGestureWorklet | 手势是否应该被识别 |  | ✔️ |  |
| simultaneousHandlers | 声明可同时触发的手势节点 |  | ✔️ |  |
| nativeView | 代理的原生节点类型 |  | ✔️ |  |

## FunctionalPageNavigator

[查看 Taro 文档](https://docs.taro.zone/docs/components/navig/functional-page-navigator)

仅在插件中有效，用于跳转到插件功能页

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| version | 跳转到的小程序版本，有效值 develop（开发版），trial（体验版），release（正式版）；线上版本必须设置为 release | `"release"` | ✔️ |  |
| name | 要跳转到的功能页 |  | ✔️ |  |
| args | 功能页参数，参数格式与具体功能页相关 |  | ✔️ |  |
| onSuccess | 功能页返回，且操作成功时触发， detail 格式与具体功能页相关 |  | ✔️ |  |
| onFail | 功能页返回，且操作失败时触发， detail 格式与具体功能页相关 |  | ✔️ |  |
| onCancel | 因用户操作从功能页返回时触发 |  | ✔️ |  |

#### Version

version 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| develop | 开发版 |  |  |  |
| trial | 体验版 |  |  |  |
| release | 正式版 |  |  |  |

#### Name

name 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| loginAndGetUserInfo | [用户信息功能页](https://developers.weixin.qq.com/miniprogram/dev/framework/plugin/functional-pages/user-info.html) |  |  |  |
| requestPayment | [支付功能页](https://developers.weixin.qq.com/miniprogram/dev/framework/plugin/functional-pages/request-payment.html) |  |  |  |
| chooseAddress | [收货地址功能页](https://developers.weixin.qq.com/miniprogram/dev/framework/plugin/functional-pages/choose-address.html) |  |  |  |

## NavigationBar

[查看 Taro 文档](https://docs.taro.zone/docs/components/navig/navigation-bar)

页面导航条配置节点，用于指定导航栏的一些属性。只能是 PageMeta 组件内的第一个节点，需要配合它一同使用。
通过这个节点可以获得类似于调用 Taro.setNavigationBarTitle Taro.setNavigationBarColor 等接口调用的效果。

:::info
Taro v3.6.19 开始支持
需要配合 PageMeta 组件使用
:::

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| title | 导航条标题 |  | ✔️ |  |
| loading | 是否在导航条显示 loading 加载提示 |  | ✔️ |  |
| frontColor | 导航条前景颜色值，包括按钮、标题、状态栏的颜色，仅支持 #ffffff 和 #000000 |  | ✔️ |  |
| backgroundColor | 导航条背景颜色值，有效值为十六进制颜色 |  | ✔️ |  |
| colorAnimationDuration | 改变导航栏颜色时的动画时长，默认为 0 （即没有动画效果） | `0` | ✔️ |  |
| colorAnimationTimingFunc | 改变导航栏颜色时的动画方式，支持 linear 、 easeIn 、 easeOut 和 easeInOut | `"linear"` | ✔️ |  |

## Navigator

[查看 Taro 文档](https://docs.taro.zone/docs/components/navig/navigator)

页面链接

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| target | 在哪个目标上发生跳转，默认当前小程序 | `"self"` | ✔️ |  |
| url | 当前小程序内的跳转链接 |  | ✔️ | ✔️ |
| openType | 跳转方式 | `"navigate"` | ✔️ | ✔️ |
| delta | 当 open-type 为 'navigateBack' 时有效，表示回退的层数 |  | ✔️ | ✔️ |
| appId | 当 `target="miniProgram"` 时有效，要打开的小程序 appId |  | ✔️ |  |
| path | 当 `target="miniProgram"` 时有效，打开的页面路径，如果为空则打开首页 |  | ✔️ |  |
| extraData | 当 `target="miniProgram"` 时有效，需要传递给目标小程序的数据，目标小程序可在 `App.onLaunch()`，`App.onShow()` 中获取到这份数据. |  | ✔️ |  |
| version | 当 `target="miniProgram"` 时有效，要打开的小程序版本 |  | ✔️ |  |
| hoverClass | 指定按下去的样式类。当 `hover-class="none"` 时，没有点击态效果 | `"navigator-hover"` | ✔️ | ✔️ |
| hoverStopPropagation | 指定是否阻止本节点的祖先节点出现点击态 | `false` | ✔️ |  |
| hoverStartTime | 按住后多久出现点击态，单位毫秒 | `50` | ✔️ |  |
| hoverStayTime | 手指松开后点击态保留时间，单位毫秒 | `600` | ✔️ |  |
| shortLink | 当target="miniProgram"时有效，当传递该参数后，可以不传 app-id 和 path。链接可以通过【小程序菜单】->【复制链接】获取。 |  | ✔️ |  |
| onSuccess | 当 `target="miniProgram"` 时有效，跳转小程序成功 |  | ✔️ | ✔️ |
| onFail | 当 `target="miniProgram"` 时有效，跳转小程序失败 |  | ✔️ | ✔️ |
| onComplete | 当 `target="miniProgram"` 时有效，跳转小程序完成 |  | ✔️ | ✔️ |

#### Target

target 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| self | 当前小程序 |  |  |  |
| miniProgram | 其它小程序 |  |  |  |

#### OpenType

open-type 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| navigate | 对应 Taro.navigateTo 或 Taro.navigateToMiniProgram 的功能 |  |  |  |
| redirect | 对应 Taro.redirectTo 的功能 |  |  |  |
| switchTab | 对应 Taro.switchTab 的功能 |  |  |  |
| reLaunch | 对应 Taro.reLaunch 的功能 |  |  |  |
| navigateBack | 对应 Taro.navigateBack 的功能 |  |  |  |
| exit | 退出小程序，`target="miniProgram"` 时生效 |  |  |  |

#### Version

version 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| develop | 开发版 |  |  |  |
| trial | 体验版 |  |  |  |
| release | 正式版，仅在当前小程序为开发版或体验版时此参数有效；如果当前小程序是正式版，则打开的小程序必定是正式版。 |  |  |  |

## Audio

[查看 Taro 文档](https://docs.taro.zone/docs/components/media/audio)

音频。1.6.0版本开始，该组件不再维护。建议使用能力更强的 Taro.createInnerAudioContext 接口

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| id | audio 组件的唯一标识符 |  | ✔️ |  |
| src | 要播放音频的资源地址 |  | ✔️ | ✔️ |
| loop | 是否循环播放 | `false` | ✔️ | ✔️ |
| muted | 是否静音播放 | `false` |  | ✔️ |
| controls | 是否显示默认控件 | `false` | ✔️ | ✔️ |
| poster | 默认控件上的音频封面的图片资源地址，如果 controls 属性值为 false 则设置 poster 无效 |  | ✔️ |  |
| name | 默认控件上的音频名字，如果 controls 属性值为 false 则设置 name 无效 | `"未知音频"` | ✔️ |  |
| author | 默认控件上的作者名字，如果 controls 属性值为 false 则设置 author 无效 | `"未知作者"` | ✔️ |  |
| nativeProps | 用于透传 `WebComponents` 上的属性到内部 H5 标签上 |  |  | ✔️ |
| onError | 当发生错误时触发 error 事件，detail = {errMsg: MediaError.code} |  | ✔️ | ✔️ |
| onPlay | 当开始/继续播放时触发play事件 |  | ✔️ | ✔️ |
| onPause | 当暂停播放时触发 pause 事件 |  | ✔️ | ✔️ |
| onTimeUpdate | 当播放进度改变时触发 timeupdate 事件，detail = {currentTime, duration} |  | ✔️ | ✔️ |
| onEnded | 当播放到末尾时触发 ended 事件 |  | ✔️ | ✔️ |

#### onErrorEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| errMsg |  |  |  |  |

#### onTimeUpdateEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| currentTime | 当前时间 |  |  |  |
| duration | 持续时间 |  |  |  |

#### MediaError

##### Code

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| 1 | 获取资源被用户禁止 |  |  |  |
| 2 | 网络错误 |  |  |  |
| 3 | 解码错误 |  |  |  |
| 4 | 不合适资源 |  |  |  |

## Camera

[查看 Taro 文档](https://docs.taro.zone/docs/components/media/camera)

系统相机

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| mode | 模式，有效值为normal, scanCode | `"normal"` | ✔️ |  |
| resolution | 分辨率，不支持动态修改 | `"medium"` | ✔️ |  |
| devicePosition | 摄像头朝向 | `"back"` | ✔️ |  |
| flash | 闪光灯 | `"auto"` | ✔️ |  |
| frameSize | 指定期望的相机帧数据尺寸 | `"medium"` | ✔️ |  |
| onStop | 摄像头在非正常终止时触发，<br />如退出后台等情况 |  | ✔️ |  |
| onError | 用户不允许使用摄像头时触发 |  | ✔️ |  |
| onInitDone | 相机初始化完成时触发 |  | ✔️ |  |
| onScanCode | 在成功识别到一维码时触发，<br />仅在 mode="scanCode" 时生效 |  | ✔️ |  |

#### Mode

mode 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| normal | 相机模式 |  |  |  |
| scanCode | 扫码模式 |  |  |  |

#### Resolution

resolution 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| low | 低 |  |  |  |
| medium | 中 |  |  |  |
| high | 高 |  |  |  |

#### DevicePosition

device-position 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| front | 前置 |  |  |  |
| back | 后置 |  |  |  |

#### Flash

flash 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| auto | 自动 |  |  |  |
| on | 打开 |  |  |  |
| off | 关闭 |  |  |  |
| torch | 常亮 |  |  |  |

#### FrameSize

frame-size 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| small | 小尺寸帧数据 |  |  |  |
| medium | 中尺寸帧数据 |  |  |  |
| large | 大尺寸帧数据 |  |  |  |

#### onInitDoneEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| maxZoom | 最大变焦 |  |  |  |

#### onScanCodeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| charSet | 字符集 |  |  |  |
| rawData | 原始数据 |  | ✔️ |  |
| type | 码类型 |  |  |  |
| result | 识别结果 |  |  |  |

## ChannelLive

[查看 Taro 文档](https://docs.taro.zone/docs/components/media/channel-live)

小程序内嵌视频号直播组件，展示视频号直播状态和封面，并无弹窗跳转至视频号。注意：使用该组件打开的视频号视频需要与小程序的主体一致。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| feedId | 视频 feedId |  | ✔️ |  |
| finderUserName | 视频号 id，以“sph”开头的id，可在视频号助手获取。视频号必须与当前小程序相同主体。 |  | ✔️ |  |

## ChannelVideo

[查看 Taro 文档](https://docs.taro.zone/docs/components/media/channel-video)

小程序内嵌视频号视频组件，支持在小程序中播放视频号视频，并无弹窗跳转至视频号。注意：使用该组件打开的视频号视频需要与小程序相同主体或关联主体。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| feedId | 仅视频号视频与小程序同主体时生效。若内嵌非同主体视频，请使用 feed-token。 |  | ✔️ |  |
| finderUserName | 视频号 id，以“sph”开头的id，可在视频号助手获取。视频号必须与当前小程序相同主体。 |  | ✔️ |  |
| loop | 是否循环播放 | `false` | ✔️ |  |
| muted | 是否静音播放 | `false` | ✔️ |  |
| objectFit | 当视频大小与 video 容器大小不一致时，视频的表现形式 | `"contain"` | ✔️ |  |
| autoplay | 是否自动播放 | `false` | ✔️ |  |
| feedToken | 仅内嵌小程序非同主体视频号视频时使用，获取方式参考[本指引](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/channels-activity.html#feed-token)。 |  | ✔️ |  |
| onError | 视频播放出错时触发 |  | ✔️ |  |

## Image

[查看 Taro 文档](https://docs.taro.zone/docs/components/media/image)

图片。支持 JPG、PNG、SVG、WEBP、GIF 等格式以及云文件ID。

**Note:** 为实现小程序的 `mode` 特性，在 H5 组件中使用一个 `div` 容器来对内部的 `img` 进行展示区域的裁剪，因此请勿使用元素选择器来重置 `img` 的样式！

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| src | 图片资源地址 |  | ✔️ | ✔️ |
| mode | 图片裁剪、缩放的模式 | `"scaleToFill"` | ✔️ | ✔️ |
| webp | 默认不解析 webP 格式，只支持网络资源 | `false` | ✔️ |  |
| lazyLoad | 图片懒加载。只针对 page 与 scroll-view 下的 image 有效 | `false` | ✔️ | ✔️ |
| showMenuByLongpress | 开启长按图片显示识别小程序码菜单 | `false` | ✔️ |  |
| imgProps | 为 img 标签额外增加的属性 |  |  | ✔️ |
| nativeProps | 用于透传 `WebComponents` 上的属性到内部 H5 标签上 |  |  | ✔️ |
| fadeIn | 是否渐显 | `false` | ✔️ |  |
| onError | 当错误发生时，发布到 AppService 的事件名，事件对象 |  | ✔️ | ✔️ |
| onLoad | 当图片载入完毕时，发布到 AppService 的事件名，事件对象 |  | ✔️ | ✔️ |

#### Mode

mode 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| scaleToFill | 缩放模式，不保持纵横比缩放图片，使图片的宽高完全拉伸至填满 image 元素 |  |  |  |
| aspectFit | 缩放模式，保持纵横比缩放图片，使图片的长边能完全显示出来。也就是说，可以完整地将图片显示出来。 |  |  |  |
| aspectFill | 缩放模式，保持纵横比缩放图片，只保证图片的短边能完全显示出来。也就是说，图片通常只在水平或垂直方向是完整的，另一个方向将会发生截取。 |  |  |  |
| widthFix | 缩放模式，宽度不变，高度自动变化，保持原图宽高比不变 |  |  |  |
| heightFix | 缩放模式，高度不变，宽度自动变化，保持原图宽高比不变 |  |  |  |
| top | 裁剪模式，不缩放图片，只显示图片的顶部区域 |  |  |  |
| bottom | 裁剪模式，不缩放图片，只显示图片的底部区域 |  |  |  |
| center | 裁剪模式，不缩放图片，只显示图片的中间区域 |  |  |  |
| left | 裁剪模式，不缩放图片，只显示图片的左边区域 |  |  |  |
| right | 裁剪模式，不缩放图片，只显示图片的右边区域 |  |  |  |
| top left | 裁剪模式，不缩放图片，只显示图片的左上边区域 |  |  |  |
| top right | 裁剪模式，不缩放图片，只显示图片的右上边区域 |  |  |  |
| bottom left | 裁剪模式，不缩放图片，只显示图片的左下边区域 |  |  |  |
| bottom right | 裁剪模式，不缩放图片，只显示图片的右下边区域 |  |  |  |

#### onErrorEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| errMsg | 错误信息 |  |  |  |

#### onLoadEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| height | 图片高度 |  |  |  |
| width | 图片宽度 |  |  |  |

## LivePlayer

[查看 Taro 文档](https://docs.taro.zone/docs/components/media/live-player)

实时音视频播放。相关api：Taro.createLivePlayerContext

需要先通过类目审核，再在小程序管理后台，“设置”-“接口设置”中自助开通该组件权限。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| src | 音视频地址。目前仅支持 flv, rtmp 格式 |  | ✔️ |  |
| mode | 模式 | `"live"` | ✔️ |  |
| autoplay | 自动播放 | `false` | ✔️ |  |
| muted | 是否静音 | `false` | ✔️ |  |
| orientation | 画面方向 | `"vertical"` | ✔️ |  |
| objectFit | 填充模式 | `"contain"` | ✔️ |  |
| backgroundMute | 进入后台时是否静音（已废弃，默认退台静音）<br />**不推荐使用** | `false` | ✔️ |  |
| minCache | 最小缓冲区，单位s | `1` | ✔️ |  |
| maxCache | 最大缓冲区，单位s | `3` | ✔️ |  |
| soundMode | 声音输出方式 | `"speaker"` | ✔️ |  |
| autoPauseIfNavigate | 当跳转到本小程序的其他页面时，是否自动暂停本页面的实时音视频播放 | `true` | ✔️ |  |
| pictureInPictureMode | 设置小窗模式： push, pop，空字符串或通过数组形式设置多种模式（如： ["push", "pop"]） |  | ✔️ |  |
| autoPauseIfOpenNative | 当跳转到其它微信原生页面时，是否自动暂停本页面的实时音视频播放 | `true` | ✔️ |  |
| referrerPolicy | 格式固定为 https://servicewechat.com/{appid}/{version}/page-frame.html ，其中 {appid} 为小程序的 appid，{version} 为小程序的版本号，版本号为 0 表示为开发版、体验版以及审核版本，版本号为 devtools 表示为开发者工具，其余为正式版本； | `'no-referrer'` | ✔️ |  |
| enableAutoRotation | 是否开启手机横屏时自动全屏，当系统设置开启自动旋转时生效 | `false` | ✔️ |  |
| enableCasting | 是否支持投屏。开启后，可以通过 LivePlayerContext 上相关方法进行操作。 | `false` | ✔️ |  |
| onStateChange | 播放状态变化事件，detail = {code} |  | ✔️ |  |
| onFullScreenChange | 全屏变化事件，detail = {direction, fullScreen} |  | ✔️ |  |
| onNetStatus | 网络状态通知，detail = {info} |  | ✔️ |  |
| onAudioVolumeNotify | 播放音量大小通知，detail = {} |  | ✔️ |  |
| onEnterPictureInPicture | 播放器进入小窗 |  | ✔️ |  |
| onLeavePictureInPicture | 播放器退出小窗 |  | ✔️ |  |
| onCastingUserSelect | 用户选择投屏设备时触发 detail = { state: "success"/"fail" } |  | ✔️ |  |
| onCastingStateChange | 投屏成功/失败时触发 detail = { type, state: "success"/"fail" } |  | ✔️ |  |
| onCastingInterrupt | 投屏被中断时触发 |  | ✔️ |  |

#### Mode

mode 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| live | 直播 |  |  |  |
| RTC | 实时通话，该模式时延更低 |  |  |  |

#### Orientation

orientation 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| vertical | 竖直 |  |  |  |
| horizontal | 水平 |  |  |  |

#### objectFit

objectFit 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| contain | 图像长边填满屏幕，短边区域会被填充⿊⾊ |  |  |  |
| fillCrop | 图像铺满屏幕，超出显示区域的部分将被截掉 |  |  |  |

#### soundMode

soundMode 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| speaker | 扬声器 |  |  |  |
| ear | 听筒 |  |  |  |

#### onStateChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| code | 状态码 |  |  |  |

#### onFullScreenChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| direction | 方向 |  |  |  |
| fullScreen | 全屏 |  |  |  |

#### onNetStatusEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| info |  |  |  |  |

#### Status

状态码

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| 2001 | 已经连接服务器 |  |  |  |
| 2002 | 已经连接 RTMP 服务器,开始拉流 |  |  |  |
| 2003 | 网络接收到首个视频数据包(IDR) |  |  |  |
| 2004 | 视频播放开始 |  |  |  |
| 2005 | 视频播放进度 |  |  |  |
| 2006 | 视频播放结束 |  |  |  |
| 2007 | 视频播放Loading |  |  |  |
| 2008 | 解码器启动 |  |  |  |
| 2009 | 视频分辨率改变 |  |  |  |
| -2301 | 网络断连，且经多次重连抢救无效，更多重试请自行重启播放 |  |  |  |
| -2302 | 获取加速拉流地址失败 |  |  |  |
| 2101 | 当前视频帧解码失败 |  |  |  |
| 2102 | 当前音频帧解码失败 |  |  |  |
| 2103 | 网络断连, 已启动自动重连 |  |  |  |
| 2104 | 网络来包不稳：可能是下行带宽不足，或由于主播端出流不均匀 |  |  |  |
| 2105 | 当前视频播放出现卡顿 |  |  |  |
| 2106 | 硬解启动失败，采用软解 |  |  |  |
| 2107 | 当前视频帧不连续，可能丢帧 |  |  |  |
| 2108 | 当前流硬解第一个I帧失败，SDK自动切软解 |  |  |  |
| 3001 | RTMP -DNS解析失败 |  |  |  |
| 3002 | RTMP服务器连接失败 |  |  |  |
| 3003 | RTMP服务器握手失败 |  |  |  |
| 3005 | RTMP 读/写失败 |  |  |  |

## LivePusher

[查看 Taro 文档](https://docs.taro.zone/docs/components/media/live-pusher)

实时音视频录制。需要用户授权 scope.camera、scope.record
需要先通过类目审核，再在小程序管理后台，「开发」-「接口设置」中自助开通该组件权限。

实时音视频录制。
需要用户授权 scope.camera、scope.record
暂只针对国内主体如下类目的小程序开放，需要先通过类目审核，再在小程序管理后台，“设置”-“接口设置”中自助开通该组件权限。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| url | 推流地址。目前仅支持 rtmp 格式 |  | ✔️ |  |
| mode | SD（标清）, HD（高清）, FHD（超清）, RTC（实时通话） | `"RTC"` | ✔️ |  |
| autopush | 自动推流 | `false` | ✔️ |  |
| enableVideoCustomRender | 自定义渲染，允许开发者自行处理所采集的视频帧 | `false` | ✔️ |  |
| muted | 是否静音。即将废弃，可用 enable-mic 替代<br />**不推荐使用** | `false` | ✔️ |  |
| enableCamera | 开启摄像头 | `true` | ✔️ |  |
| autoFocus | 自动聚集 | `true` | ✔️ |  |
| orientation | 画面方向 | `"vertical"` | ✔️ |  |
| beauty | 美颜，取值范围 0-9 ，0 表示关闭 | `0` | ✔️ |  |
| whiteness | 美白，取值范围 0-9 ，0 表示关闭 | `0` | ✔️ |  |
| aspect | 宽高比，可选值有 3:4, 9:16 | `"9:16"` | ✔️ |  |
| minBitrate | 最小码率 | `200` | ✔️ |  |
| maxBitrate | 最大码率 | `1000` | ✔️ |  |
| audioQuality | 高音质(48KHz)或低音质(16KHz)，值为high, low | `"high"` | ✔️ |  |
| waitingImage | 进入后台时推流的等待画面 |  | ✔️ |  |
| waitingImageHash | 等待画面资源的MD5值 |  | ✔️ |  |
| zoom | 调整焦距 | `false` | ✔️ |  |
| devicePosition | 前置或后置，值为front, back | `"front"` | ✔️ |  |
| backgroundMute | 进入后台时是否静音 | `false` | ✔️ |  |
| mirror | 设置推流画面是否镜像，产生的效果在 LivePlayer 反应到 | `false` | ✔️ |  |
| remoteMirror | 设置推流画面是否镜像，产生的效果在 LivePlayer 反应到<br /><br />**Note:** 同 mirror 属性，后续 mirror 将废弃 | `false` | ✔️ |  |
| localMirror | 控制本地预览画面是否镜像 | `"auto"` | ✔️ |  |
| audioReverbType | 音频混响类型 | `0` | ✔️ |  |
| enableMic | 开启或关闭麦克风 | `true` | ✔️ |  |
| enableAgc | 是否开启音频自动增益 | `false` | ✔️ |  |
| enableAns | 是否开启音频噪声抑制 | `false` | ✔️ |  |
| audioVolumeType | 音量类型 | `"voicecall"` | ✔️ |  |
| videoWidth | 上推的视频流的分辨率宽度 | `360` | ✔️ |  |
| videoHeight | 上推的视频流的分辨率高度 | `640` | ✔️ |  |
| beautyStyle | 设置美颜类型 | `smooth` | ✔️ |  |
| filter | 设置色彩滤镜 | `standard` | ✔️ |  |
| pictureInPictureMode | 设置小窗模式： push, pop，空字符串或通过数组形式设置多种模式（如： ["push", "pop"]） |  | ✔️ |  |
| customEffect | 是否启动自定义特效，设定后不能更改 | `false` | ✔️ |  |
| skinWhiteness | 自定义特效美白效果，取值 0~1。需要开启 custom-effect | `0` | ✔️ |  |
| skinSmoothness | 自定义特效磨皮效果，取值 0~1。需要开启 custom-effect | `0` | ✔️ |  |
| faceThinness | 自定义特效瘦脸效果，取值 0~1。需要开启 custom-effect | `0` | ✔️ |  |
| eyeBigness | 自定义特效大眼效果，取值 0~1。需要开启 custom-effect | `0` | ✔️ |  |
| voiceChangerType | 0：关闭变声；1：熊孩子；2：萝莉；3：大叔；4：重金属；6：外国人；7：困兽；8：死肥仔；9：强电流；10：重机械；11：空灵 | `0` | ✔️ |  |
| fps | 帧率，有效值为 1~30 | `15` | ✔️ |  |
| onStateChange | 状态变化事件，detail = {code} |  | ✔️ |  |
| onError | 渲染错误事件，detail = {errMsg, errCode} |  | ✔️ |  |
| onBgmProgress | 背景音进度变化时触发，detail = {progress, duration} |  | ✔️ |  |
| onBgmComplete | 背景音播放完成时触发 |  | ✔️ |  |
| onAudioVolumeNotify | 返回麦克风采集的音量大小 |  | ✔️ |  |
| onNetStatus | 网络状态通知，detail = {info} |  | ✔️ |  |
| onEnterPictureInPicture | 进入小窗 |  | ✔️ |  |
| onLeavePictureInPicture | 退出小窗 |  | ✔️ |  |
| onBgmStart | 背景音开始播放时触发 |  | ✔️ |  |

#### Orientation

orientation 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| vertical | 竖直 |  |  |  |
| horizontal | 水平 |  |  |  |

#### LocalMirror

localMirror 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| auto | 前置摄像头镜像，后置摄像头不镜像 |  |  |  |
| enable | 前后置摄像头均镜像 |  |  |  |
| disable | 前后置摄像头均不镜像 |  |  |  |

#### AudioReverbType

audioReverbType 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| 0 | 关闭 |  |  |  |
| 1 | KTV |  |  |  |
| 2 | 小房间 |  |  |  |
| 3 | 大会堂 |  |  |  |
| 4 | 低沉 |  |  |  |
| 5 | 洪亮 |  |  |  |
| 6 | 金属声 |  |  |  |
| 7 | 磁性 |  |  |  |

#### AudioVolumeType

audioVolumeType 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| auto | 自动 |  |  |  |
| media | 媒体音量 |  |  |  |
| voicecall | 通话音量 |  |  |  |

#### BeautyStyleType

beautyStyleType 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| smooth | 光滑美颜 |  |  |  |
| nature | 自然美颜 |  |  |  |

#### FilterType

filterType 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| standard | 标准 |  |  |  |
| pink | 粉嫩 |  |  |  |
| nostalgia | 怀旧 |  |  |  |
| blues | 蓝调 |  |  |  |
| romantic | 浪漫 |  |  |  |
| cool | 清凉 |  |  |  |
| fresher | 清新 |  |  |  |
| solor | 日系 |  |  |  |
| aestheticism | 唯美 |  |  |  |
| whitening | 美白 |  |  |  |
| cerisered | 樱红 |  |  |  |

#### onStateChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| code | 状态码 |  |  |  |

#### onNetstatusEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| info | 网络状态 |  |  |  |

#### onErrorEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| errMsg | 错误信息 |  |  |  |
| errCode | 错误码 |  |  |  |

#### onBgmProgressEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| progress | 进展 |  |  |  |
| duration | 持续时间 |  |  |  |

## Video

[查看 Taro 文档](https://docs.taro.zone/docs/components/media/video)

视频。相关api：Taro.createVideoContext

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| src | 要播放视频的资源地址 |  | ✔️ | ✔️ |
| duration | 指定视频时长 |  | ✔️ | ✔️ |
| controls | 是否显示默认播放控件（播放/暂停按钮、播放进度、时间） | `true` | ✔️ | ✔️ |
| danmuList | 弹幕列表 |  | ✔️ | ✔️ |
| danmuBtn | 是否显示弹幕按钮，只在初始化时有效，不能动态变更 | `false` | ✔️ | ✔️ |
| enableDanmu | 是否展示弹幕，只在初始化时有效，不能动态变更 | `false` | ✔️ | ✔️ |
| autoplay | 是否自动播放 | `false` | ✔️ | ✔️ |
| loop | 是否循环播放 | `false` | ✔️ | ✔️ |
| muted | 是否静音播放 | `false` | ✔️ | ✔️ |
| initialTime | 指定视频初始播放位置 |  | ✔️ | ✔️ |
| pageGesture | 在非全屏模式下，是否开启亮度与音量调节手势 | `false` | ✔️ |  |
| direction | 设置全屏时视频的方向，不指定则根据宽高比自动判断。有效值为 0（正常竖向）, 90（屏幕逆时针90度）, -90（屏幕顺时针90度） |  | ✔️ |  |
| showProgress | 若不设置，宽度大于240时才会显示 | `true` | ✔️ | ✔️ |
| showFullscreenBtn | 是否显示全屏按钮 | `true` | ✔️ | ✔️ |
| showPlayBtn | 是否显示视频底部控制栏的播放按钮 | `true` | ✔️ | ✔️ |
| showCenterPlayBtn | 是否显示视频中间的播放按钮 | `true` | ✔️ | ✔️ |
| enableProgressGesture | 是否开启控制进度的手势 | `true` | ✔️ | ✔️ |
| objectFit | 当视频大小与 video 容器大小不一致时，视频的表现形式 | `"contain"` | ✔️ | ✔️ |
| poster | 视频封面的图片网络资源地址，如果 controls 属性值为 false 则设置 poster 无效 |  | ✔️ | ✔️ |
| showMuteBtn | 是否显示静音按钮 | `false` | ✔️ | ✔️ |
| title | 视频的标题，全屏时在顶部展示 |  | ✔️ |  |
| playBtnPosition | 播放按钮的位置<br />- `bottom`: controls bar 上<br />- `center`: 视频中间 | `'bottom'` | ✔️ |  |
| enablePlayGesture | 是否开启播放手势，即双击切换播放/暂停 | `false` | ✔️ | ✔️ |
| autoPauseIfNavigate | 当跳转到其它小程序页面时，是否自动暂停本页面的视频 | `true` | ✔️ |  |
| autoPauseIfOpenNative | 当跳转到其它微信原生页面时，是否自动暂停本页面的视频 | `true` | ✔️ |  |
| vslideGesture | 在非全屏模式下，是否开启亮度与音量调节手势（同 `page-gesture`） | `false` | ✔️ | ✔️ |
| vslideGestureInFullscreen | 在全屏模式下，是否开启亮度与音量调节手势 | `true` | ✔️ | ✔️ |
| adUnitId | 视频前贴广告单元ID，更多详情可参考开放能力[视频前贴广告](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/ad/video-patch-ad.html) |  | ✔️ |  |
| posterForCrawler | 用于给搜索等场景作为视频封面展示，建议使用无播放 icon 的视频封面图，只支持网络地址 |  | ✔️ |  |
| showCastingButton | 显示投屏按钮。只安卓且同层渲染下生效，支持 DLNA 协议 |  | ✔️ |  |
| pictureInPictureMode | 设置小窗模式： push, pop，空字符串或通过数组形式设置多种模式（如： ["push", "pop"]） |  | ✔️ |  |
| enableAutoRotation | 是否开启手机横屏时自动全屏，当系统设置开启自动旋转时生效 |  | ✔️ |  |
| showScreenLockButton | 是否显示锁屏按钮，仅在全屏时显示，锁屏后控制栏的操作 |  | ✔️ |  |
| showSnapshotButton | 是否显示截屏按钮，仅在全屏时显示 |  | ✔️ |  |
| showBackgroundPlaybackButton | 是否展示后台音频播放按钮 |  | ✔️ |  |
| backgroundPoster | 进入后台音频播放后的通知栏图标（Android 独有） |  | ✔️ |  |
| nativeProps | 用于透传 `WebComponents` 上的属性到内部 H5 标签上 |  |  | ✔️ |
| showBottomProgress | 是否展示底部进度条 | `true` | ✔️ |  |
| pictureInPictureShowProgress | 是否在小窗模式下显示播放进度 |  | ✔️ |  |
| referrerPolicy | 格式固定为 https://servicewechat.com/{appid}/{version}/page-frame.html，其中 {appid} 为小程序的 appid，{version} 为小程序的版本号，版本号为 0 表示为开发版、体验版以及审核版本，版本号为 devtools 表示为开发者工具，其余为正式版本； |  | ✔️ |  |
| isDrm | 是否是 DRM 视频源 |  | ✔️ |  |
| provisionUrl | DRM 设备身份认证 url，仅 is-drm 为 true 时生效 (Android) |  | ✔️ |  |
| certificateUrl | DRM 设备身份认证 url，仅 is-drm 为 true 时生效 (iOS) |  | ✔️ |  |
| licenseUrl | DRM 获取加密信息 url，仅 is-drm 为 true 时生效 |  | ✔️ |  |
| preferredPeakBitRate | 指定码率上界，单位为比特每秒 |  | ✔️ |  |
| isLive | 是否为直播源 |  | ✔️ |  |
| onPlay | 当开始/继续播放时触发 play 事件 |  | ✔️ | ✔️ |
| onPause | 当暂停播放时触发 pause 事件 |  | ✔️ | ✔️ |
| onEnded | 当播放到末尾时触发 ended 事件 |  | ✔️ | ✔️ |
| onTimeUpdate | 播放进度变化时触发, 触发频率 250ms 一次 |  | ✔️ | ✔️ |
| onFullscreenChange | 当视频进入和退出全屏时触发 |  |  | ✔️ |
| onWaiting | 视频出现缓冲时触发 |  | ✔️ |  |
| onError | 视频播放出错时触发 |  | ✔️ | ✔️ |
| onProgress | 加载进度变化时触发，只支持一段加载 |  | ✔️ | ✔️ |
| onLoadedMetaData | 视频元数据加载完成时触发 |  | ✔️ |  |
| onEnterPictureInPicture | 播放器进入小窗 |  | ✔️ |  |
| onLeavePictureInPicture | 播放器退出小窗 |  | ✔️ |  |
| onSeekComplete | seek 完成时触发 |  | ✔️ |  |
| onFullScreenChange | 视频进入和退出全屏时触发 |  | ✔️ |  |
| onControlsToggle | 切换 controls 显示隐藏时触发。 |  | ✔️ |  |
| onCastingUserSelect | 用户选择投屏设备时触发 detail = { state: "success"/"fail" } |  | ✔️ |  |
| onCastingStateChange | 投屏成功/失败时触发 detail = { type, state: "success"/"fail" } |  | ✔️ |  |
| onCastingInterrupt | 投屏被中断时触发 |  | ✔️ |  |

#### direction

direction 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| 0 | 正常竖向 |  |  |  |
| 90 | 屏幕逆时针90度 |  |  |  |
| -90 | 屏幕顺时针90度 |  |  |  |

#### ObjectFit

objectFit 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| contain | 包含 |  |  |  |
| fill | 填充 |  |  |  |
| cover | 覆盖 |  |  |  |

#### PlayBtnPosition

playBtnPosition 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| bottom | controls bar上 |  |  |  |
| center | 视频中间 |  |  |  |

#### onTimeUpdateEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| currentTime | 当前时间 |  |  |  |
| duration | 持续时间 |  |  |  |

#### onFullscreenChangeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| direction | 方向 |  |  |  |
| fullScreen | 全屏 |  |  |  |

#### onWaitingEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| direction | 方向 |  |  |  |
| fullScreen | 全屏 |  |  |  |

#### onProgressEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| buffered | 百分比 |  |  |  |

#### onLoadedMetaDataEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| width | 视频宽度 |  |  |  |
| height | 视频高度 |  |  |  |
| duration | 持续时间 |  |  |  |

#### onControlsToggleEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| show | 是否显示 |  |  |  |

#### onTapEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| ptInView |  |  |  |  |

#### onUserActionEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| tag | 用户操作的元素 |  |  |  |
| value |  |  |  |  |

#### UserActionTag

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| play | 底部播放按钮 |  |  |  |
| centerplay | 中心播放按钮 |  |  |  |
| mute | 静音按钮 |  |  |  |
| fullscreen | 全屏按钮 |  |  |  |
| retry | 重试按钮 |  |  |  |
| mobilenetplay | 网络提醒的播放按钮 |  |  |  |

#### onAdTypeCommonEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| adType | 广告类型 |  |  |  |

## VoipRoom

[查看 Taro 文档](https://docs.taro.zone/docs/components/media/voip-room)

多人音视频对话

需用户授权 `scope.camera`、`scope.record`。相关接口： [Taro.joinVoIPChat](https://docs.taro.zone/docs/apis/media/voip/joinVoIPChat)
开通该组件权限后，开发者可在 joinVoIPChat 成功后，获取房间成员的 openid，传递给 voip-room 组件，以显示成员画面。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| mode | 对话窗口类型，自身传入 camera，其它用户传入 video | `camera` | ✔️ |  |
| devicePosition | 仅在 mode 为 camera 时有效，前置或后置，值为front, back | `front` | ✔️ |  |
| openId | 进入房间用户的 openid | `"none"` | ✔️ |  |
| objectFit | 画面与容器比例不一致时，画面的表现形式 | `"fill"` | ✔️ |  |
| onError | 创建对话窗口失败时触发 |  | ✔️ |  |

#### Mode

对话窗口类型

#### DevicePosition

摄像头类型

## Map

[查看 Taro 文档](https://docs.taro.zone/docs/components/maps/map)

地图。相关api Taro.createMapContext。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| longitude | 中心经度 |  | ✔️ |  |
| latitude | 中心纬度 |  | ✔️ |  |
| scale | 缩放级别，取值范围为 3-20 | `16` | ✔️ |  |
| minScale | 最小缩放级别 3-20 | `3` | ✔️ |  |
| maxScale | 最大缩放级别 3-20 | `20` | ✔️ |  |
| markers | 标记点 |  | ✔️ |  |
| covers | **即将移除，请使用 markers**<br />**不推荐使用** |  | ✔️ |  |
| polyline | 路线 |  | ✔️ |  |
| circles | 圆 |  | ✔️ |  |
| controls | 控件（即将废弃，建议使用 cover-view 代替）<br />**不推荐使用** |  | ✔️ |  |
| includePoints | 缩放视野以包含所有给定的坐标点 |  | ✔️ |  |
| showLocation | 显示带有方向的当前定位点 | `false` | ✔️ |  |
| polygons | 多边形 |  | ✔️ |  |
| subkey | 个性化地图使用的 key |  | ✔️ |  |
| layerStyle | 个性化地图配置的 style，不支持动态修改 | `1` | ✔️ |  |
| rotate | 旋转角度，范围 0 ~ 360, 地图正北和设备 y 轴角度的夹角 | `0` | ✔️ |  |
| skew | 倾斜角度，范围 0 ~ 40 , 关于 z 轴的倾角 | `0` | ✔️ |  |
| showCompass | 显示指南针 | `false` | ✔️ |  |
| showScale | 显示比例尺 | `false` | ✔️ |  |
| enableOverlooking | 开启俯视 | `false` | ✔️ |  |
| enableZoom | 是否支持缩放 | `true` | ✔️ |  |
| enableScroll | 是否支持拖动 | `true` | ✔️ |  |
| enableRotate | 是否支持旋转 | `false` | ✔️ |  |
| enableSatellite | 是否开启卫星图 | `false` | ✔️ |  |
| enableTraffic | 是否开启实时路况 | `false` | ✔️ |  |
| setting | 配置项<br /><br />提供 setting 对象统一设置地图配置。同时对于一些动画属性如 rotate 和 skew，通过 setData 分开设置时无法同时生效，需通过 settting 统一修改。 |  | ✔️ |  |
| enablePoi | 是否展示 POI 点 | `true` | ✔️ |  |
| enableBuilding | 是否展示建筑物 | `true` | ✔️ |  |
| enableAutoMaxOverlooking | 开启最大俯视角，俯视角度从 45 度拓展到 75 度 | `false` | ✔️ |  |
| enable3D | 展示3D楼块 | `false` | ✔️ |  |
| onTap | 点击地图时触发 |  | ✔️ |  |
| onMarkerTap | 点击标记点时触发，e.detail = {markerId} |  | ✔️ |  |
| onLabelTap | 点击label时触发，e.detail = {markerId} |  | ✔️ |  |
| onControlTap | 点击控件时触发，e.detail = {controlId} |  | ✔️ |  |
| onUpdated | 在地图渲染更新完成时触发 |  | ✔️ |  |
| onRegionChange | 视野发生变化时触发 |  | ✔️ |  |
| onPoiTap | 点击地图poi点时触发，e.detail = {name, longitude, latitude} |  | ✔️ |  |
| onPolylineTap | 点击地图路线时触发，e.detail = {longitude, latitude} |  | ✔️ |  |
| onAbilitySuccess | 地图能力生效时触发，e.detail = {ability, errCode, errMsg} |  | ✔️ |  |
| onAbilityFailed | 地图能力失败时触发，e.detail = {ability, errCode, errMsg} |  | ✔️ |  |
| onAuthSuccess | 地图鉴权结果成功时触发，e.detail = {errCode, errMsg} |  | ✔️ |  |
| onInterpolatePoint | MapContext.moveAlong 插值动画时触发。e.detail = {markerId, longitude, latitude, animationStatus: "interpolating" or "complete"} |  | ✔️ |  |
| onError | 组件错误时触发，例如创建或鉴权失败，e.detail = {longitude, latitude} |  | ✔️ |  |
| onCallOutTap | 点击标记点对应的气泡时触发e.detail = {markerId} |  | ✔️ |  |
| onAnchorPointTap | 点击定位标时触发，e.detail = {longitude, latitude} |  | ✔️ |  |

#### marker

标记点用于在地图上显示标记的位置

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| id | 标记点id<br />`marker 点击事件回调会返回此id。建议为每个 marker 设置上 Number 类型 id，保证更新 marker 时有更好的性能。` |  |  |  |
| latitude | 纬度<br />`浮点数，范围 -90 ~ 90` |  |  |  |
| longitude | 经度<br />`浮点数，范围 -180 ~ 180` |  |  |  |
| title | 标注点名<br />`点击时显示，callout 存在时将被忽略` |  |  |  |
| zIndex | 显示层级 |  |  |  |
| iconPath | 显示的图标<br />`项目目录下的图片路径，支持相对路径写法，以'/'开头则表示相对小程序根目录；也支持临时路径和网络图片` |  |  |  |
| rotate | 旋转角度<br />`顺时针旋转的角度，范围 0 ~ 360，默认为 0` |  |  |  |
| alpha | 标注的透明度<br />`默认1，无透明，范围 0 ~ 1` |  |  |  |
| width | 标注图标宽度<br />`默认为图片实际宽度` |  |  |  |
| height | 标注图标高度<br />`默认为图片实际高度` |  |  |  |
| callout | 标记点上方的气泡窗口<br />`支持的属性见下表，可识别换行符。` |  |  |  |
| customCallout | 自定义气泡窗口<br />`支持的属性见下表，可识别换行符。` |  |  |  |
| label | 为标记点旁边增加标签<br />`支持的属性见下表` |  |  |  |
| anchor | 经纬度在标注图标的锚点，默认底边中点<br />`{x, y}，x表示横向(0-1)，y表示竖向(0-1)。{x: .5, y: 1} 表示底边中点` |  |  |  |
| ariaLabel | 无障碍访问，（属性）元素的额外描述 |  |  |  |

#### callout

marker 上的气泡 callout

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| content | 文本 |  |  |  |
| color | 文本颜色 |  |  |  |
| fontSize | 文字大小 |  |  |  |
| anchorX | 横向偏移量，向右为正数 |  |  |  |
| anchorY | 纵向偏移量，向下为正数 |  |  |  |
| borderRadius | 边框圆角 |  |  |  |
| borderWidth | 边框宽度 |  |  |  |
| borderColor | 边框颜色 |  |  |  |
| bgColor | 背景色 |  |  |  |
| padding | 文本边缘留白 |  |  |  |
| display | 'BYCLICK':点击显示; 'ALWAYS':常显 |  |  |  |
| textAlign | 文本对齐方式。有效值: left, right, center |  |  |  |

#### customCallout

marker 上的自定义气泡 customCallout

`customCallout` 存在时将忽略 `callout` 与 `title` 属性。自定义气泡采用采用 `cover-view` 定制，灵活度更高。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| display | 'BYCLICK':点击显示; 'ALWAYS':常显 |  |  |  |
| anchorX | 横向偏移量，向右为正数 |  |  |  |
| anchorY | 纵向偏移量，向下为正数 |  |  |  |

#### label

marker 上的气泡 label

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| content | 文本 |  |  |  |
| color | 文本颜色 |  |  |  |
| fontSize | 文字大小 |  |  |  |
| anchorX | label的坐标，原点是 marker 对应的经纬度 |  |  |  |
| anchorY | label的坐标，原点是 marker 对应的经纬度 |  |  |  |
| borderWidth | 边框宽度 |  |  |  |
| borderColor | 边框颜色 |  |  |  |
| borderRadius | 边框圆角 |  |  |  |
| bgColor | 背景色 |  |  |  |
| padding | 文本边缘留白 |  |  |  |
| textAlign | 文本对齐方式。有效值: left, right, center |  |  |  |

#### polyline

指定一系列坐标点，从数组第一项连线至最后一项

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| points | 经纬度数组<br />`[{latitude: 0, longitude: 0}]` |  |  |  |
| color | 线的颜色<br />`十六进制` |  |  |  |
| width | 线的宽度 |  |  |  |
| dottedLine | 是否虚线<br />`默认 false` |  |  |  |
| arrowLine | 带箭头的线<br />`默认 false，开发者工具暂不支持该属性` |  |  |  |
| arrowIconPath | 更换箭头图标<br />`在 arrowLine 为 true 时生效` |  |  |  |
| borderColor | 线的边框颜色 |  |  |  |
| borderWidth | 线的厚度 |  |  |  |

#### polygon

指定一系列坐标点，根据 points 坐标数据生成闭合多边形

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| dashArray | 边线虚线<br />`默认值 [0, 0] 为实线，[10, 10]表示十个像素的实线和十个像素的空白（如此反复）组成的虚线` | `[0,0]` | ✔️ |  |
| points | 经纬度数组<br />`[{latitude: 0, longitude: 0}]` |  |  |  |
| strokeWidth | 描边的宽度 |  |  |  |
| strokeColor | 描边的颜色<br />`十六进制` |  |  |  |
| fillColor | 填充颜色<br />`十六进制` |  |  |  |
| zIndex | 设置多边形Z轴数值 |  |  |  |
| level | 压盖关系<br />`默认为 abovelabels` |  | ✔️ |  |

#### circle

在地图上显示圆

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| latitude | 纬度<br />`浮点数，范围 -90 ~ 90` |  |  |  |
| longitude | 经度<br />`浮点数，范围 -180 ~ 180` |  |  |  |
| color | 描边的颜色<br />`十六进制` |  |  |  |
| fillColor | 填充颜色<br />`十六进制` |  |  |  |
| radius | 半径 |  |  |  |
| strokeWidth | 描边的宽度 |  |  |  |

#### control

在地图上显示控件，控件不随着地图移动。即将废弃，请使用 cover-view

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| id | 控件id<br />`在控件点击事件回调会返回此id` |  |  |  |
| position | 控件在地图的位置<br />`控件相对地图位置` |  |  |  |
| iconPath | 显示的图标<br />`项目目录下的图片路径，支持本地路径、代码包路径` |  |  |  |
| clickable | 是否可点击<br />`默认不可点击` |  |  |  |

#### point

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| longitude | 经度 |  |  |  |
| latitude | 纬度 |  |  |  |

#### position

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| left | 距离地图的左边界多远 | `0` |  |  |
| top | 距离地图的上边界多远 | `0` |  |  |
| width | 控件宽度 | `图片宽度` |  |  |
| height | 控件高度 | `图片宽度` |  |  |

#### groundOverlays

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| id | 刷新的时候需要变更id值 |  |  |  |
| include-points | 右上 左下 |  |  |  |
| image |  |  |  |  |
| alpha |  |  |  |  |
| zIndex |  |  |  |  |

#### tileOverlay

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| url |  |  |  |  |
| type |  |  |  |  |
| tileWidth |  |  |  |  |
| tileHeight |  |  |  |  |
| zIndex |  |  |  |  |

#### panels

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| id |  |  |  |  |
| layout |  |  |  |  |
| position |  |  |  |  |

#### onMarkerTapEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| markerId |  |  |  |  |

#### onLabelTapEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| markerId |  |  |  |  |

#### onControlTapEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| controlId |  |  |  |  |

#### onCalloutTapEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| markerId |  |  |  |  |

#### RegionChangeDetail

##### CausedByBegin

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| gesture | 手势触发 |  |  |  |
| update | 接口触发 |  |  |  |

##### CausedByEnd

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| drag | 拖动导致 |  |  |  |
| scale | 缩放导致 |  |  |  |
| update | 调用更新接口导致 |  |  |  |

#### onRegionEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| type | 视野变化开始、结束时触发<br />`视野变化开始为begin，结束为end` |  |  |  |
| causedBy | 导致视野变化的原因<br />`有效值为 gesture（手势触发）、update（接口触发或调用更新接口导致）、drag（拖动导致）、scale（缩放导致）` |  |  |  |
| detail | 视野改变详情 |  |  |  |

#### regionChangeDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| rotate | 旋转角度 |  |  |  |
| skew | 倾斜角度 |  |  |  |
| causedBy |  |  |  |  |
| type |  |  |  |  |
| scale |  |  |  |  |
| centerLocation |  |  |  |  |
| region |  |  |  |  |

#### onPoiTapEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| name |  |  |  |  |
| longitude |  |  |  |  |
| latitude |  |  |  |  |

#### onPolylineTapEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| polylineId |  |  |  |  |
| longitude |  |  |  |  |
| latitude |  |  |  |  |

#### onAbilityEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| ability |  |  |  |  |
| errCode |  |  |  |  |
| errMsg |  |  |  |  |

#### onInterpolatePointEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| markerId |  |  |  |  |
| longitude |  |  |  |  |
| latitude |  |  |  |  |
| animationStatus |  |  |  |  |

## Canvas

[查看 Taro 文档](https://docs.taro.zone/docs/components/canvas/)

画布

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| type | 指定 canvas 类型，支持 2d 和 webgl |  | ✔️ |  |
| canvasId | canvas 组件的唯一标识符，若指定了 type 则无需再指定该属性 |  | ✔️ | ✔️ |
| disableScroll | 当在 canvas 中移动时且有绑定手势事件时，禁止屏幕滚动以及下拉刷新 | `false` | ✔️ |  |
| id | 组件唯一标识符。<br />注意：同一页面中的 id 不可重复。 |  |  | ✔️ |
| width |  |  |  | ✔️ |
| height |  |  |  | ✔️ |
| nativeProps | 用于透传 `WebComponents` 上的属性到内部 H5 标签上 |  |  | ✔️ |
| onTouchStart | 手指触摸动作开始 |  | ✔️ | ✔️ |
| onTouchMove | 手指触摸后移动 |  | ✔️ | ✔️ |
| onTouchEnd | 手指触摸动作结束 |  | ✔️ | ✔️ |
| onTouchCancel | 手指触摸动作被打断，如来电提醒，弹窗 |  | ✔️ | ✔️ |
| onLongTap | 手指长按 500ms 之后触发，触发了长按事件后进行移动不会触发屏幕的滚动 |  | ✔️ | ✔️ |
| onError | 当发生错误时触发 error 事件，detail = {errMsg: 'something wrong'} |  | ✔️ |  |

#### onErrorEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| errMsg |  |  |  |  |

## Ad

[查看 Taro 文档](https://docs.taro.zone/docs/components/open/ad)

Banner 广告

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| unitId | 广告单元id，可在[小程序管理后台](https://mp.weixin.qq.com/)的流量主模块新建 |  | ✔️ |  |
| adIntervals | 广告自动刷新的间隔时间，单位为秒，参数值必须大于等于30（该参数不传入时 Banner 广告不会自动刷新） |  | ✔️ |  |
| adType | 广告类型，默认为展示`banner`，可通过设置该属性为`video`展示视频广告, `grid`为格子广告 |  | ✔️ |  |
| adTheme | 广告主题样式设置 |  | ✔️ |  |
| onLoad | 广告加载成功的回调 |  | ✔️ |  |
| onError | 当广告发生错误时，触发的事件，可以通过该事件获取错误码及原因，事件对象 event.detail = {errCode: 1002} |  | ✔️ |  |
| onClose | 广告关闭的回调 |  | ✔️ |  |

#### onErrorEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| errCode |  |  |  |  |

#### AdErrCode

广告错误码

错误码是通过onError获取到的错误信息。调试期间，可以通过异常返回来捕获信息。
在小程序发布上线之后，如果遇到异常问题，可以在[“运维中心“](https://mp.weixin.qq.com/)里面搜寻错误日志，还可以针对异常返回加上适当的监控信息。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| 1000 | 异常情况：`后端错误调用失败`<br />理由：`该项错误不是开发者的异常情况`<br />解决方案：`一般情况下忽略一段时间即可恢复。` |  |  |  |
| 1001 | 异常情况：`参数错误`<br />理由：`使用方法错误`<br />解决方案：`可以前往 developers.weixin.qq.com 确认具体教程（小程序和小游戏分别有各自的教程，可以在顶部选项中，“设计”一栏的右侧进行切换。` |  |  |  |
| 1002 | 异常情况：`广告单元无效`<br />理由：`可能是拼写错误、或者误用了其他APP的广告ID`<br />解决方案：`请重新前往 mp.weixin.qq.com 确认广告位ID。` |  |  |  |
| 1003 | 异常情况：`内部错误`<br />理由：`该项错误不是开发者的异常情况`<br />解决方案：`一般情况下忽略一段时间即可恢复。` |  |  |  |
| 1004 | 异常情况：`无合适的广告`<br />理由：`广告不是每一次都会出现，这次没有出现可能是由于该用户不适合浏览广告`<br />解决方案：`属于正常情况，且开发者需要针对这种情况做形态上的兼容。` |  |  |  |
| 1005 | 异常情况：`广告组件审核中`<br />理由：`你的广告正在被审核，无法展现广告`<br />解决方案：`请前往 mp.weixin.qq.com 确认审核状态，且开发者需要针对这种情况做形态上的兼容。` |  |  |  |
| 1006 | 异常情况：`广告组件被驳回`<br />理由：`你的广告审核失败，无法展现广告`<br />解决方案：`请前往 mp.weixin.qq.com 确认审核状态，且开发者需要针对这种情况做形态上的兼容。` |  |  |  |
| 1007 | 异常情况：`广告组件被封禁`<br />理由：`你的广告能力已经被封禁，封禁期间无法展现广告`<br />解决方案：`请前往 mp.weixin.qq.com 确认小程序广告封禁状态。` |  |  |  |
| 1008 | 异常情况：`广告单元已关闭`<br />理由：`该广告位的广告能力已经被关闭`<br />解决方案：`请前往 mp.weixin.qq.com 重新打开对应广告位的展现。` |  |  |  |

#### onSizeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| width |  |  |  |  |
| height |  |  |  |  |

## AdCustom

[查看 Taro 文档](https://docs.taro.zone/docs/components/open/ad-custom)

Banner 广告

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| unitId | 广告单元id，可在[小程序管理后台](https://mp.weixin.qq.com/)的流量主模块新建 |  | ✔️ |  |
| adIntervals | 广告自动刷新的间隔时间，单位为秒，参数值必须大于等于30（该参数不传入时 Banner 广告不会自动刷新） |  | ✔️ |  |
| onLoad | 广告加载成功的回调 |  | ✔️ |  |
| onError | 当广告发生错误时，触发的事件，可以通过该事件获取错误码及原因 |  | ✔️ |  |

## OfficialAccount

[查看 Taro 文档](https://docs.taro.zone/docs/components/open/official-account)

公众号关注组件。当用户扫小程序码打开小程序时，开发者可在小程序内配置公众号关注组件，方便用户快捷关注公众号，可嵌套在原生组件内。

Tips
使用组件前，需前往小程序后台，在“设置”->“关注公众号”中设置要展示的公众号。注：设置的公众号需与小程序主体一致。

在一个小程序的生命周期内，只有从以下场景进入小程序，才具有展示引导关注公众号组件的能力:

当小程序从扫小程序码场景（场景值1047，场景值1124）打开时
当小程序从聊天顶部场景（场景值1089）中的「最近使用」内打开时，若小程序之前未被销毁，则该组件保持上一次打开小程序时的状态
当从其他小程序返回小程序（场景值1038）时，若小程序之前未被销毁，则该组件保持上一次打开小程序时的状态

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| onLoad | 组件加载成功时触发 |  | ✔️ |  |
| onError | 组件加载失败时触发 |  | ✔️ |  |

#### Detail

detail 对象

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| status | 状态码 |  |  |  |
| errMsg | 错误信息 |  |  |  |

#### Status

status 有效值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| -2 | 网络错误 |  |  |  |
| -1 | 数据解析错误 |  |  |  |
| 0 | 加载成功 |  |  |  |
| 1 | 小程序关注公众号功能被封禁 |  |  |  |
| 2 | 关联公众号被封禁 |  |  |  |
| 3 | 关联关系解除或未选中关联公众号 |  |  |  |
| 4 | 未开启关注公众号功能 |  |  |  |
| 5 | 场景值错误 |  |  |  |
| 6 | 重复创建 |  |  |  |

## OpenData

[查看 Taro 文档](https://docs.taro.zone/docs/components/open/open-data)

用于展示平台开放的数据

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| type | 开放数据类型 |  | ✔️ |  |
| openGid | 当 type="groupName" 时生效, 群id |  | ✔️ |  |
| lang | 当 type="user*" 时生效，以哪种语言展示 userInfo | `"en"` | ✔️ |  |
| defaultText | 数据为空时的默认文案 |  | ✔️ |  |
| defaultAvatar | 用户头像为空时的默认图片，支持相对路径和网络图片路径 |  | ✔️ |  |
| onError | 群名称或用户信息为空时触发 |  | ✔️ |  |

#### Type

type 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| groupName | 拉取群名称 |  |  |  |
| userNickName | 用户昵称 |  |  |  |
| userAvatarUrl | 用户头像 |  |  |  |
| userGender | 用户性别 |  |  |  |
| userCity | 用户所在城市 |  |  |  |
| userProvince | 用户所在省份 |  |  |  |
| userCountry | 用户所在国家 |  |  |  |
| userLanguage | 用户的语言 |  |  |  |

#### Lang

lang 的合法值

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| en | 英文 |  |  |  |
| zh_CN | 简体中文 |  |  |  |
| zh_TW | 繁体中文 |  |  |  |

## WebView

[查看 Taro 文档](https://docs.taro.zone/docs/components/open/web-view)

web-view 组件是一个可以用来承载网页的容器，会自动铺满整个小程序页面。个人类型与海外类型的小程序暂不支持使用。

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| src | webview 指向网页的链接。可打开关联的公众号的文章，其它网页需登录小程序管理后台配置业务域名。 |  | ✔️ | ✔️ |
| onMessage | 网页向小程序 postMessage 时，会在特定时机（小程序后退、组件销毁、分享）触发并收到消息。e.detail = { data } |  | ✔️ |  |
| onLoad | 网页加载成功时候触发此事件。e.detail = { src } |  | ✔️ | ✔️ |
| onError | 网页加载失败的时候触发此事件。e.detail = { src } |  | ✔️ | ✔️ |

#### onMessageEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| data | 消息数据，是多次 postMessage 的参数组成的数组 |  |  |  |

#### onLoadEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| src | 网页链接 |  |  |  |

#### onErrorEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| src | 网页链接 |  |  |  |

## PageMeta

[查看 Taro 文档](https://docs.taro.zone/docs/components/page-meta)

页面属性配置节点，用于指定页面的一些属性、监听页面事件。只能是页面内的第一个节点。可以配合 navigation-bar 组件一同使用。
通过这个节点可以获得类似于调用 Taro.setBackgroundTextStyle Taro.setBackgroundColor 等接口调用的效果。

:::info
Taro v3.6.19 开始支持
开发者需要在页面配置里添加：`enablePageMeta: true`
:::

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| backgroundTextStyle | 下拉背景字体、loading 图的样式，仅支持 dark 和 light |  | ✔️ |  |
| backgroundColor | 窗口的背景色，必须为十六进制颜色值 |  | ✔️ |  |
| backgroundColorTop | 顶部窗口的背景色，必须为十六进制颜色值，仅 iOS 支持 |  | ✔️ |  |
| backgroundColorBottom | 底部窗口的背景色，必须为十六进制颜色值，仅 iOS 支持 |  | ✔️ |  |
| scrollTop | 滚动位置，可以使用 px 或者 rpx 为单位，在被设置时，页面会滚动到对应位置 | `""` | ✔️ |  |
| scrollDuration | 滚动动画时长 | `300` | ✔️ |  |
| pageStyle | 页面根节点样式，页面根节点是所有页面节点的祖先节点，相当于 HTML 中的 body 节点 | `""` | ✔️ |  |
| rootFontSize | 页面的根字体大小，页面中的所有 rem 单位，将使用这个字体大小作为参考值，即 1rem 等于这个字体大小 | `""` | ✔️ |  |
| rootBackgroundColor | 页面内容的背景色，用于页面中的空白部分和页面大小变化 resize 动画期间的临时空闲区域 |  | ✔️ |  |
| pageFontSize | 页面 page 的字体大小，可以设置为 system ，表示使用当前用户设置的微信字体大小 |  | ✔️ |  |
| pageOrientation | 页面的方向，可为 auto portrait 或 landscape |  | ✔️ |  |
| onResize | 页面尺寸变化时会触发 resize 事件 |  | ✔️ |  |
| onScroll | 页面滚动时会触发 scroll 事件 |  | ✔️ |  |
| onScrollDone | 如果通过改变 scroll-top 属性来使页面滚动，页面滚动结束后会触发 scrolldone 事件 |  | ✔️ |  |

#### onResizeEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| deviceOrientation | 设备方向 |  |  |  |
| size | 窗口尺寸 |  |  |  |

#### resizeType

窗口尺寸类型

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| windowWidth | 窗口宽度 |  |  |  |
| windowHeight | 窗口高度 |  |  |  |
| screenWidth | 屏幕宽度 |  |  |  |
| screenHeight | 屏幕高度 |  |  |  |

#### onScrollEventDetail

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| scrollTop |  |  |  |  |

## CustomWrapper

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/custom-wrapper)

custom-wrapper 自定义组件包裹器
当数据更新层级较深时，可用此组件将需要更新的区域包裹起来，这样更新层级将大大减少

## NativeSlot

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/native-slot)

编译的原生组件支持使用 slot 插槽

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| name | 指定插入的 slot 位置 | `none` | ✔️ |  |

## Slot

[查看 Taro 文档](https://docs.taro.zone/docs/components/viewContainer/slot)

slot 插槽

| 参数 | 说明 | 默认值 | 微信 | Web |
| --- | --- | :---: | :---: | :---: |
| name | 指定插入的 slot 位置 | `none` | ✔️ |  |

