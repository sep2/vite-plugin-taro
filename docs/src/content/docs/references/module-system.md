---
title: 模块系统
description: vpt 在 H5 与微信小程序目标中解析、切分、放置和执行 JavaScript 模块的完整机制。
---

vpt 让应用始终使用 ESM：同步依赖写 `import`，按需加载写 `import()`。H5 继续使用 Vite 和浏览器的模块机制；微信小程序则把 Rolldown 的构建结果转换为微信可以同步启动、按需加载和全自动分包的应用。

本文涉及两种模块：

- **源码模块**：Vite/Rolldown 解析的源码文件；
- **输出模块**：Rolldown 切分出的最终 chunk。

它们不一一对应。Rolldown 负责解析、转换、删除未使用代码（tree shaking）、合并模块作用域（scope hoisting）和切分 chunk；vpt 在最终输出阶段处理微信入口、运行时加载和物理分包。

## 这套设计解决了什么

Vite/Rolldown 面向 ESM 和异步 chunk 加载，微信小程序却要求同步注册原生入口，并通过不同 API 加载主包与分包文件。如果把这些限制直接暴露给应用，业务代码就必须维护微信专用入口、包路径、共享依赖和加载顺序。

| 冲突 | vpt 的解决方式 |
| --- | --- |
| `App()`、`Page()`、`Component()` 必须同步注册 | 生成固定路径的极小原生入口，并从主包同步取得配置对象 |
| 主包和分包使用不同的物理加载 API | 根据最终文件位置生成加载代码，业务模块不接触微信加载 API |
| 静态依赖可能跨越主包和多个分包 | 按原依赖图连接模块，共享依赖无需复制 |
| 手工分包会把目录和体积管理泄漏进业务架构 | 根据静态与动态导入关系自动分配模块位置，并生成分包和 `app.json` |

核心原则是把**源码依赖关系**与**微信分包位置**分开。静态 `import` 不强制两个模块位于同一分包，动态 `import()` 也不指定某个分包。应用只表达同步依赖和异步加载边界。

## 总览

```text
应用源码
   │
   │ 静态 import：同步依赖
   │ 动态 import()：按需加载边界
   ▼
Vite + Rolldown 模块图
   │
   ├─ 启动时同步可达的模块 ──────────────→ 主包
   │
   └─ 只在动态边界后可达的模块
          │
          └─ vpt 按体积和依赖关系分组 ──→ 一个或多个分包

最终微信输出
   ├─ 固定路径的 App / Page / Component 原生入口
   ├─ 主包 JavaScript chunks
   ├─ 分包 A：sub/p_a/assets/*
   ├─ 分包 B：sub/p_b/assets/*
   ├─ 根据模块 ID 加载这些文件的 transport chunk
   └─ 与实际分包一致的 app.json
```

vpt 会按源码依赖图连接这些文件，因此分包 A 中的模块可以静态引用主包或分包 B 中的模块。

运行时遵守三个规则：

1. 原生入口必须同步完成注册；
2. 静态依赖会在引用方执行前完成连接，即使两者位于不同分包；
3. 动态 `import()` 才能触发按需文件加载。

## 应用源码语义

### 静态导入

静态 `import` 表达预先连接的依赖关系：

```ts
import { calculate } from './calculate'
```

静态 `import` 要求依赖在引用方执行前完成连接，但不要求两者位于同一个物理包。从 App、页面或其他启动代码同步可达的模块属于**启动依赖**，因此都留在主包；进入动态导入边界后，每个模块的位置会独立规划。

所以，一个分包中的模块可以静态引用：

- 已经作为启动依赖使用、因而位于主包的共享模块；
- 位于同一个分包的模块；
- 位于另一个分包的模块。

运行时会按原始依赖关系加载并连接这些模块，源码不需要知道最终分包位置。

### 动态导入

应用中的 `import()` 创建异步加载边界，并且始终返回 Promise：

```ts
const { createReport } = await import('./features/report')
```

`import()` 只表示“这里可以按需加载”，不直接指定分包。如果目标模块同时被启动代码静态导入，它已经属于主包；只有仅在动态边界之后使用的模块才参与分包规划。业务代码在两种情况下都只需正常使用 `await import()`。

## 微信构建流水线

### 1. 建立微信原生入口

vpt 为微信建立以下入口：

```text
app.js                         → App 原生入口
comp.js                        → 递归 Component 原生入口
pages/<route>.js               → 对应 route 的 Page 原生入口
```

