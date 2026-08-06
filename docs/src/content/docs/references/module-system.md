---
title: 模块系统
description: vpt 在 H5 与微信小程序目标中解析、切分、放置和执行 JavaScript 模块的完整机制。
---

vpt 让应用源码继续使用标准 ESM：同步依赖写 `import`，按需边界写 `import()`。H5 目标直接使用浏览器和 Vite 的模块流水线；微信小程序目标则在构建后增加一层运行时模块系统，把 Rolldown 生成的 ESM chunk 接到微信原生 CommonJS、主包和代码分包上。

本文中的“模块”可能指源码模块，也可能指最终 chunk。两者并不一一对应：Rolldown 仍然负责解析、tree shaking、scope hoisting 和 chunk 切分；微信运行时以**最终 chunk 文件名**作为 SystemJS 模块 ID。

## 这套设计解决了什么

Vite/Rolldown 面向 ESM 和异步 chunk 加载，而微信小程序的启动入口、模块格式与分包加载方式完全不同。vpt 的模块系统负责消除这组差异，让业务源码不必同时维护一套“Web 模块图”和一套“微信模块图”。

| 问题 | 设计如何解决 |
| --- | --- |
| 微信要求 `App()`、`Page()`、`Component()` 在入口执行时同步注册，普通动态 chunk 却是异步的 | 保留极小的 native CommonJS shell，并用 `System.importSync()` 激活位于主包的 eager capsule |
| 主包和分包使用不同的物理加载方式，业务模块不应知道自己最终位于哪里 | transport 根据最终文件位置生成字面量 `require()` 或 `require.async()`；源码仍只写 `import` 和 `import()` |
| 一个静态依赖图可能跨主包、多个分包甚至形成循环 | 使用一个全局 SystemJS registry 按规范 chunk ID 链接完整逻辑图，保留依赖顺序、live bindings、共享 namespace 和循环语义 |
| Bootstrap 等模块既要被 native shell 执行，又要被应用图导入 | 将其标记为 amphibious：CommonJS 只执行一次，SystemJS 发布同一个缓存 namespace，避免重复初始化 |
| 手工分包会把物理目录、容量调整和共享依赖处理泄漏进业务架构 | 根据同步与动态边界自动规划唯一 package owner，在体积预算内生成稳定的代码分包，并从最终 bundle 生成 `app.json` |
| 内容哈希只有在所有跨 chunk 连接都参与计算时才可信 | 在 Rolldown 确定最终哈希前物化完整 transport，使生成的物理引用进入 chunk 内容和哈希计算 |
| 微信开发工具通过物理文件变化交付更新，而应用模块状态需要跨页面重执行存活 | 初始代码仍由 SystemJS 加载物理 capsules；开发时另由 App 级 Rolldown runtime 管理 source-module factories、缓存和 HMR 边界 |

最终效果是：

- 业务代码只表达**同步依赖**和**异步边界**，不表达微信包路径；
- 微信原生入口始终同步、路径固定且足够小；
- lazy 代码可以跨物理分包共享依赖，而不复制模块；
- H5 继续使用 Vite 与浏览器原生模块机制，不承担微信 runtime 的复杂度。

## 总览

微信要求 `App()`、`Page()` 和 `Component()` 同步注册，但应用又需要 ESM、动态导入和跨分包依赖。vpt 将这两个执行世界分开：

```text
源码 ESM
   │
   │ Vite + Rolldown：解析、转换、tree shaking、切分
   ▼
最终 ESM chunks
   │
   ├─ native      → 微信 CommonJS
   ├─ capsule     → 惰性的 SystemJS registration
   └─ amphibious  → 微信 CommonJS + 同一 namespace 的 SystemJS registration

微信原生 App / Page / Component shell
   │
   │ System.importSync(eagerCapsuleId)
   ▼
主包中的同步 capsule 图
   │
   │ 应用源码中的 import()
   ▼
System.import(lazyCapsuleId)
   │
   ├─ 主包：require()
   └─ 生成分包：require.async()
```

