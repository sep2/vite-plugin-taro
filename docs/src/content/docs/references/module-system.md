---
title: 模块系统
description: vpt 在 H5 与微信小程序目标中解析、切分、放置和执行 JavaScript 模块的完整机制。
---

vpt 让应用始终使用 ESM：同步依赖写 `import`，按需加载写 `import()`。H5 继续使用 Vite 和浏览器的模块机制；微信目标则把 Rolldown 的构建结果转换为微信可以同步启动、按需加载和自动分包的应用。

本文涉及两种模块：

- **源码模块**：Vite/Rolldown 解析的源码文件；
- **输出模块**：Rolldown 切分出的最终 chunk。

它们不一一对应。Rolldown 负责解析、转换、删除未使用代码（tree shaking）、合并模块作用域（scope hoisting）和切分 chunk；vpt 在最终输出阶段处理微信入口、运行时加载和物理分包。

## 这套设计解决了什么

Vite/Rolldown 面向 ESM 和异步 chunk 加载，微信小程序却要求同步注册原生入口，并通过不同 API 加载主包与分包文件。如果把这些限制直接暴露给应用，业务代码就必须维护微信专用入口、包路径、共享依赖和加载顺序。

| 冲突 | vpt 的解决方式 |
| --- | --- |
| `App()`、`Page()`、`Component()` 必须同步注册 | 生成固定路径的极小原生入口，并把启动所需的完整依赖放在主包 |
| 主包和分包使用不同的物理加载 API | 根据最终文件位置生成加载代码，业务模块不接触微信加载 API |
| 静态依赖可能跨越主包和多个分包 | 共享模块运行时按原依赖图连接模块；引用方和依赖不必位于同一分包，共享依赖也无需复制 |
| 手工分包会把目录和体积管理泄漏进业务架构 | 根据静态与动态导入关系自动分配模块位置，并生成分包和 `app.json` |

这套设计的核心是把**源码依赖关系**与**微信分包位置**分开。静态 `import` 不强制两个模块位于同一分包，动态 `import()` 也不指定某个分包。应用只表达同步依赖和异步加载边界，使业务代码与分包关系完全解耦。

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
   ├─ 根据模块 ID 加载这些文件的模块加载表
   └─ 与实际分包一致的 app.json
```

模块运行时会按源码依赖图连接这些文件，因此分包 A 中的模块可以静态引用主包或分包 B 中的模块。

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

### 1. 建立原生入口和配置模块

vpt 为微信生成以下内部入口：

```text
app.js                         → App 原生入口
comp.js                        → 递归 Component 原生入口
pages/<route>.js               → 对应 route 的 Page 原生入口
```

每个 Page 原生入口的源码 ID 都带有 route 查询参数。vpt 通过它找到对应的 Page 配置模块、`src/<page-path>.tsx` 和页面配置，使每条 route 在依赖图中拥有独立 ID。

原生入口只负责加载共享启动代码、同步取得配置对象，并调用微信的 `App()`、`Page()` 或 `Component()`。配置对象由 vpt 的配置模块创建：

- App 模块初始化 Taro React 运行时，并调用 `createReactApp()`；
- Page 模块先确保 App 已初始化，再调用 `createPageConfig()`；
- Component 模块同样先确保 App 已初始化，再创建递归组件配置。

配置模块必须同步返回一个非数组对象，否则原生入口无法完成注册。

### 2. 规划主包和分包

位置规划发生在 Rolldown 的 `renderStart` 阶段：源码模块已经完成转换，最终 chunks 还没有生成。

以下内容必须留在主包：

1. 每个原生入口；
2. 原生入口递归静态导入的全部模块；
3. 原生入口直接指向的配置模块；
4. 配置模块递归静态导入的全部模块。

```text
原生入口
   └─ 配置模块 [主包]
          ├─ 静态 import → 主包
          └─ 业务 import() → 按需加载边界