这些原生入口只负责加载主包中的 `bootstrap` chunk、同步取得传给微信注册函数的对象，并调用 `App()`、`Page()` 或 `Component()`。`bootstrap` 安装 SystemJS Core，并把 `transport` 函数接入 `System.instantiate`。创建参数对象的代码会单独输出：

- App 部分导入配置项 `app` 指向的组件（通常是 `src/app.tsx`），初始化 Taro React 运行时，并默认导出传给 `App()` 的对象；
- Page 部分导入对应的页面组件，在 App 初始化后默认导出传给 `Page()` 的对象；
- Component 部分在 App 初始化后默认导出传给 `Component()` 的递归组件对象。

Rolldown 保留原生入口与这些代码之间的静态依赖，vpt 再把最终 chunk 的导入转换为同步运行时加载。应用中的 `import()` 只表示按需加载边界。

### 2. 规划主包和分包

位置规划由独立的 Vite 插件 `vpt:wx-placer` 管理，而不是夹在渲染器中的共享缓存。它通过 `config` 安装微信输出命名和入口签名选项；在 Rolldown 已经完成 tree shaking、scope hoisting 和自然 chunk 切分后，从 `renderChunk` 提供的完整最终逻辑 chunk 图创建一次 LTHP 规划。后续每个 chunk 的渲染只读取这份不可变规划，不会重复遍历图，也不会重新推测源码模块最终会怎样合并。

一次输出生成只经过以下状态：

```text
idle
  → renderStart：awaiting-chunks
  → 第一个 pre renderChunk：planned
  → pre generateBundle：finalized
```

状态以一个整体值切换。新一代构建不会继承上一代的体积、chunk 或所有权缓存，`vpt:wx` 渲染插件也不能在规划前取得路径，或在最终化前取得 `app.json` 分包声明。

以下内容必须留在主包：

1. 所有显式输出入口；
2. 这些入口递归静态引用的完整 chunk 闭包；
3. 因此也包括原生壳、`bootstrap`、`transport` 和生命周期 capsule 所需的同步代码。

其余 chunk 使用 **Load-Transition Hypergraph Partitioning（LTHP）** 规划：

1. 每条动态 chunk 边是一条加载迁移；
2. 该动态目标的静态 chunk 闭包构成一条超边；
3. 每个最终 chunk 只分配给一个物理包，绝不复制；
4. 先放置参与更多迁移的共享 chunk，再处理较大 chunk；
5. 每次优先选择与该 chunk 共享最多加载迁移的可容纳分包；
6. 下载代价相同时，再选择剩余空间最小的分包。

这样优化的是一次 `import()` 实际触及的包数量，而不是文件名顺序、直接邻接数或单纯装满程度。嵌套 `import()` 会形成独立迁移；共享 chunk 会综合所有使用它的迁移选择唯一所有者。

每个分包的规划预算为 `1,900,000` 字节，为运行时包装和原生资源预留空间。最终 chunk 的估算包含 tree-shaken 模块代码、chunk 包装和引用开销以及原生组件资源。单个超预算 chunk 会独占分包；规划器不会复制或拆开 Rolldown 的最终 chunk。

分包目录名来自包内排序后的逻辑 chunk IDs：对它们计算 SHA-256，并取前 8 位。

```text
sub/p_<8位哈希>
```

SystemJS 继续使用包无关的逻辑 chunk ID；`transport` 单独把该 ID 映射到主包 `require()` 或分包 `require.async()` 的物理路径。因此最终化阶段只移动文件，不改变模块身份或复制 chunk。

#### 规划复杂度与构建性能

设最终 chunk 数为 `C`、动态加载迁移数为 `T`、生成分包数为 `B`。主包闭包遍历与最终文件落位均随 chunk 图线性增长；加载迁移分析的成本是各迁移静态闭包大小之和。装包时会扫描可容纳的分包并求稀疏迁移集合交集，理论最坏情况为 `O(CBT)`，但真实项目通常只有少量分包和稀疏迁移成员关系。

规划在每次完整输出中只运行一次。随后路径与加载模式查询是 `O(1)` 的 Map 查询，`generateBundle` 最终化是 `O(C)`；规划器不复制 chunk，也不保留第二份完整 Rolldown chunk 图。

Node.js 26 上的合成基准用于防止算法退化，不代表具体项目的总构建时间：

| 最终 chunk 图 | 单次规划时间（约） |
| --- | ---: |
| 10,000 条相互独立的加载迁移 | 10 ms |
| 1,000 个动态根共享 100 个 chunk | 16 ms |
| 10,000 个 chunk、100 条近乎最大重叠的迁移 | 184 ms |

