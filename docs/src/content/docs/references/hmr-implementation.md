---
title: 热更新实现原理
description: 微信开发者工具热更新的物理交付边界、模块替换、React Refresh 与页面状态保留机制。
---

vpt 的微信 HMR 建立在微信开发者工具的文件热重载行为上，而不是把浏览器 HMR 搬进小程序。理解它的关键不是先看模块更新算法，而是先理解开发者工具如何根据**发生变化的物理文件**决定重载范围。

使用与排查方法参见[开发者工具热更新](/guides/hot-module-replacement/)。本页只解释当前代码真正执行的机制。

## 微信环境的决定性约束

### 新代码必须来自项目文件

浏览器可以通过 WebSocket 收到更新通知，再从开发服务器导入新的 JavaScript URL。微信小程序不能把 `wx.request()` 收到的源码交给 `eval()`、`Function()` 或等价机制执行。

因此，可执行补丁必须先成为 `dist/wx` 中的真实 JavaScript 文件，再由微信开发者工具编译和执行。HTTP 只能报告状态，不能传输可执行更新。

### 变化的文件决定重载范围

开启 `compileHotReLoad` 后，开发者工具会区分 App 级重载与页面 JavaScript 热重载：

- 普通完整输出发生变化时，开发者工具可以重新启动 App，旧的 JavaScript 堆、Taro 根和 React Fiber 树都会消失。
- 页面入口或页面在初始代码中直接加载的 JavaScript 文件发生变化时，开发者工具可以重新执行页面代码，同时保留 App 运行环境。

React Refresh 只能更新仍然存活的 Fiber 树，所以 vpt 必须把普通 JavaScript 更新压缩成一个页面级文件变化，不能重写原来的 App、页面和共享代码文件。

### 依赖必须从第一次构建开始就直接存在

每个页面入口从初始构建起就包含一个字面量 `require()`：

```js
require('../../hmr/patches.js')
```

相对路径根据最终页面文件位置生成。这个依赖不能等页面开始重载后再动态发现，也不能通过运行时拼接路径。开发者工具需要从既有物理依赖关系判断这次变化属于页面 JavaScript 热重载。

### App 必须比页面活得更久

页面入口正是开发者工具会重新执行的代码。如果模块运行时保存在页面作用域中，每次更新都会丢失模块缓存、补丁序号和 React Refresh 状态。

vpt 把开发模块运行时保存在 App 持有的微信全局环境中。页面重新执行后仍然访问同一个运行时、同一份模块图和同一棵 React Fiber 树。

## 核心机制

整个机制可以概括为：

> Rolldown 生成模块补丁，vpt 只改写所有页面预先直接依赖的 `hmr/patches.js`；微信开发者工具因此重新执行页面而不重启 App，存活的 App 模块运行时再把补丁应用到原模块图，并由 React Refresh 更新现有 Fiber 树。

```text
保存源码
   ↓
Rolldown 从现有开发模块图生成补丁
   ↓
只改写 dist/wx/hmr/patches.js
   ↓
微信开发者工具重新执行存活页面入口
   ↓
页面先 require() 补丁文件
   ↓
App 模块运行时同步替换受影响模块
   ↓
React Refresh 更新现有 React 树
   ↓
Taro 根重新绑定开发者工具创建的替换页面
```

## 初始开发构建建立了什么

微信开发模式使用 Vite bundled development 和一个直接写入 `dist/wx` 的 Rolldown DevEngine。vpt 替换 Vite 默认的内存交付方式，但继续使用 Vite 已解析的模块图和插件转换结果。

启动时会完成以下工作：

1. 取得 Vite 为 bundled development 生成的 Rolldown 配置。
2. 创建唯一的物理 DevEngine，不启动第二个 watcher 或嵌套构建。
3. 使用稳定的开发文件名，避免内容哈希改变物理依赖路径。
4. 关闭开发 source map，并把注入的运行时代码降级到微信支持的语法目标。
5. 在 HTTP 服务显示就绪前完成第一次完整物理构建。
6. HTTP 端口确定后生成本次完整构建的 `buildId`。
7. 重置 `hmr/patches.js`，再写入 `hmr/info.js`。

