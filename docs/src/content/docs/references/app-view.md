---
title: App 视图原理
description: vpt 如何在微信小程序中保持标准 React App，并把 App 视图呈现在每个页面中。
---

VPT 的 App 是标准 React 组件。它可以渲染布局、Provider、普通组件和原生组件，并通过 `children` 放置页面。

使用方法参见 [App 与页面](/guides/app-and-pages/)。

## 问题来自两个不同层级

React 页面和微信 Page 不是同一层概念。

React 描述应用中的组件关系：App 可以包裹页面，Provider 可以覆盖整个页面树，页面也可以作为普通
`children` 出现在任意组件中。

```text
App
├─ Header
├─ Page
└─ Footer
```

微信 Page 则是平台规定的渲染单元。每个路由拥有独立的 WXML、数据和更新入口，页面栈之上没有一个可以承载
App JSX 的公共视图层。

如果把两者强行一一对应，就需要为每个微信 Page 创建一份 React App。这样会复制 App state、Effect 和
Provider，也会改变标准 React App 的组件关系。

因此，正确方向不是让 React 服从微信 Page 的结构，而是保持 React 结构，再把渲染结果呈现到各个微信 Page。
VPT 将微信 Page 封装在实现层，不让它决定 React 组件如何组织。这与[全自动分包](/guides/automatic-subpackages/)
和[模块系统](/references/module-system/)遵循同一原则：

:::note[关注点分离原则]
**通过合理的抽象，VPT 将微信平台限制留在内部，让应用代码继续使用标准模型，同时不增加额外运行时开销。**
:::

## 原版 Taro 的基础

### React 结构已经正确

原版 Taro 只创建一个 React root。它在 App 下保存所有已挂载页面，并把它们作为 `children` 传给用户 App：

```text
React root
└─ AppWrapper
   └─ App
      └─ 用户组件
         ├─ Page A root
         └─ Page B root
```

这意味着原版 Taro 已经具备需要的 React 语义：

- App 只创建一次；
- App Provider 可以覆盖所有页面；
- 多个已打开页面可以同时保留；
- Context、Hook、Effect 和 ref 沿同一棵树工作。

VPT 直接保留这部分结构。

### App 组件也已经生成 Taro 节点

`View`、`Text` 和原生组件等 React host 组件会生成对应的 Taro 内存节点。假设 App 返回 Header、
`children` 和 Footer，原版 Taro 的内存树已经包含：

```text
App 容器
└─ App View
   ├─ Header
   ├─ Page A root
   ├─ Page B root
   └─ Footer
```

所以缺失的不是 App 组件，也不是 App 对应的 Taro 节点。它们已经存在，只是没有进入微信视图。

### 原生更新从 Page root 开始

每个 Page root 都连接到对应的微信 Page。Page 内的 Taro 节点发生变化时，Page root 会把变化提交给该 Page
的 `setData()`。

App 容器在原版 Taro 中只是普通节点，不属于任何 Page root。Header、Footer 等 App 节点因此没有原生更新
入口，它们的变化只保留在 Taro 内存树中。

### Page WXML 只渲染 Page root

原版 Taro 为每个微信 Page 生成自己的数据和 WXML。WXML 从该 Page root 开始递归渲染，不会读取 Page root
上方的 App 节点。

最终形成以下差异：

```text
React / Taro 内存树               微信视图

App View                          Page A
├─ Header                         └─ Page A 内容
├─ Page A root
├─ Page B root                    Page B
└─ Footer                         └─ Page B 内容
```

React 关系是完整的，Page 渲染也是完整的，只有 App 视图没有对应的微信输出。

## 为什么不能直接渲染完整 App 树

App 的 Taro 树同时包含 App 节点和所有已挂载 Page root。如果把整棵树交给每个微信 Page：

- Page A 会收到 Page B 的内容；
- Page B 也会收到 Page A 的内容；
- 页面栈越深，每个 Page 包含的无关页面越多；
- Page 更新会进入 App 数据，并影响所有 Page。

真正需要发送给每个微信 Page 的只有两部分：

```text
公共部分：App 视图，但不包含任何 Page root
局部部分：当前微信 Page 对应的 React Page 视图
```

