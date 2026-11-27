---
name: simulator
description: >-
  模拟器工具栏：查询/切换机型、设置暗黑模式、把模拟器弹出为独立窗口。
  用户说有哪些机型、换机型、iPhone/安卓模拟器、暗黑模式、深色浅色、弹出模拟器时使用。
---

# simulator

## 用途

只处理模拟器工具栏上的三项外观操作。编译、刷新、打开页面仍走 `compiler`；截图与日志走 `debugger`。

窗口未开时，查询、切换机型和暗黑模式会先打开项目窗口再执行。弹出模拟器在窗口未开时会打开带编辑器的完整窗口再弹出。项目窗口已经是仅模拟器的精简窗口时，无法改成完整窗口，弹出仍会失败，需要先关掉该窗口再调用。

## 意图 → 工具

| 意图 | 工具 |
|------|------|
| 查看当前机型 / 有哪些机型 | `simulator_get_device` |
| 切换机型 | `simulator_set_device`（`--device` 必填，与 `simulator_get_device` 返回的 `name` 一致，如 `iPhone 15`） |
| 暗黑 / 深色 | `simulator_set_darkmode --mode dark` |
| 浅色 | `simulator_set_darkmode --mode light` |
| 弹出模拟器 | `simulator_popup` |

```bash
wechatide -c <clientName> simulator_get_device --project <project>
wechatide -c <clientName> simulator_set_device --project <project> --device "iPhone 15"
wechatide -c <clientName> simulator_set_darkmode --project <project> --mode dark
wechatide -c <clientName> simulator_popup --project <project>
```

参数细节：`--help` / tools.yaml。

## 边界

- 首期只有机型、暗黑模式、弹出。旋转、缩放、网络、Home/返回不在本 scene
- 查机型只用 `simulator_get_device`，不要省略 `simulator_set_device` 的 `--device`
- 未知机型看 `simulator_set_device` 返回里的 `devices`，或先 `simulator_get_device`，不要编造名称后连打
- `devices[].os` 用来区分 iOS / Android，不要只靠机型名猜测
- `simulator_popup` 已弹出时返回 `already: true`，不要再调一次
- 当前窗口已是精简模式时，`simulator_popup` 返回 `success: false`。先关闭项目窗口再调用，不要用默认精简模式重开
- 弹出按钮在当前布局下禁用时，工具返回 `success: false`，不要改窗口布局来强行弹出
- 小游戏没有模拟器暗黑模式。`simulator_set_darkmode` 直接失败，错误是「小游戏不支持模拟器暗黑模式」。机型切换和弹出不受影响。`game.json` 里的 `darkmode` 只是项目声明，不要据此重试

## 失败快表

| 情况 | 处理 |
|------|------|
| 窗口未开 / 开窗类错误 | 查询、切换、暗黑会自己开窗。弹出失败且当前已是精简窗口时，先关掉项目窗口再调 `simulator_popup`，不要用默认的 `open_project_window` 重开。`PROJECT_*` 见 [project-tool-error-guide.md](../../wechatide-tools/references/project-tool-error-guide.md) |
| `未知机型` | 用返回的 `devices[].name` 重试一次 |
| 弹出 `success: false` | 原样说明原因；不要连续重试 |
| `小游戏不支持模拟器暗黑模式` | 小游戏没有这项能力。原样说明，不要重试，也不要改 `game.json` 的 `darkmode` |
| 需要看效果 | 移交 debugger 截图，不要在本 scene 调 `simulator_screenshot` |

## 移交

| 目标 | 还需 |
|------|------|
| compiler | 换机型/主题后要重新编译或打开某页 |
| debugger | `project`、当前机型或主题、是否已弹出 |
| automator | 已打开的页面路径 |