整个微信应用只有一个安装在 `global.System` 上的 loader 和一个共享 registry。主包与所有生成分包都通过它链接同一张模块图。

## 应用源码看到的规则

### 静态导入

静态 `import` 表达同步依赖关系：

```ts
import { calculate } from './calculate'
```

如果该依赖从 App、页面或其他启动代码同步可达，它会留在主包的 eager 图中。如果静态边位于一个真正的动态边界之后，依赖也可以被放到生成分包；跨分包静态边由 SystemJS 链接，不需要修改源码路径。

### 动态导入

应用中的 `import()` 创建异步加载边界，并且始终返回 Promise：

```ts
const { createReport } = await import('./features/report')
```

动态导入进入 capsule 后会被转换为 SystemJS context 的 `import()`。它可以加载主包中的另一个 chunk，也可以通过 `require.async()` 取得生成分包中的 registration。

:::caution[同步图不能包含异步执行]
App、Page 和 Component 的 native shell 必须同步取得完整配置。它们的 eager capsule 及静态闭包不能使用顶层 `await`，也不能依赖异步 transport。顶层 `await` 只能出现在应用动态 `import()` 边界之后的 lazy 图中。
:::

### 不要依赖生成路径

`assets/<name>-<hash>.js` 和 `sub/p_<hash>/assets/<hash>.js` 都是构建产物，不是源码可导入的公共 ID。应用不应调用 `global.System`、`require.async()`，也不应手写生成分包路径；这些连接由 vpt 根据最终输出图生成。

## 微信构建如何建立入口

vpt 不把业务页面直接做成微信原生入口。解析器先建立以下 plugin-owned 输入：

```text
app.js                         → native App shell
comp.js                        → native recursive Component shell
pages/<route>.js               → route-specific native Page shell
transport                     → native module transport
```

每个页面 shell 的源码 ID 带有 route query。解析页面 capsule 和页面组件时，vpt 从该 query 找回配置中的页面路径，因此同一个 Page runtime source 会在模块图中保留多个互不混淆的页面身份。

native shell 只负责两件事：

1. 加载共享 bootstrap；
2. 同步加载对应 capsule 的默认导出，并传给微信的 `App()`、`Page()` 或 `Component()`。

例如，App shell 的源码动态导入只是一个 Rolldown split-point 标记。最终 native renderer 会把它改写为等价的同步调用：

```js
App(loadCapsuleConfig('App', () => global.System.importSync('assets/app-<hash>.js')))
```

这不是应用 `import()` 的通用改写。只有 native entry 直接指向其 eager capsule 的内部边界会变成 `importSync()`；capsule 内的动态导入仍然是异步 `System.import()`。

## 三种最终模块

模块种类在 **Rolldown 完成 chunk 切分之后**判定。

| 种类 | 判定 | 物理格式 | 执行者 |
| --- | --- | --- | --- |
| `native` | native entry，或 transport chunk | CommonJS | 微信原生模块系统 |
| `capsule` | 普通非 entry chunk | 导出 SystemJS registration tuple 的 CommonJS 文件 | SystemJS |
| `amphibious` | 包含 bootstrap 或 Rolldown helper runtime 的 chunk | CommonJS，并由 transport 暴露同一 namespace | 微信 CommonJS 与 SystemJS 共享一次执行结果 |

`amphibious` 身份优先于 entry 身份。如果 Rolldown 把其他模块合并进含有 amphibious runtime 的 chunk，整个最终 chunk 都按 amphibious 模块处理。

### Native 模块

Native renderer 将最终 ESM chunk 转成微信可以同步执行的 CommonJS。普通静态边成为字面量 `require()`；native shell 的 capsule split point 成为 `global.System.importSync()`。

`app.js`、`comp.js` 和每个 `pages/<route>.js` 使用微信要求的精确输出路径。transport 自身也是 native entry，但使用带内容哈希的 `assets/transport-<hash>.js` 文件名。

### Capsule

