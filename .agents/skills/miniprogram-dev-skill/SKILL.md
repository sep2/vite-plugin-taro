---
name: miniprogram-dev-skill
description: 微信开发者工具 任务执行的根入口。用于在执行前先完成环境检查，再路由到预览、自动化、调试与云相关操作。
metadata:
  short-description: 小程序 微信开发者工具 skill 包
---

# miniprogram-dev-skill

## 用途

这是面向微信小程序 微信开发者工具 工作流的根入口。

以下任务应优先使用这个 skill：

- 执行页面自动化、验证和截图
- 排查运行时、页面或日志问题
- 处理云环境、云函数相关动作
- 执行预览、上传、登录等 微信开发者工具 操作

以下任务不应使用这个 skill：

- 通用编码辅助
- 与小程序无关的桌面自动化
- 普通脚本执行或任意命令调用

## Skill 安装

在 AI agent 中安装 微信开发者工具 skill 前，先获取当前 微信开发者工具 内置 skill 目录与版本号：

```bash
wechatide
```

或显式执行：

```bash
wechatide help
```


## 运行前检查（必须）

在进入任何 scene 或直接调用工具前，**必须**确认环境就绪且用户已登录（游客不可继续）。

### 第一步：检查 微信开发者工具 状态

```bash
wechatide -c <clientName> -t check_devtools_status --skill-version <skillVersionFromSkillYaml>
```

其中 `<skillVersionFromSkillYaml>` 不是固定字符串；调用前应读取当前调用侧 agent 加载的 `miniprogram-dev-skill/skill.yaml`，取该文件顶层 `version` 字段的值填入。

`check_devtools_status` 通过 skill-cli 调用时，如果 微信开发者工具 MCP 服务未启动或当前 client 尚未授权，CLI 会使用同一个 `<clientName>` 自动执行一次等价的 `wechatide auth -c <clientName>`，授权完成后重试本次状态检查。授权弹窗仍需用户确认。

根据返回结果处理：

| 返回情况 | 处理 |
|---------|------|
| 返回内容中有 `openid` | 环境就绪，继续后续操作 |
| 返回内容中有 `warning` | 当前工具内置 skill 版本与本地 agent 使用版本不一致，按提示路径安装更新 skill 后重新执行 `check_devtools_status` |
| `command not found` | 微信开发者工具 CLI 未安装或不在 PATH 中 |
| `CONNECT_ERROR` / `AUTH_*` | 自动授权或连接重试失败，按错误信息处理；必要时手动执行下方 auth 命令 |
| 无 `openid` | 未登录，需要触发扫码登录（见下方） |

**注意**：`check_devtools_status` 只需在会话开始时调用一次。确认返回内容中有 `openid` 且无 `warning` 后，后续操作中不要重复调用，直接使用其他工具即可。

### Skill 版本检查

`check_devtools_status` 会返回当前运行 微信开发者工具 内置的 skill 版本号 `skillVersion`。入参 `version` 应填写当前调用侧 agent 加载的 `miniprogram-dev-skill/skill.yaml` 文件中的顶层 `version` 字段值，工具会对比两者；不要硬编码示例版本。版本不一致时返回中会包含 `warning`，应按提示中的工具内置 skill 路径安装更新 skill。未传 `version` 时只检查 微信开发者工具 状态和登录态，不返回版本对比提醒。

### 微信开发者工具 未启动时

通常无需手动执行；`check_devtools_status` 连接失败时会自动用当前 `<clientName>` 执行一次。需要手动重试时，通过 `skill-cli auth` 启动工具并授权 CLI 连接：

```bash
wechatide auth -c <clientName>
```

等待工具启动并完成授权后，重新执行第一步。

### 未登录时

触发扫码登录：

```bash
wechatide -c <clientName> -t scan_login
```

等待用户扫码完成后，再次调用 `check_devtools_status` 确认返回内容中有 `openid`。**未确认登录前不得执行其他工具。**

## 调用方式

所有工具统一通过全局命令调用：

```bash
wechatide -c <clientName> -t <toolName> [flags...]
```

- `wechatide` 是全局命令，无需知道安装路径
- `-c`：当前 agent 简称（如 `CodeBuddy`、`Claude`）
- `-t`：工具名（如 `project_open_window`、`cloud_env_list`）
- 工具参数由 `tools.yaml` 的 `inputSchema` 决定，使用 `--field value` 形式传递
- 查看某工具全部参数：`wechatide -c <clientName> -t <toolName> --help`
- 本地文件系统路径字段直接传本机绝对路径；Windows 可传 `C:/...`，CLI 会转成系统原生路径
- `object` / `array` 类型字段使用 `--<field>-file path.json` 传递 JSON 文件