vpt 还关闭 Vite bundled development 的“按 HTTP 请求重新生成过期输出”路径。微信项目以磁盘文件为准，任何绕过 HMR 协议的额外完整写入都可能让开发者工具重启 App。

### App 入口

App 入口在业务依赖执行前初始化开发运行时：

```js
__rolldown_runtime__.initialize(require('./hmr/info.js'))
```

`hmr/info.js` 包含：

```ts
{
    buildId: string
    endpoint: string
}
```

`buildId` 同时是当前 Rolldown HMR 客户端的身份。`endpoint` 使用 Vite 实际绑定的协议、主机和端口，不假设一定是 `localhost:5173`。

### 页面入口

每个页面入口在共享运行时代码已经可用之后、业务页面模块执行之前加载补丁文件：

```js
require('../../hmr/patches.js')
```

初始 `hmr/patches.js` 为：

```js
module.exports = undefined
```

所以第一次页面启动不会应用任何更新，但开发者工具已经记录了这个直接依赖。

## 开发主机如何产生补丁

普通源码变化到来后，DevEngine 会为当前 `buildId` 返回以下结果之一：

- `Noop`：没有需要发布的更新。
- `Patch`：可以用模块补丁表示。
- `FullReload`：当前变化不能安全表示为局部更新。

当前构建只接受身份与 `buildId` 相同的 `Patch`。旧完整构建延迟返回的结果会被忽略，不可能进入新构建的补丁历史。

每个补丁直接使用 Rolldown 提供的：

```ts
{
    seq: number
    changedIds: string[]
    code: string
    filename: string
}
```

vpt 不解析或重新生成 Rolldown 的模块工厂代码，只把它包装成可以由微信项目文件同步执行的程序。

## 为什么只改写 `hmr/patches.js`

一次成功的 JavaScript HMR 不会要求 DevEngine 重新输出普通应用文件。开发主机使用 `rebuildStrategy: 'never'`，只有明确的恢复路径才触发完整构建。

补丁文件通过对最终路径直接写入完成。这里不使用“写临时文件再 rename”的原子替换方式：开发者工具对文件写入形态也会作出不同判断，rename 曾被观察为更大范围的项目变化。直接完成最终文件写入才能稳定触发所需的页面重载边界。

这一约束意味着普通 JavaScript HMR 完成后，物理差异应只有：

```text
dist/wx/hmr/patches.js
```

`app.js`、页面入口、共享代码、JSON、WXML 和普通资源保持不变。

## 补丁文件的实际内容

一个补丁文件导出当前 `buildId` 和一个或多个尚未确认应用的补丁：

```ts
module.exports = {
    buildId,
    patches: [
        {
            seq,
            changedIds,
            factory: () => {
                // Rolldown 生成的模块图和模块工厂注册代码
            }
        }
    ]
}
```

Page shell 同步 `require()` 这个惰性数据模块，再调用 `applyPatches(payload, route)`。补丁不会从 HTTP 响应中取回，也没有 WebSocket JavaScript 传输。

## 页面为什么会执行补丁

开发者工具发现 `hmr/patches.js` 变化后，会重新执行依赖它的存活页面入口。页面入口的执行顺序保证：

1. 共享模块运行时先从微信模块缓存中取得，仍然是 App 已经使用的同一个实例。
2. `hmr/patches.js` 在业务页面导入之前执行。
3. 新模块实现同步注册并应用。
4. 页面剩余代码随后看到的是更新后的模块状态。

同一个补丁文件可能被多个存活页面依次加载。运行时使用序号忽略已经应用的补丁，但每次 `applyPatches(payload, route)` 仍会为调用方路由建立替换事务，让每个被开发者工具替换的页面都能重新绑定。

## 运行时如何应用模块补丁