```

其他源码模块可以进入生成分包。规划器按照以下确定性规则分组：

1. 以转换后源码的 UTF-8 字节数估算模块大小；
2. 从大到小处理，大小相同时按源码模块 ID 排序；
3. 优先放入容纳该模块后剩余空间最小的现有分包；
4. 剩余空间相同时，优先放入使用相同动态入口或直接互相静态导入的模块所在分包；
5. 没有现有分包可容纳时创建新分包。

每个分包的规划预算为 `1,900,000` 字节，为运行时包装和 Rolldown 生成代码预留空间。单个超预算源码模块会独占一个分包；规划器不会拆分源码模块，也不保证最终上传体积必然低于微信限制。

动态 `import()` 创建加载边界，但一个动态边界不等于一个分包。边界后的模块会根据是否也作为启动依赖使用、转换后体积、分包剩余空间、是否由同一个 `import()` 入口使用，以及直接静态依赖关系分别确定位置。静态导入关系只是尽量同包的偏好，不是强制约束。

因此，位于分包 A 的引用方，其静态依赖可以位于主包、分包 A 或分包 B。每个模块仍然只归属一个物理包，不会为了满足跨包引用而复制。大型静态依赖图或循环依赖也可以拆到多个分包，由模块运行时保持原依赖关系和循环语义。

分包目录名来自该分包内排序后的源码模块 IDs：对它们计算 SHA-256，并取前 8 位。

```text
sub/p_<8位哈希>
```

Rolldown 的 chunk 分组配置会阻止不同物理包中的模块合并。如果最终 chunk 同时包含属于不同物理包的源码模块，构建会直接失败。

### 3. 生成最终文件和分包声明

主包普通 chunk 使用 `assets/<name>-<content-hash>.js`；分包 chunk 使用 `sub/p_<hash>/assets/<content-hash>.js`。删除未使用代码后没有实际输出的分包不会进入 `app.json`。

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

这些分包只存放 JavaScript，所以 `pages` 为空。传入 `appJson` 的 `subPackages` 或 `subpackages` 会被移除，最终声明完全来自实际输出。

:::note[位置规划目前只管理 JavaScript]
图片、字体、其他构建资源和全局 `app.wxss` 暂不参与位置规划。对这些资源的自动规划已列入后续版本，敬请期待。
:::

## 微信运行时实现：SystemJS

前面的源码和构建规则不要求应用了解具体加载器。当前微信目标使用内置的精简 SystemJS 来实现这些规则；这是 vpt 的内部实现，不是应用 API。

### 三种输出模块

源码中的 `native`、`capsule` 和 `amphibious` 是最终 chunk 的内部分类：

| 文档名称 | 源码名称 | 输出和执行方式 |
| --- | --- | --- |
| 原生模块 | `native` | 转为 CommonJS，只由微信原生模块系统执行 |
| SystemJS 注册模块 | `capsule` | CommonJS 文件只导出一份 SystemJS 注册数据，等待 SystemJS 执行 |
| 桥接模块 | `amphibious` | 作为 CommonJS 执行，并向 SystemJS 发布同一组缓存导出 |

原生入口和模块加载表属于原生模块。普通非入口 chunk 属于 SystemJS 注册模块。包含共享启动代码或 Rolldown 辅助运行时的 chunk 属于桥接模块；桥接判定优先级最高。

#### SystemJS 注册模块

普通 chunk 先变成匿名 `System.register()`，再包装成一份不会立即执行的数据：

```js
module.exports = [
    ['assets/dependency-<hash>.js'],
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

#### 桥接模块

共享启动模块必须先作为 CommonJS 安装模块运行时，随后又会被应用依赖图导入。Rolldown 辅助运行时出现时也有相同需求。

模块加载表会为桥接模块生成一份 SystemJS 注册数据。SystemJS 执行它时，才通过 `require()` 取得 CommonJS 已缓存的导出，并发布给 SystemJS。这样模块体只执行一次。延迟这次 `require()` 也避免了共享启动模块与模块加载表互相加载时产生初始化循环。

### 模块 ID 和加载表

模块在不同阶段使用不同身份：

| 身份 | 用途 |
| --- | --- |
| Vite/Rolldown 源码模块 ID | 源码转换、删除未使用代码、位置规划和开发补丁 |
| 最终 chunk 文件名 | SystemJS 模块 ID，以及 chunk 之间的静态和动态依赖 ID |
| 相对于模块加载表文件的路径 | 仅供生成的 `require()` 与 `require.async()` 使用 |

SystemJS 使用相对于微信输出根目录的 chunk 文件名作为模块 ID。构建时，vpt 会把 chunk 之间的相对引用转换成这种统一 ID：

```text
../../assets/shared.js  → assets/shared.js
./lazy.js                → sub/p_abcd1234/lazy.js
```

转换后的依赖 ID 与模块最终位于主包还是分包无关；`import.meta.url` 也使用当前 chunk 的统一 ID。

模块加载表在源码中名为 `transport`。它根据最终 chunk 列表生成：每个可加载 chunk 都有一个固定的 `case`，模块 ID 和 `require` 路径直接写入构建产物，未知 ID 会被拒绝。

```js
function transport(moduleId) {
    switch (moduleId) {
        case 'assets/page-a.js':
            return require('./page-a.js')
        case 'sub/p_abcd1234/assets/lazy-b.js':
            return require.async('../sub/p_abcd1234/assets/lazy-b.js')
        default:
            throw new Error(`Unknown System module: ${moduleId}`)
    }
}
```

加载方式只由最终文件位置决定：`sub/p_` 下的 SystemJS 注册模块使用 `require.async()`，其他注册模块使用 `require()`；桥接模块必须位于主包。

模块加载表会在 Rolldown 确定最终内容哈希之前写入全部文件引用，保证生成路径与内容哈希一致。由于加载表引用所有可加载 chunks，一个 chunk 变化也可能改变加载表及其引用方的哈希。

### 启动过程

每个原生入口首先通过 CommonJS 加载共享启动模块，源码中名为 `bootstrap`。它会：

1. 安装带 `importSync()` 扩展的精简 SystemJS；
2. 取得 `global.System`；
3. 将模块加载表设为 `System.instantiate`；
4. 导出 App 配置、配置对象校验函数，以及 Vite preload 包装器。

微信没有浏览器 `modulepreload`。这个 preload 包装器不会建立另一条加载通道，只会调用真正的模块加载函数。

原生入口源码中的直接 `import()` 仅用于告诉 Rolldown 在这里切分配置 chunk。输出转换器会把它改成同步加载：

```js
App(loadCapsuleConfig('App', () => global.System.importSync('assets/app-<hash>.js')))
```

这条改写只用于 vpt 生成的原生入口；业务动态导入仍使用异步 `System.import()`。

### 同步加载：`System.importSync()`

同步加载会：

1. 通过模块加载表取得目标模块的 SystemJS 注册数据；
2. 为目标模块和它递归静态依赖的模块创建注册表条目；
3. 连接用于实时更新导出值的回调；
4. 按依赖优先顺序执行；
5. 返回包含模块全部导出的命名空间对象。

同步和异步加载共用同一个 SystemJS 注册表。同一 ID 只会初始化和执行一次，并返回同一个模块命名空间；静态循环、声明阶段导出和实时绑定（live bindings）也通过这张注册表处理。

这条同步通道只服务于 vpt 生成的 App、Page 和 Component 原生入口，不是业务代码使用的 API。vpt 统一控制这些入口、对应模块的位置和物理加载方式，保证配置模块从主包同步取得；应用无需处理模块注册表状态或恢复逻辑。业务代码中的 `import()` 始终使用下面的异步加载通道。

### 异步加载：`System.import()`

应用动态导入最终使用异步加载。它会：

- 等待 `require.async()` 返回分包中的 SystemJS 注册数据；
- 在执行引用方之前连接完整静态依赖图；
- 等待依赖中的顶层 `await`；
- 保留实时绑定、共享模块命名空间、循环依赖和单次执行语义。

即使一个按需加载的循环依赖跨越多个物理分包，SystemJS 仍会按统一 ID 复用同一注册表条目，并把它们作为一张逻辑依赖图完成连接和执行。

## 开发模式

第一次微信开发构建仍使用相同的物理输出和位置规划，但移除内容哈希以保持文件路径稳定。Rolldown DevEngine 同时注入源码模块开发运行时。

| 层 | 责任 |
| --- | --- |
| SystemJS chunk 依赖图 | 初次加载物理文件，连接最终 chunks，处理主包与分包 |
| Rolldown 源码模块依赖图 | 管理可重新执行的模块函数、缓存、反向引用关系和 HMR 接受边界 |

普通 JavaScript 更新只改写所有页面预先直接依赖的 `hmr/patches.js`。App 级 Rolldown 运行时在原有 JavaScript 环境中同步应用源码模块执行函数补丁；SystemJS 不重新加载整套物理 chunks。无法安全接受的更新才触发完整物理构建，并重新建立两层依赖图。

因此，SystemJS 使用的最终 chunk ID 与 HMR `changedIds` 中的源码模块 ID 属于不同层次。

## Web 输出

Web 不使用上述微信模块运行时或生成分包。vpt 会：

1. 在 `index.html` 注入 vpt 生成的 H5 App 入口；
2. 将 App 配置和页面路由写入该入口；
3. 为每条路由生成浏览器动态 `import()`，加载 `src/<page-path>.tsx`；
4. 交给 Vite/Rolldown 和浏览器原生模块机制执行。

共享源码仍然只使用静态 `import` 和动态 `import()`；微信专用运行时代码不会进入 H5 输出。