首次连接时 微信开发者工具 会弹窗确认授权，授权后该 clientName 后续连接自动通过。

### 常见调用示例

```bash
wechatide -c CodeBuddy -t project_open_window --project <project>
wechatide -c CodeBuddy -t automation_runtime_info --project <project> --action currentPage
wechatide -c CodeBuddy -t check_devtools_status --skill-version <skillVersionFromSkillYaml>
wechatide -c CodeBuddy -t simulator_open_page --project <project> --page pages/index/index --query id=1
wechatide -c CodeBuddy -t cloud_env_list --project <project>
wechatide -c CodeBuddy -t debug_clear_cache --project <project> --action cleanAll
```

### 使用提醒

- **不要猜测或自行编造工具名**，调用前必须先确认工具存在（见 `miniprogram-tools/references/tools.yaml`）
- 工具名使用下划线分隔（如 `project_open_window`、`automation_viewport_action`），不要用点号或驼峰
- 截图通过 `automation_viewport_action` 实现，必须传 `waitForSelector` 或 `waitSeconds` 之一；优先使用 `waitForSelector` 等页面元素出现后再截图
- 预览相关动作如果需要产出二维码或信息文件，应显式提供本地输出路径

## 路由规则

确认环境就绪后，按任务意图路由：

注意：调用工具前请仔细阅读工具的传参规则，再进行调用，不要编造参数结构

- 页面自动化、交互、断言：`skills/automator/SKILL.md`
- 运行时排查、日志分析、状态诊断、模拟器状态：`skills/debugger/SKILL.md`
- 云环境、云函数：`skills/cloudbase-operator/SKILL.md`
- 编译、构建 npm、编译条件：`skills/compiler/SKILL.md`
- 预览、真机预览、上传代码包：`skills/previewer/SKILL.md`（涉及预览优先使用 `auto_preview`，直接推送到手机）
- 微信开发者工具项目列表查询、导入、从列表删除：`skills/project-manager/SKILL.md`
- 小程序地图组件、定位、腾讯位置服务 Web 接口：`references/map-skill-index.md`（本 skill 不处理，指向对应外部 skill）

当路由有歧义时，优先按「快速判断」中的分类选择。

## 快速判断

如果只想快速判断该进哪个，可以直接按下面理解：

- 先接管项目、确认登录、读取 AppID 或运行时上下文：`initializer`
- 需要点击、输入、滚动、截图、断言页面结果：`automator`
- 需要看 console、network、运行态或模拟器异常：`debugger`
- 需要编译页面、编译文件、构建 npm、刷新模拟器：`compiler`
- 需要生成预览码、真机预览、上传代码：`previewer`
- 需要查询云环境或操作云函数：`cloudbase-operator`
- 只需管理微信开发者工具项目列表、暂不打开项目窗口：`project-manager`

选择原则：

- 先按用户当前最主要的目标路由，不要因为顺手能调别的工具就跨 scene 混用
- scene 内如果只需要一两个原子工具，也仍然优先保留 scene 的判断边界
- 如果用户的话术同时覆盖多个目标，先完成 blocker scene，再移交到下一个 scene

## 标准工作流

1. 确认 `wechatide` 命令可用。
2. 检查连接、登录态和 skill 版本（必须确认返回内容中有 `openid`，且 `skillVersion` 未落后才继续）。
3. 识别项目与任务目标。
4. 若仅需管理微信开发者工具项目列表（查询/导入/从列表删除），使用 `project-manager`；若要编译或调试，再使用 `initializer` 打开项目窗口。
5. **如果需要打开项目窗口（`project_open_window`）：必须先读取项目的 `project.config.json`，确认 `appid` 有效后才能调用。** 缺失时走 `open-project-window-guide.md` 补全流程。
6. 选择合适的 scene skill。
7. 通过 `wechatide` 执行原子工具。
8. 输出结构化结论与下一步建议。

## 交互处理

如果工具执行过程中出现 DevTools、系统弹窗或用户扫码等交互要求，应停在当前步骤，原样说明当前状态，并等待用户完成交互后再继续。不要在根入口维护具体动作分类清单。

## 执行约定

- 使用此 skill 时，原子执行入口只有 `wechatide`
- 当执行失败时，不要自行吞掉、改写或继续猜测修复路径，应把错误原样抛给用户，由用户决策下一步

## 参考资料

- 打开项目前置检查：`miniprogram-tools/references/open-project-window-guide.md`
- 创建小程序项目流程：`miniprogram-tools/references/create-project-guide.md`
- 工具注册表：`miniprogram-tools/references/tools.yaml`
- 交互处理：`references/approval-policy.md`
- 地图相关外部 skill 索引：`references/map-skill-index.md`
- 安全边界：`SECURITY.md`