最后一种是刻意制造的高重叠压力图；常见图更接近前两种稀疏情况。

### 3. 生成最终文件和分包声明

`chunkFileNames` 一次只能看到一个 `PreRenderedChunk`，看不到完整加载迁移图，因此它使用 Rolldown 原生的 `assets/[name]-[hash].js` 模式，绝不在这里决定分包或重建 chunk 名称。Rolldown 负责名称、碰撞处理、内容哈希和生成的相对导入；主包保留其路径，分包只在最终化时加上 `sub/p_<package-hash>/` 前缀。渲染层从 Rolldown 路径投影 SystemJS 逻辑 ID 时独立移除开头的 `assets/`，所以输出目录组织不会进入模块身份。

在 pre `generateBundle` 中，`vpt:wx-placer` 用 preliminary logical ID 查找每个最终 `OutputChunk` 的强类型 `PackageLocation`，并直接设置 Rolldown 所属对象的 `fileName`。它不修改 bundle 键、不复制 chunk，也不通过 `emitFile` 重新发射 JavaScript。随后 `vpt:wx` 才按这些最终路径放置原生组件资源并生成 JSON。删除未使用代码后没有实际输出的分包不会进入 `app.json`。

全局样式的实际内容固定输出为 `assets/global.wxss`。根目录下的 `app.wxss` 只包含对该文件的 `@import`，因此两个全局样式路径在生产和开发构建中都保持不变。

vpt 对最终存在的分包目录去重、排序，并生成分包声明：

```json
{
    "subPackages": [
        {
            "name": "p_abcd1234",
            "root": "sub/p_abcd1234",
            "pages": []
        }
    ]
}
```

这些分包只声明代码入口，所以 `pages` 为空。传入 `appJson` 的 `subPackages` 或 `subpackages` 会被移除，最终声明完全来自实际输出。

## 微信运行时：SystemJS Core

微信小程序内置定制版 SystemJS Core。vpt 在上游 Core 基础上增加同步 `importSync()`，并接入主包与分包文件加载。它属于 vpt 的构建产物，不是应用 API。

### 输出文件的执行方式

`app.js`、`comp.js`、页面入口和 `transport` chunk 转换为 CommonJS，由微信直接执行。普通应用 chunk 导出 `System.register` 注册数据，等待 SystemJS 连接和执行。

`bootstrap` 和 Rolldown 辅助运行时还会被应用依赖图导入。它们先作为 CommonJS 执行，再由 `transport` 把同一组缓存导出发布给 SystemJS。包含 `App()`、`Page()` 或 `Component()` 参数对象的 chunk 始终由对应原生入口同步加载，不受最终执行方式影响。

### System.register 文件

普通 chunk 会被包装成一份不会立即执行的注册数据：

```js
module.exports = [
    ['dependency-<hash>.js'],
    function (exportBinding, context) {
        return {
            setters: [/* 接收依赖导出更新的函数 */],
            execute() {
                // 原 chunk 执行体
            }
        }
    }
]
```

微信 `require()` 这个文件时只会取得 `[依赖列表, 声明函数]`，不会执行应用模块体。SystemJS 负责连接依赖、处理循环和执行模块。

### CommonJS 与 SystemJS 共享导出

`bootstrap` chunk 必须先作为 CommonJS 安装 SystemJS，随后又会被应用依赖图导入。Rolldown 辅助运行时出现时也有相同需求。

`transport` 会为这些 chunk 生成注册数据。SystemJS 执行它时，才通过 `require()` 取得 CommonJS 已缓存的导出，并发布到统一模块注册表。这样模块体只执行一次，也避免 `bootstrap` 与 `transport` 互相加载时产生初始化循环。

### 模块 ID 和 transport

模块在不同阶段使用不同身份：

| 身份 | 用途 |
| --- | --- |
| Vite/Rolldown 源码模块 ID | 源码转换和开发补丁 |
| 最终逻辑 chunk ID | 位置规划、SystemJS 模块 ID，以及 chunk 之间的静态和动态依赖 ID |
| 最终物理文件路径 | 仅供生成的 `require()` 与 `require.async()` 使用 |

SystemJS 使用不含物理分包归属的逻辑 chunk 路径作为模块 ID。构建时，vpt 会把 chunk 之间的相对引用转换成统一 ID：

```text
../shared-<hash>.js      → shared-<hash>.js
./feature-data-<hash>.js → feature-data-<hash>.js
```

