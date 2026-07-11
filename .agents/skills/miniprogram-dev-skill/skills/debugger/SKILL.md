---
name: debugger
description: 负责排查：查日志、查运行时、定位问题原因，也包括模拟器相关的状态检查与刷新。
---

# debugger

## 用途

这个 scene 用来排查当前小程序项目里的问题，并给出下一步处理方向。

适合场景：

- 查 console 日志
- 查 network 请求
- 检查运行时状态
- 调用 wx API 做诊断
- 检查模拟器当前状态是否异常
- 通过刷新模拟器验证问题是否与当前运行态有关
- 对问题做归因并给出下一步建议

## 工作流

1. 先读取项目状态和运行时信息。
2. 选择能产出证据的最小工具集合。
3. 采集日志、页面、运行时或模拟器相关证据。
4. 判断问题更像日志问题、运行时问题、页面问题还是模拟器状态问题。
5. 给出最可能的原因和下一步动作。

## 工具列表

### get_app_console_content — 读取 console 日志

对小程序 console 缓冲区执行 grep 过滤并返回命中行。

```bash
wechatide -c <clientName> -t get_app_console_content --project <project> --command "grep -i error"
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `command` | string | 是 | grep 命令字符串（不含文件名） |

**command 用法**：
- 获取全部日志：`"grep -n ."`
- 过滤 error：`"grep -i error"`
- 过滤 warn：`"grep -n warn"`
- 过滤特定关键字：`"grep -i 'your keyword'"`

注意：不要传 `"all"` 等枚举值，必须是合法的 grep 命令。返回空字符串代表没有匹配行，不代表 console 为空。

---

### get_app_network_content — 读取 network 请求

对小程序 network 缓冲区执行 grep 过滤并返回命中行。

```bash
wechatide -c <clientName> -t get_app_network_content --project <project> --command "grep -n ."
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `command` | string | 是 | grep 命令字符串（不含文件名） |

**command 用法**：
- 获取全部请求：`"grep -n ."`
- 过滤失败请求：`"grep -i fail"`
- 过滤特定接口：`"grep -i '/api/xxx'"`

---

### automation_runtime_info — 运行时信息

获取 pageStack、currentPage 或 systemInfo。

```bash
wechatide -c <clientName> -t automation_runtime_info --project <project> --action currentPage
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `action` | string | 是 | `pageStack`、`currentPage`、`systemInfo` |

---

### automation_wx_api — 小程序 API 调试

调用、mock 或恢复 wx API。

```bash
wechatide -c <clientName> -t automation_wx_api --project <project> --action call --method getSystemInfo
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `action` | string | 是 | `call`、`mock`、`restore` |
| `method` | string | 是 | wx API 方法名（如 `"getSystemInfo"`） |
| `args` | array | 否 | 调用参数；CLI 使用 `--args-file` |
| `result` | object | 否 | mock 返回值；CLI 使用 `--result-file` |
| `functionDeclaration` | string | 否 | mock 函数声明 |

---

### simulator_refresh — 刷新模拟器

触发模拟器重编译刷新。返回 `success: true` 只表示刷新动作已触发，不代表编译通过；需要验证编译结果时，应按场景单独调用完整编译或单文件编译工具。

```bash
wechatide -c <clientName> -t simulator_refresh --project <project>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |

---

### debug_clear_cache — 清理缓存

清理项目缓存，支持细粒度操作。

```bash
wechatide -c <clientName> -t debug_clear_cache --project <project> --action cleanAll
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `action` | string | 是 | 缓存操作类型 |

---

## 常见目标到工具

| 用户意图 | 选择 |
|---------|------|
| "给我看报错日志" | `get_app_console_content`（command: `"grep -i error"`） |
| "接口为什么没回来" | `get_app_network_content`（command: `"grep -n ."`） |
| "项目是不是没跑起来" | `automation_runtime_info`（action: `"currentPage"`） |
| "怀疑是 wx API 行为不对" | `automation_wx_api` |
| "模拟器像卡住了" | `simulator_refresh`，然后重新采证 |
| "清一下缓存再试" | `debug_clear_cache` |

## 模拟器相关场景

以下情况适合在这个 scene 中使用模拟器相关能力：

- 页面改动后模拟器没有刷新
- 当前表现像是编译结果或运行态卡住
- 需要确认问题是页面逻辑问题，还是模拟器当前状态问题
- 需要在重启模拟器后重新验证当前页面表现

推荐做法：

1. 先读取项目状态和运行时信息。
2. 如果怀疑是模拟器运行态异常，再执行 `simulator_refresh`。
3. 重启后重新读取 `automation_runtime_info`、页面状态或相关日志。
4. 用重启前后的差异帮助判断问题是否来自模拟器状态。

## 常见问题类型

排查时可以先按下面几类理解：

- `runtime-exception`：运行时报错、页面逻辑异常、状态不一致
- `network-failure`：请求失败、接口超时、返回异常
- `preview-blocked`：预览流程无法继续、二维码或真机预览异常
- `automation-mismatch`：自动化动作执行了，但页面结果不符合预期
- `environment-not-ready`：项目没接上、运行时不可读、环境前提没补齐
- `simulator-state-error`：模拟器没刷新、运行态卡住、重启前后表现明显不同

## 建议输出

建议至少说明这些内容：

- `summary`
- `issueClass`
- `symptom`
- `evidence`
- `likelyCause`
- `recoveryPath`
- `nextActions`

## 默认边界

- 默认优先使用只读诊断工具
- `simulator_refresh` 适合用于验证和恢复当前运行态，但不要无差别反复执行；它的成功返回不能当作编译结果
- 不要通过这个 scene 隐式触发测试账号、ticket 变更、远程调试或关闭工具
