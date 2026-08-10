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

位置规划发生在 Rolldown 的 `renderStart` 阶段：源码模块已经完成转换，最终 chunks 还没有生成。

以下内容必须留在主包：

1. App、Page 和 Component 原生入口；
2. `bootstrap` 和 `transport` chunks；
3. 创建 `App()`、`Page()` 和 `Component()` 参数对象的代码；
4. 以上入口递归静态导入的全部模块。

```text
原生入口 [主包]
   ├─ 静态 import → bootstrap chunk [主包]
   └─ 静态 import → 微信入口参数所在 chunk [主包]
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

动态 `import()` 创建加载边界，但一个动态边界不等于一个分包。边界后的模块会根据是否也作为启动依赖使用、转换后体积、分包剩余空间、是否由同一个 `import()` 入口使用，以及直接静态依赖关系分别确定位置。静态导入关系只是同包偏好，不是强制约束。

因此，位于分包 A 的引用方，其静态依赖可以位于主包、分包 A 或分包 B。每个模块仍然只归属一个物理包，不会为了满足跨包引用而复制。大型静态依赖图或循环依赖也可以拆到多个分包，由 SystemJS 保持原依赖关系和循环语义。

分包目录名来自该分包内排序后的源码模块 IDs：对它们计算 SHA-256，并取前 8 位。

```text
sub/p_<8位哈希>
```

Rolldown 的 chunk 分组配置会阻止不同物理包中的模块合并。如果最终 chunk 同时包含属于不同物理包的源码模块，构建会直接失败。

### 3. 生成最终文件和分包声明

主包普通 chunk 使用 `assets/<name>-<content-hash>.js`。分包 chunk 使用 `sub/p_<package-hash>/assets/<first-module-name>-<content-hash>.js`：`first-module-name` 来自 Rolldown 最终 chunk 模块列表中的第一个源码文件名，并移除查询参数、片段和扩展名。删除未使用代码后没有实际输出的分包不会进入 `app.json`。

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

### CommonJS 与 SystemJS 共享导出

`bootstrap` chunk 必须先作为 CommonJS 安装 SystemJS，随后又会被应用依赖图导入。Rolldown 辅助运行时出现时也有相同需求。

`transport` 会为这些 chunk 生成注册数据。SystemJS 执行它时，才通过 `require()` 取得 CommonJS 已缓存的导出，并发布到统一模块注册表。这样模块体只执行一次，也避免 `bootstrap` 与 `transport` 互相加载时产生初始化循环。

### 模块 ID 和 transport

模块在不同阶段使用不同身份：

| 身份 | 用途 |
| --- | --- |
| Vite/Rolldown 源码模块 ID | 源码转换、删除未使用代码、位置规划和开发补丁 |
| 最终 chunk 文件名 | 运行时模块 ID，以及 chunk 之间的静态和动态依赖 ID |
| 相对于 `transport` chunk 的路径 | 仅供生成的 `require()` 与 `require.async()` 使用 |

SystemJS 使用相对于微信输出根目录的 chunk 文件名作为模块 ID。构建时，vpt 会把 chunk 之间的相对引用转换成统一 ID：

```text
../../assets/shared-<hash>.js  → assets/shared-<hash>.js
./feature-data-<hash>.js       → sub/p_abcd1234/assets/feature-data-<hash>.js
```

转换后的依赖 ID 与模块最终位于主包还是分包无关；`import.meta.url` 也使用当前 chunk 的统一 ID。

`transport` 根据最终 chunk 列表生成：每个可加载 chunk 都有一个固定的 `case`，模块 ID 和 `require` 路径直接写入构建产物，未知 ID 会被拒绝。

```js
function transport(moduleId) {
    switch (moduleId) {
        case 'assets/page-a.js':
            return require('./page-a.js')
        case 'sub/p_abcd1234/assets/feature-data-<hash>.js':
            return require.async('../sub/p_abcd1234/assets/feature-data-<hash>.js')
        default:
            throw new Error(`Unknown module: ${moduleId}`)
    }
}
```

加载方式只由最终文件位置决定：`sub/p_` 下的 System.register 文件使用 `require.async()`，其他 System.register 文件使用 `require()`；同时供 CommonJS 和 SystemJS 使用的 chunk 必须位于主包。

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

第一次微信开发构建仍使用相同的物理输出和位置规划，但移除内容哈希以保持文件路径稳定。后续 JavaScript 更新由 Rolldown 开发运行时应用源码模块补丁，不会重新加载整套物理 chunks；无法安全接受的更新才触发完整构建。

完整过程参见[热更新原理](/references/hmr-implementation/)。

## Web 输出

Web 不使用上述 SystemJS 运行时或生成分包。vpt 会：

1. 在 `index.html` 注入 vpt 生成的 H5 App 入口；
2. 将 App 配置和页面路由写入该入口；
3. 为每条路由生成浏览器动态 `import()`，加载 `src/<page-path>.tsx`；
4. 交给 Vite/Rolldown 和浏览器原生模块机制执行。

共享源码仍然只使用静态 `import` 和动态 `import()`；微信专用运行时代码不会进入 H5 输出。
