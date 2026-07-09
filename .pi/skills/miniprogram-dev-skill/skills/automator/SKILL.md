---
name: automator
description: 负责页面操作：点击、输入、滚动、截图、验证。
---

# automator

## 用途

在当前小程序项目内做确定性的 UI 操作和验证。

典型情况：

- 点按钮、输入文字、滚动页面
- 在页面间导航
- 截图留证
- 验证页面状态是否符合预期

## 工作流

1. 解析目标流程。
2. 通过工具执行导航和交互。
3. 采集验证证据。
4. 输出简洁的 pass/fail 摘要。

## 工具列表

### automation_navigate — 页面导航

执行小程序页面导航。

```bash
wechatide -c <clientName> -t automation_navigate --project <project> --action navigateTo --url pages/index/index
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `action` | string | 是 | `navigateTo`、`redirectTo`、`navigateBack`、`reLaunch`、`switchTab` |
| `url` | string | 否 | 目标页面路径（navigateBack 时不需要） |
| `delta` | number | 否 | 回退层数（仅 navigateBack） |

---

### automation_element_action — 元素级操作

执行元素点击、输入、文本读取、样式读取和触摸操作。**点击和输入都用这个工具。**

```bash
wechatide -c <clientName> -t automation_element_action --project <project> --selector button --action tap
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `action` | string | 是 | 见下方动作列表 |
| `selector` | string | 是 | CSS 选择器，定位目标元素 |
| `type` | string | 否 | trigger 的事件类型 |
| `detail` | object | 否 | trigger 的事件 detail；CLI 使用 `--detail-file` |
| `value` | string | 否 | input 的输入值 |
| `name` | string | 否 | attribute 的属性名 |
| `x` | number | 否 | 触摸坐标 x |
| `y` | number | 否 | 触摸坐标 y |
| `touches` | array | 否 | 触摸点列表；CLI 使用 `--touches-file` |
| `changedTouches` | array | 否 | 变化的触摸点列表；CLI 使用 `--changed-touches-file` |

**支持动作**：`tap`、`longpress`、`trigger`、`input`、`size`、`offset`、`text`、`attribute`、`value`、`property`、`wxml`、`outerWxml`、`style`、`scrollWidth`、`scrollHeight`、`scrollTo`、`touchstart`、`touchmove`、`touchend`

---

### automation_page_action — 页面级操作

执行页面数据读取、查询、等待和页面方法调用。

```bash
wechatide -c <clientName> -t automation_page_action --project <project> --action querySelectorAll --selector button
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `action` | string | 是 | `getData`、`setData`、`waitFor`、`querySelector`、`querySelectorAll`、`size`、`callMethod`、`scrollTop` |
| `path` | string | 否 | getData 的数据路径 |
| `patch` | string | 否 | setData 的补丁（JSON 字符串） |
| `condition` | string | 否 | waitFor 的条件表达式 |
| `selector` | string | 否 | querySelector/querySelectorAll 的选择器 |
| `method` | string | 否 | callMethod 的方法名 |
| `args` | array | 否 | callMethod 的参数；CLI 使用 `--args-file` |

---

### automation_viewport_action — 小程序级操作

执行全局操作：截图、页面滚动等。**不支持 tap/input。**

```bash
wechatide -c <clientName> -t automation_viewport_action --project <project> --action screenshot --wait-for-selector .submit-btn --path <localOutputPath>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `action` | string | 是 | `pageScrollTo`、`screenshot`、`testAccounts`、`stopAudits`、`getTicket`、`setTicket`、`refreshTicket`、`remote`、`close` |
| `scrollTop` | number | 否 | 页面滚动目标位置 |
| `path` | string | 否 | 截图本地输出路径 |
| `waitForSelector` | string | 截图时二选一 | 截图前等待该选择器出现，推荐优先使用 |
| `waitSeconds` | number | 截图时二选一 | 截图前固定等待秒数，范围 0-10 |
| `ticket` | string | 否 | ticket 值 |

截图要求：