这要求实现能够在 App 的 `children` 位置分开两部分数据，同时又不能拆开 React 树。

## 当前设计

基于原版 Taro 的结构，当前方案分为六步：

1. 保留原版 Taro 的单棵 React 树；
2. 在 App 的 `children` 位置加入稳定的页面标记；
3. 生成 App 渲染数据时在标记处停止；
4. 每个 Page 继续生成并更新自己的渲染数据；
5. Page WXML 在标记处插入当前 Page 内容；
6. 为 App 节点提供更新入口，并把 App 变化发送给已挂载 Page。

最终结构如下：

```text
一棵 React / Taro 树

App
└─ App 视图
   └─ 页面标记
      ├─ Page A root
      └─ Page B root

每个微信 Page

Page A                       Page B
├─ App 视图                  ├─ App 视图
└─ Page A 视图               └─ Page B 视图
```

每个微信 Page 显示 App，但 React 中仍然只有一个 App 实例、一份 state 和一组 Effect。微信 Page 只是呈现
结果，不决定 React 组件的所有权。

### 页面标记

Framework 在微信分支中把所有 Page 放进内部的 `vpt_page_outlet`。它就是用户 App 收到的 `children`，所以
用户把 `{children}` 放在哪里，页面标记就出现在哪里。App 必须恰好渲染一次 `{children}`；缺失或重复的 outlet
都不是有效的 App 结构。

这个标记同时解决两个问题：

- 在 React/Taro 内存树中，它继续持有所有 Page root，保持原有父子关系；
- 在 App 渲染数据中，它只表示“当前 Page 应插入这里”，不包含下面的 Page root。

页面栈变化只改变标记下面的内存节点，App 渲染数据的形状以及 Header、Footer 的位置保持不变。

### 独立的 App 与 Page 数据

每个微信 Page 内部持有两部分渲染数据：

- `app`：App 视图；
- `page`：当前 Page 视图。

两部分数据有不同的所有者和更新频率。App 变化需要显示在所有 Page 中，Page 变化只属于当前 Page。

如果把它们合成一棵数据树，Page 更新路径必须包含 Page 在 App 中的位置。App 一旦插入、删除或移动组件，
Page 的原生路径也会改变，实现需要持续翻译和协调两类更新。

保持 `app` 与 `page` 独立后：

- App 始终产生 `app.*` 更新；
- Page 始终产生 `page.*` 更新；
- App 布局变化不会改写 Page 路径；
- Page 更新不会进入 App 模板。

这不是应用需要理解的数据模型，而是 VPT 在微信渲染层使用的内部协议。

### App 更新入口

原版 App 容器没有 root，所以 App 节点无法提交原生更新。VPT 让已有 App 容器同时成为 App 更新 root，
Page 则继续使用各自原有的 Page root：

```text
App root     提交 app.*
Page A root  提交 page.*
Page B root  提交 page.*
```

App 和 Page root 的位置不同，因此可以直接确定各自的数据前缀，不需要给节点增加模式，也不需要在发送更新时
转换路径。

App root 提交更新时，运行时读取当前微信页面栈，把同一份 App 变化发送给每个已挂载 Page。微信已经维护了
页面栈，所以 VPT 不再维护另一份 Page 列表。

### Page 组合两部分视图

Page WXML 同时拥有 `app` 和 `page`，因此最适合在最后一步组合它们：

1. App 数据进入 Taro 原有的递归组件；
2. 当前 Page 数据成为这个组件的 slot；
3. App 模板递归到页面标记时输出 slot。

Page 数据始终留在 Page WXML 中，不会作为属性穿过整棵 App 模板。这样 Page 更新只影响 Page slot，不会让
App 模板重新依赖 Page 数据。

这种组合也保留了双方原有职责：Taro 继续处理节点递归和事件，微信 slot 只负责在正确位置放入当前页面。

### fragment 与 slot 转发

App 可以返回一个或多个顶层组件，而 Taro 的递归组件一次从一个节点开始。内部的 `vpt_fragment` 把 App
顶层集合适配成一个统一入口，本身不产生微信布局节点。