普通应用 chunk 会先从 ESM 转为一个匿名 `System.register()`，然后再包成惰性的 CommonJS 值：

```js
module.exports = [
    ['assets/dependency-<hash>.js'],
    function (exportBinding, context) {
        return {
            setters: [/* live-binding setters */],
            execute() {
                // 原 chunk 的执行体
            }
        }
    }
]
```

`require()` 一个 capsule 只返回 registration，不会执行应用模块体。声明、链接、依赖顺序、循环处理和执行都由 SystemJS registry 统一拥有。

wrapper 还会在最终 importing chunk 文件名已知时，把 Rolldown 产生的相对静态引用和字面量动态引用转换为相对输出根的规范 ID：

```text
../../assets/shared.js  → assets/shared.js
./lazy.js                → sub/p_abcd1234/lazy.js
```

运行时计算出的动态 ID 不会被 wrapper 猜测或重写。

### Amphibious 模块

Bootstrap 同时被 native shell 和 capsule 图引用。它必须先作为 CommonJS 安装 SystemJS，又必须在 SystemJS 图中提供同一组导出。Rolldown helper runtime 在出现时也具有相同的跨边界需求。

vpt 不执行两份模块体。transport 为 amphibious chunk 合成一个 registration；该 registration 的 `execute()` 才通过字面量 `require()` 取得已经由微信缓存的 CommonJS namespace，并将整组绑定发布给 SystemJS。

延迟 `require()` 也避免了 bootstrap 加载 transport、transport 又在创建 bootstrap registration 时立即加载 bootstrap 的递归环。

## Bootstrap、transport 与 registry

Bootstrap 是所有 native shell 共享的初始化屏障。它按以下顺序工作：

1. 安装带同步扩展的精简 SystemJS core；
2. 取得安装在微信 `global` 对象上的 `System`；
3. 把生成的 transport 设置为 `System.instantiate`；
4. 导出构建时写入的 App 配置、capsule 配置校验器和 Vite preload identity wrapper。

微信目标没有浏览器 `modulepreload`。Vite 注入的 preload helper 被解析到 bootstrap 中的 identity wrapper：它只调用 loader，不创建另一条预加载或执行通道。

### Transport 是闭合的字面量映射

构建时，vpt 根据最终 output graph 为每个 capsule 和 amphibious chunk 生成一个 switch case。概念上类似：

```js
function transport(moduleId) {
    switch (moduleId) {
        case 'assets/page-a.js':
            return require('./page-a.js')
        case 'sub/p_abcd1234/assets/lazy-b.js':
            return require.async('../sub/p_abcd1234/assets/lazy-b.js')
        case 'assets/bootstrap-c.js':
            return createAmphibiousRegistration(() => require('./bootstrap-c.js'))
        default:
            throw new Error(`Unknown System module: ${moduleId}`)
    }
}
```

加载方式由 chunk 的**最终物理路径**决定：`sub/p_` 下的文件使用异步 `require.async()`，其他 capsule 使用同步 `require()`。Amphibious 模块必须位于主包，否则构建失败。

所有 native require 参数都是构建时生成的字面量。transport 在 Rolldown 尚未确定最终内容哈希时写入这些引用，因此 transport、bootstrap 和引用它们的 chunk 的最终哈希都真实包含完整连接关系。一个 capsule 改名可能造成较广的哈希级联，这是当前设计的预期结果。

### 规范模块 ID

微信生产构建中，SystemJS ID 就是最终 chunk 文件名，统一相对于输出根：

```text
assets/page-a.js
sub/p_abcd1234/assets/lazy-b.js
```

SystemJS 不解析 native 相对路径。相对路径只存在于 transport 内部生成的 `require()` 参数中。`import.meta.url` 也使用当前规范 chunk ID。

| 身份 | 用途 |
| --- | --- |
| Vite/Rolldown source module ID | 转换、tree shaking、放置规划与开发补丁 |
| 最终 chunk 文件名 | SystemJS registry key 和 chunk 间依赖 ID |
| transport-relative 文件路径 | 仅供生成的 native `require()` / `require.async()` 使用 |

