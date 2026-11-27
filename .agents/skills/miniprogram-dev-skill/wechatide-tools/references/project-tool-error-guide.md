# `--project` 工具错误后置处理

带 `--project` 的 toolCall，微信开发者工具可能对项目路径、`project.config.json` 与 appid 做内部校验。

对已明确的项目目录，**不要**调用前重复预读 / 预检 `project.config.json`；先调工具，返回错误后按下文处理。路径来源不明或扫描范围可疑时，先按「项目目录的判断」核实，不用补配置来证明路径正确。

本文件是该规则的**唯一详细说明**；其它文档只应链接此处。

## 适用范围

- **适用**：凡带 `--project` 且未列入下方「不适用」的工具，包括 `project_import`、开窗、预览/上传、编译、自动化、调试和云相关工具；CLI/MCP 在 handler 前统一校验路径、配置，默认校验 AppID，按实际返回的错误处理
- **`share_minicode`**：只校验路径和配置，不校验 AppID；`PROJECT_PATH_NOT_FOUND` / `PROJECT_CONFIG_JSON_ERROR` 仍按本指南处理，不因分享失败而要求绑定 AppID
- **`project_import`**：同样校验路径、配置和 AppID，无配置目录会返回 `PROJECT_CONFIG_JSON_ERROR`，不会进入导入 handler；导入成功不代表项目可运行或目录选择正确
- **不适用（不做上述校验）**：`project_remove`、`close_project_window`、已废弃的 `project_setting_get` / `project_setting_update`
- **无 `--project` 入参**：如 `project_list`、`login`、`check_wechatide_status` 等，不走本流程

## 项目目录的判断

- `--project` 指向本次要操作的项目目录，不是项目的存放位置。用户说「建在 D 盘」时，为新项目选取具体子目录；不要直接把 `D:\` 当作项目目录。
- 盘符根、文件系统根、用户主目录，或含多个无关工程的目录，只是范围可疑的信号，**不按路径形状一律禁止**。已有用户明确指定的项目用途、可核对的项目文件或构建配置时，可以继续；配置里的 `miniprogramRoot` / `pluginRoot` 也可能解释源码位置。
- 依据不足时，优先查看配置、入口文件和构建脚本；可在已确认的工作区内定向查找嵌套项目 / 构建输出，排除无关依赖和缓存，不限定为一层目录。根据范围和扫描成本收敛搜索，不把搜索扩大到整个盘或主目录；范围过大、多个候选无法判定或仍不明确时再询问用户。不要为了让工具通过就在未确认的目录生成配置或入口文件。
- 已确认的路径和用途在后续调用中沿用，不必反复要求用户确认。`project_import` 成功、或刚补出的 `project.config.json`，不能单独作为路径正确的依据。

## 正常路径

```bash
wechatide -c <clientName> open_project_window --project <project>
wechatide -c <clientName> auto_preview --project <project>
```

## 收到 `PROJECT_PATH_NOT_FOUND` 后

表示 `--project` 指向的目录不存在。

1. 核对路径拼写、项目存放位置与实际项目目录是否混淆。
2. 明确新建项目时，在确定的目标目录创建最小项目文件；打开已有项目时，定位现有目录，或按已有构建流程生成输出，不因路径不存在就新建一个项目。
3. 用确定后的 `--project` 重试刚才失败的工具；路径有误时应修正参数。

## 收到 `PROJECT_CONFIG_JSON_ERROR` 后

表示目录存在，但 `project.config.json` 缺失、读取失败、JSON 解析失败或内容不合法。

1. 按「项目目录的判断」核对目标；目录存在不等于项目位置正确。
2. 配置缺失时，区分用户意图：
   - **使用已有项目（打开 / 导入 / 分享等）**：先定位现有配置或实际项目目录；源码工程需构建时，按已有脚本生成配置 / 产物并使用实际输出目录。若已确认是现有小程序 / 小游戏（如有 `app.json` / `game.json` 及对应业务文件），且目标目录、项目类型及本次工具所需参数已明确，可在用户任务意图内补齐缺失的工具配置，无需额外要求同意「初始化项目」；保留现有业务文件，不为通过校验而造入口文件。工具要求的 AppID 缺失时按下方 AppID 流程或向用户确认，不猜测；仅分享代码片段不要求补 AppID。
   - **明确新建项目，或用户已同意在该目录初始化项目**：按 [创建流程](create-project-guide.md) 准备配置和对应项目类型的文件，不能只补一份配置就声称项目可运行。
   - 仍无法确定项目位置、用途，或是否需要新建业务文件：说明缺失内容，询问用户后再写入。
3. 配置存在时，区分读取失败与 JSON 非法：权限 / I/O 错误应原样报告；确定是 JSON 问题时再修复注释、尾逗号、截断等，保留已有字段，勿用最小配置覆盖。
4. 字段语义见 `skills/project-config/SKILL.md`。路径或配置问题解决后，重试原工具；若路径有变则更新 `--project`。若得到 `APPID_ERROR`，再走下方流程。

## 收到 `APPID_ERROR` 后

表示配置可读，但 `appid` 无效（缺省 / 空 / `touristappid`），或 AppID 属性校验失败（无权限、AppID 不存在、需重新登录等）。

1. 沿用已确定的项目目录，读 `project.config.json`；补全有效 `appid`：
   - `get_user_appids`（用户已给出 AppID 则可跳过）
   - 已有文件只更新 `appid` 字段
2. **用同一参数重试一次**。
3. **若补完 appid 后仍然 `APPID_ERROR`**：
   - 向用户说明：可换另一个有权限的 AppID，或重新扫码登录后再试
   - **不要**在同一 appid / 同一登录态下死循环重试
   - 停在当前步，等待用户决策

## 最小 `project.config.json`

用于已明确的新建 / 初始化流程，或上述已确认的现有项目补齐工具配置；字段按实际项目类型和目录结构设置（如需要 `miniprogramRoot` / `pluginRoot`），不作为打开任意目录失败后的通用补救。

```json
{
  "appid": "<用户选择的 AppID>",
  "projectname": "<项目目录名>",
  "compileType": "miniprogram",
  "libVersion": "latest"
}
```

小游戏将 `compileType` 设为 `game`。字段细节见 `skills/project-config/SKILL.md`。

## 注意

- `get_user_appids` 需已登录
- 已明确的项目目录按返回的 `code` 分支处理；路径不明确时先定位，不盲目写文件或重试
- 处理顺序建议：`PROJECT_PATH_NOT_FOUND` → `PROJECT_CONFIG_JSON_ERROR` → `APPID_ERROR`
