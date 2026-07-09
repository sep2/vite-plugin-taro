---
name: compiler
description: 负责编译：项目编译、单文件编译、编译到指定页面、构建 npm、刷新模拟器。
---

# compiler

## 用途

处理与编译、单文件构建校验、模拟器刷新相关的操作。先判断用户要的是“局部文件编译结果”，还是“让项目窗口里的模拟器重新运行”。

典型任务：

- 编译并打开指定页面
- 校验单个 JS/TS 文件并查看结果
- 编译 WXML 模板或 WXSS 样式
- 构建 npm
- 重编译刷新模拟器

## 工作流

1. 确认项目路径，必要时先用 `open_project_window` 打开项目窗口。
2. 如果用户要模拟器打开某个页面看效果，用 `simulator_open_page`。
3. 如果用户只说刷新、重新跑当前页面、模拟器像没更新，用 `simulator_refresh`。
4. 如果用户只想排查局部文件语法或产物，用单文件编译工具。
5. 如果失败，返回工具输出中的错误信息，不要把模拟器刷新结果当成编译校验结果。

## 工具列表

### simulator_open_page — 编译并打开指定页面

触发项目窗口模拟器编译并打开指定页面，不修改持久编译条件列表。适合“去某个页面看效果”，不承诺返回完整编译错误。

```bash
wechatide -c <clientName> -t simulator_open_page --project <project> --page pages/index/index [--query id=1]
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `page` | string | 是 | 目标页面路径（如 `"pages/index/index"`） |
| `query` | string | 否 | 页面参数（如 `"id=1&type=test"`） |
| `scene` | number | 否 | 场景值 |

---

### compile_js — 编译单个 JS 文件

获取单个 JS/TS 文件编译结果摘要。

```bash
wechatide -c <clientName> -t compile_js --project <project> --file-path pages/index/index.js
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `filePath` | string | 是 | 相对 miniprogramRoot 或 pluginRoot 的文件路径 |

---

### compile_wxml — 编译 WXML 模板

编译 WXML 模板文件，返回编译结果。`isPlugin` / `isLazyLoad` 由工具根据项目配置自动推断。

```bash
wechatide -c <clientName> -t compile_wxml --project <project> --file-path pages/index/index.wxml
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `filePath` | string | 是 | 相对 miniprogramRoot 或 pluginRoot 的 `.wxml` 路径 |

---

### compile_wxss — 编译 WXSS 样式

编译 WXSS 样式文件，返回编译结果。`isPlugin` / `isLazyLoad` 由工具根据项目配置自动推断。

```bash
wechatide -c <clientName> -t compile_wxss --project <project> --file-path pages/index/index.wxss
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `filePath` | string | 是 | 相对 miniprogramRoot 或 pluginRoot 的 `.wxss` 路径 |

---

### buildnpm — 构建 npm

构建项目 npm 依赖产物，会修改本地构建结果。

```bash
wechatide -c <clientName> -t buildnpm --project <project> [--compile-type miniprogram]
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `compile-type` | string | 否 | 编译类型：`miniprogram`（默认）或 `plugin` |

---

### simulator_refresh — 刷新模拟器

触发项目窗口模拟器重新编译/刷新当前页面。适合恢复或刷新运行态。返回 `success: true` 只表示刷新动作已触发，不代表编译通过；需要验证局部文件结果时，还要按场景单独调用单文件编译工具。

```bash
wechatide -c <clientName> -t simulator_refresh --project <project>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |

---

## 常见目标到工具

| 用户意图 | 选择 |
|---------|------|
| "直接编到这个页面让我看效果" | `simulator_open_page` |
| "只想看这个 TS/JS 文件编译产物" | `compile_js` |
| "模板是不是编挂了" | `compile_wxml` |
| "样式编译是不是有问题" | `compile_wxss` |
| "依赖没好，帮我构建 npm" | `buildnpm` |
| "页面没刷新，重新跑一下" | `simulator_refresh` |

## 选择指引

- 想直接跳到某个页面并看模拟器表现：用 `simulator_open_page`
- 只想刷新当前模拟器页面或等同点工具栏编译按钮：用 `simulator_refresh`；返回成功不代表编译通过
- 只排查单文件编译产物：用 `compile_js`、`compile_wxml`、`compile_wxss`
- 依赖产物缺失或用户明确要求构建 npm：用 `buildnpm`

## 默认边界

- `simulator_open_page` 和 `simulator_refresh` 是本地模拟器操作，返回成功只表示触发成功；要确认编译结果必须再用合适的编译校验工具
- 单文件编译工具只覆盖局部文件，不代表整个项目能通过完整构建
- `buildnpm` 会修改本地构建产物，不要在被动排查中默认执行