App 模块运行时扩展 Rolldown 的开发运行时，直接复用它维护的模块图、反向引用关系、模块缓存、导出对象和可重新执行工厂。

### 1. 验证构建身份

`payload.buildId` 必须与 App 启动时读取的 `hmr/info.js` 一致。旧构建补丁只会产生警告，不会修改当前模块图。

### 2. 建立路由替换事务

构建身份有效时，`applyPatches(payload, route)` 先为该路由建立短期事务。即使另一个 Page 已经应用同一补丁序号，本次物理 Page 仍会被开发者工具替换，因此它需要自己的生命周期交接。

### 3. 严格检查序号

运行时维护 `appliedSeq`：

- `seq <= appliedSeq` 的补丁是重复交付，直接跳过。
- 新补丁必须等于 `appliedSeq + 1`。
- 序号缺失会立即停止当前范围并请求完整构建。

### 4. 注册模块图与新工厂

执行补丁的 `factory()` 会更新 Rolldown 模块图，并为能够重新执行的模块注册新工厂。此时只安装新实现，还没有清除旧模块缓存。

### 5. 计算接受边界

运行时从每个 `changedId` 开始：

1. 未执行过的变化模块不需要立即刷新；新工厂保留到它第一次被导入。
2. 已执行模块沿已经执行的引用方逐层向上遍历。
3. 遇到具有接受回调的热上下文时，记录为接受边界。
4. 沿途模块加入同一个更新集合。
5. 没有接受边界或传播路径形成循环时，终止局部更新。

Rolldown 的反向索引同时包含静态和动态导入关系。遍历只处理已经执行的受影响子图，复杂度为 `O(V + E)`。

### 6. 验证并清除缓存

更新集合中的每个模块都必须存在可重新执行工厂。运行时先保存旧接受边界及其回调，再统一删除整个更新集合的模块缓存。

统一清除发生在任何新模块执行之前，避免一个边界重新执行时读到另一个受影响模块的旧导出。

### 7. 重新执行接受边界

运行时重新初始化每个接受边界。初始化会从已注册工厂执行新的模块实现及其失效依赖，并得到最新导出。

随后调用上一代热上下文中的接受回调，把最新导出交给它。新执行产生的新热上下文只有在首次调用 `accept()` 时才进入运行时的边界映射；不接受更新的普通模块不占用持久热上下文条目。

如果接受回调调用 `invalidate()`，或任意工厂、边界回调抛出异常，本次范围停止，运行时发送 `rebuild` 报告。只有模块更新成功后，`appliedSeq` 才会增加。

### 8. 确认应用前沿

模块更新成功后，运行时发送 `{ kind: 'applied', buildId, seq }`。主机据此从累计补丁历史中删除已应用前缀。DevEngine 的物理交付确认由主机在发布文件时独立完成，不依赖微信运行时报告。

## React Refresh 如何参与

vpt 使用 `@vitejs/plugin-react` 生成组件签名、类型注册和接受边界，不实现自己的 React 状态复制。

浏览器版本的 Refresh 代码依赖 HTML 前置脚本、`window` 和自由变量形式的 React DevTools Hook。微信环境没有相同的词法全局，因此 serve-only App capsule 先导入 Refresh 运行时，让它在 React 渲染器求值前直接安装正式 Hook。运行时不需要预装占位 Hook，也不需要保存渲染器供稍后重放。

开发构建另外只改写三个确定的协议位置：

1. Refresh 运行时中的已知 `window` 协议属性改为微信全局环境。
2. React 相关模块中的自由 `__REACT_DEVTOOLS_GLOBAL_HOOK__` 改为显式访问 `global.__REACT_DEVTOOLS_GLOBAL_HOOK__`。
3. 依赖浏览器前置脚本的 `$RefreshReg$` 检查被移除，因为模块已经包含局部注册包装器。

React 组件边界的接受回调验证新旧导出，并安排 React Refresh。兼容组件复用现有 Fiber 与 Hook 状态；不兼容边界调用 `invalidate()`，进入完整构建恢复路径。