- `action: "screenshot"` 必须传入 `waitForSelector` 或 `waitSeconds` 之一。
- 优先使用 `waitForSelector`，让截图等待页面关键元素出现后再执行。
- 只有在没有稳定选择器时才使用 `waitSeconds`。

---

### automation_evaluate — 运行时执行

在小程序上下文中执行受控 evaluate。

```bash
wechatide -c <clientName> -t automation_evaluate --project <project> --fn-source 'function() { return 1 }'
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `action` | string | 固定 | 固定为 `evaluate`（CLI 自动注入，无需传参） |
| `fnSource` | string | 是 | 要执行的函数源码 |
| `args` | array | 否 | 函数参数；CLI 使用 `--args-file` |

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
| `method` | string | 是 | wx API 方法名 |
| `args` | array | 否 | 调用参数；CLI 使用 `--args-file` |
| `result` | object | 否 | mock 返回值；CLI 使用 `--result-file` |
| `functionDeclaration` | string | 否 | mock 函数声明 |

---

### automation_generate_script — 生成 automator 脚本

把已记录调用生成可运行的 automator 脚本。生成结果作为草稿，使用前应人工检查。

```bash
wechatide -c <clientName> -t automation_generate_script [--include-failed] [--clear-history]
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `includeFailed` | boolean | 否 | 是否包含失败的调用 |
| `clearHistory` | boolean | 否 | 是否清除历史 |

---

## 常见目标到工具

| 用户意图 | 选择 |
|---------|------|
| 想进入某个页面 | `automation_navigate`（action: `navigateTo`） |
| 想点击某个元素 | `automation_element_action`（action: `tap`） |
| 想输入文字 | `automation_element_action`（action: `input`） |
| 想读取元素文本 | `automation_element_action`（action: `text`） |
| 想查看页面有哪些元素 | `automation_page_action`（action: `querySelectorAll`） |
| 想截图 | `automation_viewport_action`（action: `screenshot`） |
| 想滚动页面 | `automation_viewport_action`（action: `pageScrollTo`） |
| 想读取页面数据 | `automation_page_action`（action: `getData`） |
| 想执行自定义表达式 | `automation_evaluate` |

## 快速调用示例

点击页面中第一个 button：

```bash
wechatide -c CodeBuddy -t automation_element_action --project <project> --selector button --action tap
```

向 input 输入文字：

```bash
wechatide -c CodeBuddy -t automation_element_action --project <project> --selector input --action input --value hello
```

读取某元素的文本内容：

```bash
wechatide -c CodeBuddy -t automation_element_action --project <project> --selector .title --action text
```

查找页面中所有 button 元素：

```bash
wechatide -c CodeBuddy -t automation_page_action --project <project> --action querySelectorAll --selector button
```

截图（推荐等待关键元素出现）：

```bash
wechatide -c CodeBuddy -t automation_viewport_action --project <project> --action screenshot --wait-for-selector .submit-btn --path <localOutputPath>
```

## 重要提醒

- **点击、输入、长按等元素交互** 全部通过 `automation_element_action` 完成，不是 `automation_viewport_action`
- `automation_viewport_action` 仅用于全局操作（截图、页面滚动等），不支持 tap/input
- 截图必须提供 `waitForSelector` 或 `waitSeconds`；优先选择能代表页面已渲染完成的 selector
- `automation_element_action` 必须提供 `selector` 参数（CSS 选择器），用于定位目标元素
- 如果不确定选择器，先用 `automation_page_action`（action: `querySelectorAll`）列出元素

## timeout 处理

如果自动化相关调用出现 timeout，不要只停留在报错本身。

推荐处理方式：

1. 先记录当前是哪一步动作 timeout。
2. 检查当前页面和运行时状态是否仍可读取。
3. 如果页面状态仍可读取，优先补充当前页面、关键元素和最后一次成功动作作为证据。
4. 如果页面状态不可读，输出 timeout 步骤、最后一次可读状态和错误原文，不要在本 scene 内继续扩展恢复动作。

使用提醒：

- timeout 后应优先补充状态证据，再决定是否直接重试
