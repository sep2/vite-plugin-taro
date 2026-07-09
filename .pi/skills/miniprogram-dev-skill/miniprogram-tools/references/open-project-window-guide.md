# 打开项目窗口前置检查

## 概述

调用 `project_open_window` 前，必须确保项目目录中存在有效的 `project.config.json` 且配置了 `appid`。否则 DevTools 无法正确识别和打开项目。

## 检查流程

### 第一步：检查 project.config.json 是否存在

读取项目目录下的 `project.config.json` 文件。如果文件不存在，需要先创建。

### 第二步：检查 appid 是否已配置

读取 `project.config.json` 中的 `appid` 字段：
- 如果 `appid` 存在且不为空 → 检查通过，可以执行 `project_open_window`
- 如果 `appid` 为空或不存在 → 进入 AppID 补全流程

### 第三步：AppID 补全流程

1. 调用 `get_user_appids` 获取当前登录用户可管理的 AppID 列表：

```bash
wechatide -c <clientName> -t get_user_appids
```

2. 让用户从列表中选择一个 AppID，或提供已知的 AppID

3. 将 AppID 写入 `project.config.json`：
   - 如果文件已存在：只更新 `appid` 字段
   - 如果文件不存在：创建完整的初始配置（参考下方模板）

### 第四步：打开项目

```bash
wechatide -c <clientName> -t open_project_window --project <project>
```

## project.config.json 最小模板

当需要新建 `project.config.json` 时使用：

```json
{
  "appid": "<用户选择的 AppID>",
  "projectname": "<项目目录名>",
  "compileType": "miniprogram",
  "libVersion": "latest",
  "setting": {
    "urlCheck": true,
    "es6": true,
    "enhance": true,
    "postcss": true,
    "minified": true
  }
}
```

## 完整判断逻辑

```
读取 <project>/project.config.json
  ├── 文件不存在
  │     └── 确认登录 → get_user_appids → 用户选择 → 创建 project.config.json → project_open_window
  ├── 文件存在但 appid 为空
  │     └── 确认登录 → get_user_appids → 用户选择 → 更新 appid → project_open_window
  └── 文件存在且 appid 有效
        └── 直接 project_open_window
```

## 注意事项

- `get_user_appids` 需要已登录状态（`check_devtools_status` 返回内容中有 `openid`）
- 如果用户明确提供了 AppID（如 "用 wxXXXXX 打开"），可以跳过 `get_user_appids` 直接使用
- `appid` 字段为 `"touristappid"` 或空字符串 `""` 均视为未配置
- 写入 `project.config.json` 时注意保留文件中已有的其他字段，只补充/更新缺失的