Taro 在模板递归达到深度限制时，会进入下一层递归组件。Page slot 必须继续穿过这些边界，直到遇到
`vpt_page_outlet`。React host renderer 在每次 commit 结束后读取最终 Taro host 树，并缓存 outlet 到 App root
的祖先节点数组。renderer 跳过未变化的 root 侧后缀，让旧的 leaf 侧节点通过普通 host prop 得到 `vo: false`，
新的节点得到 `vo: true`。递归边界只读取当前节点的 `i.vo`；只有 outlet 所在分支转发 slot，普通 Page 递归和
App 的其他分支不创建无名 slot。

这些属性更新发生在 React 同步 commit 结束、Taro 延迟求值结构序列化之前。因此 Taro 原有 `setAttribute()`、
细粒度队列和 `hydrate()` 会像处理普通属性一样处理 `vo`，不需要投影专用 scheduler 或完整 App snapshot。
React 在跨父级移动时可能替换 outlet host；旧引用脱离 App root 后，renderer 查找一次新的唯一 outlet 并缓存
新路径。

fragment 和 outlet 模板位于共享 `base.wxml`。原因是 App 递归发生在 `comp.wxml` 的作用域中，Page WXML
定义的私有模板在该作用域不可见。放在共享模板中后，根组件和后续递归组件都能使用同一组定义。

`comp` 完全保留 Taro 原有的属性、节点递归和事件模型。`vo` 属于已存在的紧凑节点 `i`，不传递 Page 数据，
也不引入 App/Page 模式。生成的微信原生组件注册在 `app.json`，所以 App 和 Page 的模板都能解析这些组件。

## 运行流程

### 首次渲染

新 Page 创建时，Page root 已经开始收集自己的 `page.*` 更新。React 把 Page root 提交到页面标记后，VPT 再
读取当前 App 视图，并把它加入同一批初始更新。

随后 Taro 通过一次 `Page.setData()` 同时提交 App 和 Page：

```text
React 提交 Page
├─ 当前 App 视图
└─ 当前 Page 视图
   └─ 一次微信更新
```

因此 App 外层和 Page 内容同时出现，不需要先显示页面再补上 App。

### Page 更新

Page state 变化时：

1. React 只更新对应 Page；
2. Page root 只生成 `page.*`；
3. 当前微信 Page 更新自己的 slot 内容。

App 数据和 App 模板都不参与这次更新，其他 Page 也不会收到更新。因此 Page 更新不会带来额外的性能开销。

### App 更新

App state 变化时：

1. React 只更新唯一的 App；
2. commit 结束后，renderer 把变化的 outlet 祖先作为普通 `vo` 属性并入 Taro 队列；
3. App root 生成细粒度 `app.*`；
4. 同一份更新发送到页面栈中的每个 Page；
5. 每个 Page 更新自己的 App 视图，Page 内容保持不变。

每个 Page 都显示 App，因此向每个 Page 发送 App 渲染更新是功能本身需要的工作，不是适配层产生的额外性能
开销。

### 页面跳转

打开新页面时，新 Page root 被加入页面标记。已有 Page 不需要接收页面结构更新；新 Page 在首次渲染时直接取得
当前 App 视图和自己的 Page 视图。

关闭页面时，React 和 Taro 正常移除对应 Page root。其他 Page 的 App 和 Page 数据不需要重建。

## Context、事件和原生组件

Page 始终是 App 的普通 React 后代，所以 Context、Effect、ref、错误边界和 Suspense 使用标准 React 规则。
开发时，React Refresh 也更新同一棵现有组件树。

App 和 Page 继续使用 Taro 原有的节点身份和事件入口。模板组合不会创建另一套事件系统，也不会改变事件对应
的 React 组件。

React App 只有一个，但每个微信 Page 都需要自己的 App 视图。因此，App 中的微信原生组件会在每个 Page 中
产生一个原生实例。共享业务状态仍由 React Context 或状态库持有。

## 性能分析

上述运行流程可以量化为以下模型。

### 更新复杂度

令：

- `P` 为页面栈中的 Page 数量；
- `W` 为 App 渲染数据大小；
- `Rᵢ` 为第 `i` 个 Page 的渲染数据大小；
- `ΔA` 为一次 App 更新实际变化的数据；
- `ΔRᵢ` 为一次 Page 更新实际变化的数据。