## 同步与异步加载

### `System.importSync()`

vpt 的 SystemJS core 增加了同步加载路径。它会在当前 JavaScript turn 内：

1. 通过 transport 取得 root registration；
2. 为 root 和静态闭包创建共享 registry record；
3. 连接 live-binding setter；
4. 以依赖优先顺序执行；
5. 返回 live module namespace。

同步和异步 import 共用同一个 registry，因此同一 ID 只实例化、执行一次，并返回同一个 namespace。同步路径同样支持静态循环、声明阶段导出和 live bindings。

如果任一 registration 的 transport 或 `execute()` 返回 thenable，`importSync()` 会立即抛出“module graph is asynchronous”。它不会回滚已经写入 registry 的 record；这表示当前构建违反了 eager placement 不变量，该运行时堆不能继续当作正常基线使用。

### `System.import()`

异步路径用于应用动态导入。它可以：

- 等待 `require.async()` 返回分包 registration；
- 在执行 importer 前加载并链接完整静态依赖图；
- 等待依赖的顶层 `await`；
- 保留 live bindings、共享依赖、循环依赖与单次执行语义；
- 让跨主包和多个生成分包的静态图继续保持一个逻辑图。

即使 lazy 静态循环的不同模块被放到不同物理分包，SystemJS 也会先创建和复用规范 ID 对应的 record，再完成链接与执行。

## 自动放置到主包和生成分包

放置规划发生在 `renderStart`：此时所有源码模块已经转换，但 Rolldown 还没有创建最终 chunks。规划结果是从 source module ID 到一个物理 package owner 的不可变映射。

### Eager 主包闭包

以下模块必须位于主包：

1. 每个 native entry；
2. native entry 的完整静态闭包；
3. native entry 直接动态导入的 eager capsule root；
4. 这些 eager capsule root 的完整静态闭包。

```text
native entry
   └─ direct import() marker → eager capsule root [main]
                                  ├─ static import → main
                                  └─ nested import() → genuine lazy boundary
```

第一个 `import()` 是 vpt native shell 内部的同步 capsule 标记。只有进入 capsule 后遇到的动态导入，才是应用可观察的异步边界。

### Lazy 模块打包

不属于 eager 集合的 transformed modules 会成为可放置的 lazy modules。当前 planner 使用以下确定性策略：

1. 用转换后源码的 UTF-8 字节数估算每个模块大小；
2. 按大小从大到小处理，module ID 作为稳定 tie-breaker；
3. 采用 best-fit，把模块放入仍可容纳它且剩余空间最小的 bin；
4. 剩余空间相同时，优先共享同一动态 root，其次优先直接静态相邻的模块；
5. 没有 bin 可容纳时创建新分包。

规划预算是 `1,900,000` 字节，为 capsule wrapper 和 bundler 生成代码预留空间。单个已经超过预算的模块仍会独占一个 bin；planner 不会拆分一个 source module，也不保证微信最终统计体积一定低于限制。

静态闭包和静态循环只是 co-location 偏好，不是不可拆分单元。大型 lazy 图可以跨多个分包，由 SystemJS 维持原有依赖方向和循环语义。

### 稳定归属与最终 chunk

每个 lazy source module 只有一个 package owner，不会为了跨分包引用复制共享模块。分包 root 由该 bin 中**排序后的 module IDs**计算 SHA-256 并取前 8 位：

```text
sub/p_<8位哈希>
```

Rolldown code-splitting groups 防止不同 owner 的模块合并成一个 chunk；如果最终 chunk 混入多个已知 owner，构建会直接报错。组不会递归吞入静态依赖，因此一个 lazy 静态闭包可以按规划分布在多个分包。

主包普通 chunk 使用 `assets/<name>-<content-hash>.js`；生成分包中的 chunk 使用 `sub/p_<hash>/assets/<content-hash>.js`。只有 tree shaking 后真正含有输出模块的分包才会写入 `app.json`，root 会去重并排序：

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