vpt 不把 Fiber 序列化到补丁文件，也不创建第二棵 React 树。状态能够保留，是因为这次物理文件变化没有让开发者工具重启 App，原 Fiber 树始终存活。

## 页面状态为什么不会被 Taro 卸载

模块替换成功并不自动等于页面可继续显示。开发者工具重新执行页面代码时会创建替换页面，并触发页面卸载、加载和显示过程。若这些回调进入 Taro 默认逻辑：

- `onUnload` 会卸载原 React 页面子树。
- `onLoad` 会创建新的页面身份和渲染连接。
- Hook 状态和原生输入状态都会随旧树消失。

vpt 只在对应路由存在替换事务时调整这组生命周期，不使用跨页面的全局热更新布尔值。

### 开发插件如何注入页面 HMR

源码中的 `runtime/wx/capsule/page.ts` 只创建并导出普通 Taro Page 配置，不包含 HMR 分支。serve-only 开发插件在路由专属 Page capsule 完成特化后只追加：

```ts
__rolldown_runtime__.injectPageHmr(config, route)
```

`WxDevRuntime` 本身拥有页面替换生命周期逻辑。它不能直接导入 Taro：全局运行时由 Rolldown 单独组装，直接打包 `@tarojs/runtime` 会制造与应用图不同的 Taro 实例。因此同一个开发插件在应用图的 `taro-runtime` facade 中注入一次连接：

```ts
import { Current, document, injectPageInstance } from '@tarojs/runtime'
__rolldown_runtime__.connectTaro(Current, document, injectPageInstance)
```

这只把应用已经使用的三个绑定交给全局运行时，不增加第二个 HMR 对象。每个 Page shell 在补丁有效时用自身路由开启一个替换事务；`WxDevRuntime` 直接提供：

```text
applyPatches(payload, route)   应用补丁并开启路由专属替换事务
injectPageHmr(config, route)   注入一个 Page 配置的替换生命周期
```

Page 模板仍不携带开发逻辑。生产构建不会执行这些注入，因此最终模块图中没有页面 HMR 代码或 Taro 连接。

### `onUnload`

保存旧页面实例的：

```text
$taroPath
$taroParams
data
```

其中 `data` 是微信原生视图当前使用的可序列化节点投影。这里只保留引用，不深拷贝整棵递归节点树。引用仅存在于该路由的短期替换事务中；紧接着的 `onLoad` 会消费并清空它。随后跳过原始 Taro `onUnload`，因此现有 React 页面子树仍在 App 根中。

### `onLoad`

新页面实例先从对应路由的事务取出快照，并立即用无快照事务替换映射项，再调用 `setData()` 恢复保存的原生投影。这个调用必须是替换实例上的第一个原生桥操作；它负责填满原本为空的页面。然后：

1. 将保存的路径和参数写入新页面实例。
2. 把新实例重新注入 Taro 的页面映射。
3. 更新 `Current.page`。
4. 找到原 `$taroPath` 对应的 Taro 页面根。
5. 把该根的 `ctx` 改为新的微信页面实例，让后续 Refresh 增量指向新接收者。

这里不会遍历并重新发布完整 Taro 树。之后 React Refresh 在保留的 App React 根中完成正常协调，Taro 只把实际 Host 变更增量发送给已经重新绑定的接收者。

### `onShow` 与当前页面

`WxDevRuntime` 不复制一份“当前可见页面”状态。Taro 已经用 `Current.page` 维护这个事实：普通 `onShow` 设置它，`onHide` 清除它，热替换 `onLoad` 重新绑定时也会设置它。

替换 `onUnload` 不修改 `Current.page`。React/Taro 增量实际由页面根的 `ctx` 寻址，清空 `Current.page` 不能改变投递目标，反而会让 `Current.page` 与 `Current.router` 在替换间隙不一致。替换 `onLoad` 一次性把页面映射、`Current.page` 和根 `ctx` 切换到新实例。