右侧是包无关的逻辑 ID，而不是物理文件路径。即使第二个 chunk 最终写入 `sub/p_abcd1234/assets/feature-data-<hash>.js`，SystemJS 仍以 `feature-data-<hash>.js` 标识它；`import.meta.url` 也使用当前 chunk 的逻辑 ID。

`transport` 根据最终 chunk 列表生成：每个可加载 chunk 都有一个固定的 `case`，模块 ID 和 `require` 路径直接写入构建产物，未知 ID 会被拒绝。

```js
function transport(moduleId) {
    switch (moduleId) {
        case 'page-a.js':
            return require('./assets/page-a.js')
        case 'feature-data-<hash>.js':
            return require.async('../sub/p_abcd1234/assets/feature-data-<hash>.js')
        default:
            throw new Error(`Unknown module: ${moduleId}`)
    }
}
```

`case` 是 SystemJS 的逻辑 ID，`require` 参数才是相对于 transport 的物理路径。加载方式只由规划后的 `PackageLocation` 决定：分包中的 System.register 文件使用 `require.async()`，主包中的 System.register 文件使用 `require()`；同时供 CommonJS 和 SystemJS 使用的 chunk 必须位于主包。

### 启动过程

每个原生入口首先通过 CommonJS 加载 `assets/bootstrap-<hash>.js`。这个 chunk 会安装定制版 SystemJS Core，并设置 `System.instantiate = transport`。

随后，原生入口会同步加载包含对应参数对象的 chunk，并把它的默认导出传给微信注册函数：

```text
加载 bootstrap chunk
  → 同步加载包含 App() 参数对象的 chunk
  → 取得默认导出
  → 调用 App(默认导出)
```

Page 和 Component 使用相同过程。业务动态导入仍使用异步加载。

### 同步加载：`System.importSync()`

`System.importSync()` 会：

1. 通过 `transport` 取得目标模块的注册数据；
2. 为目标模块和它递归静态依赖的模块创建注册表条目；
3. 连接用于实时更新导出值的回调；
4. 按依赖优先顺序执行；
5. 返回包含模块全部导出的命名空间对象。

`System.importSync()` 和 `System.import()` 共用同一个注册表。同一 ID 只会初始化和执行一次，并返回同一个模块命名空间；静态循环、声明阶段导出和实时绑定（live bindings）也通过这张注册表处理。

同步通道只服务于 vpt 生成的 App、Page 和 Component 原生入口，不是业务代码使用的 API。vpt 统一控制这些入口、参数对象所在 chunk 的位置和物理加载方式，保证默认导出从主包同步取得。

### 异步加载：`System.import()`

应用动态导入最终使用 `System.import()`。它会：

- 等待 `require.async()` 返回分包中的模块注册数据；
- 在执行引用方之前连接完整静态依赖图；
- 等待依赖中的顶层 `await`；
- 保留实时绑定、共享模块命名空间、循环依赖和单次执行语义。

即使一个按需加载的循环依赖跨越多个物理分包，SystemJS 仍会按统一 ID 复用同一注册表条目，并把它们作为一张依赖图完成连接和执行。

## 开发模式

第一次微信开发构建仍使用相同的物理输出和位置规划，但移除内容哈希以保持文件路径稳定。普通 JavaScript HMR 由 Rolldown 开发运行时直接生成源码模块补丁，只改写 `hmr/patches.js`；它不会进入完整输出的 `renderStart`、`renderChunk` 或 `generateBundle`，因此不会运行 LTHP、扫描最终 chunk 图、重新分配分包或重写普通 chunk。

只有初始构建和明确请求的完整构建会重新执行一次位置规划。完整构建本来就需要重新生成全部物理输出，LTHP 在其中增加的是一次规划成本：常见稀疏图通常是毫秒级，随后文件最终化随 chunk 数线性增长。普通补丁的 16 ms 合并窗口、补丁发布、React Refresh 和开发者工具页面替换路径均不受规划器影响。

无法安全接受的更新才触发完整构建；此时应用状态会按既有恢复协议重置。完整过程参见[热更新原理](/references/hmr-implementation/)。

## Web 输出

Web 不使用上述 SystemJS 运行时或生成分包。vpt 会：

1. 在 `index.html` 注入 vpt 生成的 H5 App 入口；
2. 将 App 配置和页面路由写入该入口；
3. 为每条路由生成浏览器动态 `import()`，加载 `src/<page-path>.tsx`；
4. 交给 Vite/Rolldown 和浏览器原生模块机制执行。

共享源码仍然只使用静态 `import` 和动态 `import()`；微信专用运行时代码不会进入 H5 输出。