这些是只包含代码的分包，所以 `pages` 为空。`appJson` 中传入的 `subPackages` 或 `subpackages` 会被移除；最终声明完全来自当前输出图。

:::note[规划只管理 JavaScript module]
图片、字体、普通构建资源和全局 `app.wxss` 不参与这套 JavaScript module placement。
:::

## App、Page 和 Component capsule

三个 native 配置都在 capsule 内创建，而不是在 shell 中拼装：

- App capsule 初始化 Taro React runtime，解析配置的 App component，并调用 `createReactApp()`；
- Page capsule 先确保 App capsule 已初始化，再解析 route-specific Page component 并调用 `createPageConfig()`；
- Component capsule 同样经过 App 初始化屏障，再创建 Taro recursive component config。

native shell 只接受 capsule namespace 的 `default`。该值必须是非数组对象，而且 capsule 必须同步完成；否则 bootstrap 会立即拒绝注册。

这种分层让微信原生入口保持很小、路径固定且同步，同时让 Taro、React 和业务代码继续留在 Rolldown/SystemJS 管理的应用图中。

## 开发模式中的两层模块图

微信开发模式的第一次完整物理构建仍使用同一套 native、capsule、amphibious、transport 和 placement 架构，但文件名会去掉内容哈希以保持物理依赖稳定。Rolldown DevEngine 还会在输出中注入开发模块 runtime。

两层职责不同：

| 层 | 责任 |
| --- | --- |
| SystemJS 外层 chunk 图 | 初次取得物理 capsule，连接最终 chunks，处理分包与 eager/lazy 加载 |
| Rolldown 开发 source-module 图 | 注册可重新执行的 source module factories、缓存、反向 importer 和 HMR accept 边界 |

普通 JavaScript 更新不会重写和重新导入全部 capsule。DevEngine 把 source-module factory patch 写入所有页面预先直接依赖的 `hmr/patches.js`；App 级 Rolldown runtime 在原有堆中同步替换受影响 source modules。只有无法安全接受的更新才触发完整物理构建，并重新建立两层图。

因此，生产模块 ID 与开发补丁 ID 不应混为一谈：生产 SystemJS registry 以最终 chunk 文件名为键；HMR 的 `changedIds` 属于 Rolldown 开发 source-module 图。

## H5 目标

H5 不使用上述微信 transport 或 SystemJS core。vpt 会：

1. 在 `index.html` 注入 plugin-owned H5 App 模块；
2. 把 App 配置和页面 routes 写入该模块；
3. 为每个 route 生成浏览器动态 `import()`，加载对应 `src/<page-path>.tsx`；
4. 继续交给 Vite/Rolldown 和浏览器原生模块机制执行。

因此，`native`、`capsule`、`amphibious`、`importSync()` 和生成代码分包都是微信目标的实现。共享应用源码仍然使用同一套静态 `import` 与动态 `import()` 表达同步和异步关系。

## 实现不变量

维护或排查当前模块系统时，可以用以下不变量判断行为是否正确：

1. 微信应用只有一个 `global.System` registry。
2. App、Page 和 Component 必须从主包同步取得完整 capsule 配置。
3. Capsule 的 native `require()` 只能返回 registration，不能提前执行应用模块体。
4. 所有 SystemJS 依赖都使用相对输出根的最终 chunk ID。
5. Amphibious 模块的 CommonJS 模块体只能执行一次，SystemJS 必须发布同一个缓存 namespace。
6. Transport 只接受最终 output graph 中生成的 ID，并且每个 native 加载路径都是字面量。
7. 不同 package owner 不能被合并进同一个最终 chunk。
8. `sub/p_` 下的 capsule 异步加载；主包 capsule 同步加载。
9. Eager 静态闭包不能返回 thenable；lazy 图可以使用异步 transport 和顶层 `await`。
10. HMR source-module factories 不会创建第二套初始物理 chunk loader。