替换 `onShow` 只删除该路由的替换事务并跳过业务 `onShow`，避免重复请求或重置业务状态；`onLoad` 已经完成绑定，不再重复执行。

普通 `onShow` 和 `onHide` 不需要 HMR 工作，继续完全使用 Taro 原始实现。

普通业务生命周期仍按原语义转发。唯一例外是开发者工具产生的替换 `onUnload`、`onLoad` 和 `onShow`。

## React Refresh 如何更新页面投影

Taro 把所有已挂载 Page 保存在同一个 App React 根下。React Refresh 调度这个根后，只有使用了变化组件家族的子树重新协调；Taro Host 节点再通过各自 `TaroRootElement.ctx` 向对应微信 Page 发送增量 `setData`。

因此“开发者工具只物理替换当前 Page”和“React 更新所有受影响 Page”并不冲突：

- 当前 Page 的原生接收者被替换，所以 vpt 必须恢复快照并重新绑定 `ctx`。
- 隐藏 Page 的原生接收者仍然存活，Taro 直接把实际变化增量发送给它。
- 没有使用变化组件的 Page 不产生 Host 变更，也不产生额外原生负载。

vpt 不包装 `performReactRefresh()`，不扫描页面栈，也不调用 `updateChildNodes()` 发布完整树。唯一新增的页面状态是短期路由事务：

```text
Map<route, PageSnapshot | null>
```

它只在 `applyPatches` 与替换 `onShow` 之间存在：`onUnload` 写入快照，`onLoad` 立即释放大 `data` 引用，`onShow` 删除条目。普通显示、隐藏和 React Refresh 都不读写这个映射。

### 完整时序

```text
Page shell 执行 applyPatches(payload, route)
    ↓
DevTools 替换当前 Page
    ├─ onUnload：把 data 保存到该路由事务，跳过 React 卸载
    ├─ onLoad：立即 setData(data)，恢复路径并绑定新 Page
    └─ onShow：删除事务，跳过业务 onShow
    ↓
防抖后的 performReactRefresh 更新 App React 根
    ↓
Taro 只向实际变化的 Page 根发送增量 setData
```

快照在 `onLoad` 的第一个操作中恢复旧 UI，因此等待 Refresh 不会形成空页面。Refresh 提交后，增量 Host 变更直接覆盖快照中受影响的路径；没有第二次完整树序列化或页面栈遍历。

## 连续保存与重复交付

主机为当前完整构建保留尚未确认物理交付的补丁。

假设当前已确认序号为 `3`：

1. 保存一次产生补丁 `4`，文件写入 `[4]`。
2. 开发者工具尚未加载时再次保存，文件改写为 `[4, 5]`。
3. 页面加载后按顺序应用 `4` 和 `5`。
4. 运行时报告应用前沿 `5`。
5. 主机删除待发布队列中不大于 `5` 的前缀。

如果开发者工具重复执行同一文件，`appliedSeq` 会跳过已经成功应用的序号。如果运行时看到 `[5]` 但自己的 `appliedSeq` 仍为 `3`，缺少序号 `4` 会请求完整构建，而不是猜测中间状态。

## HTTP 接口实际做什么

当前控制接口只有一个路径，并只接受 `POST`。运行时发送两类报告：

```ts
type AppliedReport = {
    kind: 'applied'
    buildId: string
    seq: number
}

type RebuildReport = {
    kind: 'rebuild'
    buildId: string
    reason: string
}
```

主机只接受当前 `buildId` 的报告：

- `applied`：释放运行时已经成功应用的累计补丁前缀。
- `rebuild`：携带失败原因并触发一次完整构建。

接口不保存可执行源码，不返回补丁，不进行轮询，也不维护另一套运行时会话协议。

## 完整构建是唯一恢复边界

以下情况会进入完整构建：

