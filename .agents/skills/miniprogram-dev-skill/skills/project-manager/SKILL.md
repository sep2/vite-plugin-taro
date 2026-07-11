---
name: project-manager
description: 管理微信开发者工具已导入项目列表：查询、导入、从列表删除。不负责打开项目窗口。
---

# project-manager

## 用途

管理微信开发者工具「项目列表」中的已导入项目，不替代 `initializer` 里的开窗口流程。

适合场景：

- 查看当前已导入哪些项目
- 将本地目录导入列表（不开窗口）
- 从列表移除项目（不删磁盘文件）

不适合：

- 打开/关闭项目窗口（用 `initializer` 的 `open_project_window` / `close_project_window`）
- 未登录时操作（需先 `check_devtools_status` 确认 `openid`）

## 运行前检查

与根 `SKILL.md` 相同：先 `check_devtools_status`，确认有 `openid` 且无 `warning`。

## 标准流程

1. `project_list` 查看当前列表（默认 `miniprogram` 主列表）
2. 需要纳入新项目时 `project_import --project <absPath>`
3. 需要从列表移除时 `project_remove --project <absPath>`（会弹 MCP 操作确认，等待用户点允许）
4. 若要编译/调试，再切 `initializer` 执行 `open_project_window`

## 工具列表

### project_list — 列出已导入项目

```bash
wechatide -c <clientName> -t project_list [--scope miniprogram|other|all]
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `scope` | string | 否 | 默认 `miniprogram`；`other` 为其他项目；`all` 为两者合并 |

返回 `projects` 数组，每项含 `projectId`、`projectPath`、`projectName`、`appId` 等。

---

### project_import — 导入到列表

```bash
wechatide -c <clientName> -t project_import --project <absPath>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |

- 路径已在列表中：`alreadyImported: true`，视为成功
- 不做 `open_project_window` 的 appid 权限预检；目录无效时由底层报错
- 导入后若要开发，仍需 `open_project_window`

---

### project_remove — 从列表删除

```bash
wechatide -c <clientName> -t project_remove --project <absPath>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 要从列表移除的项目路径 |

- 触发 微信开发者工具 `mcp_action_auth` 确认弹窗，用户拒绝则返回 `User denied`
- 只从列表移除，**不删除磁盘上的项目文件**
- 若该项目窗口仍打开，会一并关闭该项目窗口
- 云存储项目返回 `CLOUD_PROJECT_NOT_SUPPORTED`

## 与 initializer 的边界

| 工具 | 作用 |
|------|------|
| `project_import` | 仅写入项目列表 |
| `open_project_window` | 校验 appid + 导入（如需）+ 打开模拟器窗口 |
| `close_project_window` | 关闭窗口，列表项仍在 |
| `project_remove` | 从列表移除，可不关整个 微信开发者工具 |