| 操作 | React 工作 | 微信更新次数 | 传输量 | 模板影响 |
| --- | --- | ---: | ---: | --- |
| Page 局部更新 | 只更新对应 Page | 1 | `O(ΔRᵢ)` | 只更新 Page slot |
| Page 结构更新 | 只更新对应 Page | 1 | `O(ΔRᵢ)` 到 `O(Rᵢ)` | 与原版 Taro 的数组更新相同 |
| App 局部更新 | 只更新一次 App | `P` | `O(P × ΔA)` | 每个 Page 更新 App 变化部分 |
| App 结构更新 | 只更新一次 App | `P` | `O(P × ΔA)` 到 `O(P × W)` | 每个 Page 更新 App 结构 |
| React 更新但视图不变 | 正常 React 更新 | 0 | 0 | 无 |
| 新 Page 首次渲染 | 挂载一个 Page | 1 | `O(W + Rᵢ)` | App 与 Page 同时出现 |
| push 对已有 Page | 挂载新 Page | 0 次 App 更新 | 0 App 数据 | 已有 Page 不变 |
| pop | 卸载目标 Page | 0 次 App 更新 | 0 App 数据 | 其余 Page 不变 |

Page 或 App 的结构更新可能触发 Taro 原有的子数组替换，因此传输量可能扩大到相关数组。这是 Taro 的节点更新
方式，不是 App/Page 连接新增的路径转换。App state 变化但最终视图不变时，Taro 不会调用 `setData()`。

新 Page 挂载时，VPT 读取一次当前 App 视图，复杂度为 `O(W)`。读取在页面标记处停止，不遍历其他 Page root，
所以成本不随已有 Page 内容总量增长。App 与 Page 数据进入同一次初始 `setData()`。

令 `D` 为 outlet 到 App root 的宿主节点深度。React commit 后的 parent walk 和祖先数组比较为 `O(D)`；
持久状态也只有 `O(D)` 个 Taro 节点引用。普通属性更新不会改变路径，结构更新只给进入或离开路径的节点发送
普通 `vo` 属性，因此投影新增传输量最多与变化路径长度成正比，不依赖 App 总大小 `W` 或 Page 大小。Taro 的
结构序列化仍使用原有 lazy hydrate，Page hydrate 完全不参与投影。WXML 在每个递归边界只读取 `i.vo`，始终为
`O(1)`。

### Context 更新

Context 仍遵循 React 的消费关系：

- 只有 Page 消费变化时，只产生对应 Page 的 `page.*`；
- 只有 App 视图消费变化时，只产生一批 `app.*`，再发送给每个 Page；
- App 和 Page 都消费变化时，两类 root 各自合并自己的更新。

实现不会为了 Context 特殊遍历 App 或 Page，也不会把两类数据合成一个更大的更新。

### 固定结构

每个 Page 保存自己正在显示的 App 视图，这是独立 Page 呈现相同 App 的必要结果。适配使用一个 App root、
每个 Page 一个 virtual `comp`、fragment/outlet 模板和紧凑数据中的投影路径。它们不创建微信布局节点，也不
增加额外的桥接调用；Taro 原有的节点队列、事件系统和 Page root 继续直接使用。

### 微信内部处理

VPT 可以确定 React 更新次数、`setData()` 次数、数据路径和传输内容。微信没有公开自定义组件属性在内部如何
处理细粒度对象路径，因此这些路径不能证明组件内部只处理变化字段。设备端成本应使用相同 App 结构实际测量。

### 结论

VPT 不改变 Page 的更新模型，不按 Page 重复执行 React App，也不因页面跳转更新已有 Page。App 更新产生 `P`
次微信更新，是 `P` 个独立 Page 显示同一 App 的必要工作。

**因此，在可以观察和控制的 React、Taro 与数据传输层，适配没有引入与视图无关的开销。**

## H5

H5 直接渲染标准 React 树，不需要页面标记、`app`/`page` 数据组合、WXML slot 或 App 更新分发。WX 专用逻辑
不会进入 H5 运行流程，Taro Web Runtime 保持上游实现。