- DevEngine 返回 `FullReload`。
- 已执行变化模块找不到接受边界。
- HMR 传播遇到循环路径。
- 补丁序号中断。
- 更新集合缺少可执行工厂。
- 工厂或接受回调抛出异常。
- React Refresh 使边界失效。
- 运行时主动发送 `rebuild` 报告。

完整构建完成时，主机：

1. 生成新的 `buildId`。
2. 从 DevEngine 移除旧客户端并注册新客户端。
3. 清空未确认补丁。
4. 将 `hmr/patches.js` 重置为空状态。
5. 最后写入新的 `hmr/info.js`。

普通输出同时由 DevEngine 重新写入 `dist/wx`。微信开发者工具据此重新启动 App；新的 App 堆、模块运行时、React 根和补丁序号共同从基线开始。

不需要在旧 App 堆中实现第二套“重置”流程。完整物理输出和开发者工具重启就是恢复协议。

## 与浏览器 HMR 的差异

| 浏览器 Vite HMR | vpt 微信 HMR |
| --- | --- |
| WebSocket 通知浏览器导入更新 URL。 | 可执行代码必须写入开发者工具观察的物理文件。 |
| HMR 请求可以直接携带或定位新 JavaScript。 | HTTP 只报告交付序号与完整构建请求。 |
| 浏览器页面对象不会因模块更新被替换。 | 开发者工具重新执行页面并创建替换页面实例。 |
| React DOM 仍连接原来的页面环境。 | Taro 页面根必须重新绑定新的微信页面实例。 |
| `window`、DOM 和 HTML 前置脚本存在。 | Refresh 协议必须定向适配到微信全局环境。 |
| `location.reload()` 完成恢复。 | 完整物理构建让开发者工具重启 App。 |
| 内存输出或更新 URL 决定代码版本。 | 文件路径、直接依赖和写入形态共同决定重载边界。 |

## 为什么其他做法不成立

### 通过 HTTP 或 WebSocket 发送源码

收到源码不等于可以执行源码。没有开发者工具编译的物理文件，就没有合法的补丁执行边界。

### 重写原页面或共享代码文件

这会绕过单一补丁入口，并让开发者工具看到更大范围的输出变化。即使页面重新执行，原文件代码也无法独立协调模块缓存、接受边界和 React Refresh。

### 在页面重载时才寻找补丁文件

开发者工具需要从初始物理依赖图判断重载范围。动态路径或间接发现不能替代页面入口中的既有字面量依赖。

### 把运行时放在页面中

页面正是被重新执行的边界。运行时随页面重建后，就无法保存旧模块缓存、接受回调、补丁序号或 React Refresh 家族。

### 给微信全局环境添加一个 `window` 别名

微信不会把对象属性自动解析为 JavaScript 自由变量。广泛模拟 `window` 还会改变业务代码语义，所以 vpt 只改写已知的生成代码协议位置。

### 完整构建后恢复 React 内部状态

React Fiber 包含渲染器拥有的可变关系，不能可靠序列化和重建。vpt 选择避免普通更新重启 App，而不是在重启后复制 React 内部状态。

## 实现不变量

维护 HMR 代码时必须保持：

1. 每个页面从初始构建起直接、字面量地依赖同一个 `hmr/patches.js`。
2. 页面必须先取得 App 模块运行时，再执行补丁文件和业务模块。
3. 普通 JavaScript HMR 只能改写 `hmr/patches.js`。
4. 补丁文件必须直接写入最终路径，不能通过临时文件 rename 发布。
5. HTTP 不得传输可执行补丁。
6. 补丁必须同时匹配当前 `buildId` 和下一个连续序号。
7. 更新集合必须在任何接受边界重新执行前统一清除缓存。
8. React Refresh 必须复用仍然存活的 App Fiber 根。
9. 只有开发者工具产生的替换生命周期可以跳过 Taro 默认处理。
10. 正常页面导航必须继续调用原始 Taro 生命周期。
11. 任何不安全或不完整的模块状态都必须请求完整构建。
12. 新 `buildId` 发布前必须先重置补丁文件。
