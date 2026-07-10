---
name: initializer
description: 初始化 微信开发者工具 开发环境与基础信息。用于项目窗口打开或接管、登录信息获取、AppID 信息获取以及运行时上下文读取。
---

# initializer

## 用途

这个 scene 用来完成开发前的基础初始化，不负责后续自动化、调试、预览或云操作本身。

适合场景：

- 打开项目或接管已有项目窗口
- 关闭项目窗口或退出 微信开发者工具
- 获取当前登录信息
- 获取项目相关 AppID 信息
- 获取项目身份、运行时上下文、云环境上下文
- 读取或更新项目设置
- 构建 npm 依赖
- 判断后续能力调用所需的基础信息是否已经齐全

## 工具列表

### check_devtools_status — 检查 微信开发者工具 状态

读取 微信开发者工具 当前登录态、openid 和当前运行的 skill 版本号；传入当前调用侧 agent 加载的 `skill.yaml` version 字段值时，会检查两者是否匹配。通过 skill-cli 调用时，如果 微信开发者工具 MCP 服务未启动或当前 client 尚未授权，CLI 会使用同一个 `<clientName>` 自动执行一次 auth 并重试。**会话开始时调用一次，确认返回内容中有 `openid` 且无 `warning` 后不必重复调用。**

```bash
wechatide -c <clientName> -t check_devtools_status --skill-version <skillVersionFromSkillYaml>
```

其中 `<skillVersionFromSkillYaml>` 不是固定字符串；调用前应读取当前调用侧 agent 加载的 `miniprogram-dev-skill/skill.yaml`，取该文件顶层 `version` 字段的值填入。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | string | 否 | 当前调用侧 agent 加载的 `miniprogram-dev-skill/skill.yaml` 文件中的 `version` 字段值；不传则跳过版本对比提醒 |

---

### scan_login — 触发扫码登录

打开微信开发者工具并显示扫码登录二维码，等待用户扫码完成登录。

```bash
wechatide -c <clientName> -t scan_login
```

无参数。

---

### open_project_window — 打开项目窗口

打开包含模拟器的项目窗口，自动导入到项目列表（如尚未导入）。

⚠️ **必须先执行前置检查，不得直接调用**：

1. 读取 `<project>/project.config.json` 文件内容
2. 确认 `appid` 字段存在且不为空（`""` 和 `"touristappid"` 视为无效）
3. 通过 `appid` 属性预检触发 微信开发者工具 请求链路的 token 刷新与重试
4. 如果 `project.config.json` 不存在或 `appid` 无效：
   - 调用 `get_user_appids` 获取可用 AppID
   - 让用户选择 AppID
   - 创建或补全 `project.config.json`（参考 `miniprogram-tools/references/open-project-window-guide.md`）
5. 如果 AppID 属性预检失败，先触发登录或让用户重新登录，确认登录态后再继续
6. 确认配置和登录态均有效后，再执行 `open_project_window`

```bash
wechatide -c <clientName> -t open_project_window --project <project>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |

---

### close_project_window — 关闭项目窗口

关闭包含模拟器的项目窗口，不等于关闭整个 DevTools。

```bash
wechatide -c <clientName> -t close_project_window --project <project>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |

---

### quit — 退出 微信开发者工具

关闭 DevTools。

```bash
wechatide -c <clientName> -t quit
```

无参数。

---

### get_user_appids — 获取用户可管理的全部 AppID

获取当前登录用户可管理的全部 AppID 列表。

```bash
wechatide -c <clientName> -t get_user_appids
```

无参数。

---

### automation_runtime_info — 运行时信息

读取 微信开发者工具 当前项目窗口和运行时基础状态（pageStack、currentPage、systemInfo）。

```bash
wechatide -c <clientName> -t automation_runtime_info --project <project> --action currentPage
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `action` | string | 是 | `pageStack`、`currentPage`、`systemInfo` |

---

### project_setting_get — 读取项目设置

读取当前项目设置。

```bash
wechatide -c <clientName> -t project_setting_get --project <project>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |

---

### project_setting_update — 更新项目设置

更新项目设置，修改后即时生效并写入项目配置。

```bash
wechatide -c <clientName> -t project_setting_update --project <project> --settings-file ./settings.json
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `settings` | object | 是 | 要更新的设置键值对；CLI 使用 `--settings-file` 传递 JSON 文件 |

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

## 常见目标到工具

| 用户意图 | 选择 |
|---------|------|
| "先把项目打开" / "接管当前项目" | 先读取 `project.config.json` 确认 appid 有效 → `open_project_window` |
| "看看现在登没登录" | `check_devtools_status` |
| "需要主动登录" | `scan_login` |
| "关闭项目窗口" | `close_project_window` |
| "退出 微信开发者工具" | `quit` |
| "帮我看看这个项目的 AppID" | `get_user_appids` |
| "当前页面是什么" | `automation_runtime_info`（action: `currentPage`） |
| "看看项目设置" | `project_setting_get` |
| "改一下项目设置" | `project_setting_update` |
| "构建 npm" | `buildnpm` |

## 使用边界

- 这里只负责把开发环境和基础信息准备好
- 不要在这里顺带完成自动化、调试、预览、上传或云侧写操作
- 如果登录是后续动作前提，可以触发登录流程，但不要把等待扫码表述成已经完成登录
- 如果 AppID、项目路径或目标 scene 所需关键信息还不可用，应明确把它作为 blocker 输出

## 典型移交

只有在登录态、项目路径以及目标 scene 所需关键信息已经明确时，才给出 `nextScene`。移交时不要让下一个 scene 重新判断初始化问题；把已确认的信息放到 `handoffContext`。

| 目标 scene | 适用目标 | 移交前必须带上的信息 |
|-----------|----------|----------------------|
| `automator` | 点击、输入、滚动、截图、页面断言 | `projectPath`、当前页面或目标页面、关键选择器或待验证结果 |
| `debugger` | console/network/运行态/模拟器状态排查 | `projectPath`、`currentPage`、已观察到的异常、可复现步骤或日志关键字 |
| `compiler` | 编译到页面、单文件编译、构建 npm、刷新模拟器 | `projectPath`、目标页面或目标文件、编译参数、是否需要构建 npm |
| `previewer` | 推送手机预览、生成二维码、上传体验版 | `projectPath`、预览方式、上传版本信息或二维码输出诉求 |
| `cloudbase-operator` | 查询云环境、云函数列表、部署或增量部署云函数 | `projectPath` 或 `appid`、目标 `env`、函数目录；增量部署需带 `appid`、云函数目录和相对变更文件或目录 |

如果用户目标同时覆盖多个 scene，先只移交给当前最直接能完成目标的 scene；后续 scene 由任务结果自然触发，不在 initializer 中提前串联多步计划。
