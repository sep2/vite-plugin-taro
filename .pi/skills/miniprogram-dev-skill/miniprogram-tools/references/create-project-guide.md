# 创建小程序项目流程

## 前置条件

- 用户已登录（`check_devtools_status` 返回内容中有 `openid`）
- 微信开发者工具 CLI 可用

## 第一步：获取 AppID

每个小程序项目必须绑定一个 AppID。获取方式：

```bash
wechatide -c <clientName> -t get_user_appids
```

返回当前登录用户可管理的全部 AppID 列表。用户需要从中选择一个，或提供已知的 AppID。

**注意**：
- 没有 AppID 无法创建正式项目
- 测试号可在微信公众平台申请

## 第二步：确认云开发环境（如需要）

如果项目使用云开发，需要获取云环境 ID：

```bash
wechatide -c <clientName> -t cloud_env_list --project <project> --appid <appid>
```

**注意**：
- 云环境需要在微信公众平台预先开通
- 一个 AppID 可以有多个云环境（如 dev、prod）
- 云环境 ID 格式通常为 `cloud1-xxxx` 或自定义名称

## 第三步：project.config.json

每个小程序项目根目录必须有 `project.config.json`，它是 微信开发者工具 识别和管理项目的核心配置文件。

### 必填字段

```json
{
  "appid": "wxxxxxxxxxxx",
  "projectname": "my-miniprogram",
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

### 字段说明

| 字段 | 说明 |
|------|------|
| `appid` | 小程序 AppID，必填 |
| `projectname` | 项目显示名称 |
| `compileType` | 编译类型：`miniprogram`（小程序）、`game`（小游戏）、`plugin`（插件） |
| `libVersion` | 基础库版本，使用 `"latest"` 即可（始终使用最新稳定版） |
| `setting` | 编译设置（ES6 转 ES5、样式补全、代码压缩等） |
| `cloudfunctionRoot` | 云函数目录（使用云开发时填写，如 `"cloudfunctions/"`） |
| `miniprogramRoot` | 小程序代码根目录（默认为项目根目录） |

### 私有配置 project.private.config.json

开发者个人设置（如自定义编译条件、本地调试端口等）存放在 `project.private.config.json`，不应提交到版本控制。

## 第四步：打开项目

项目目录和配置准备好后，通过 CLI 打开：

```bash
wechatide -c <clientName> -t project_open_window --project <project>
```

这会自动导入项目到 DevTools 项目列表并打开项目窗口。

## 最小可运行项目结构

```
project/
├── project.config.json    # 项目配置（必须）
├── app.json               # 小程序全局配置（必须）
├── app.js                 # 小程序入口逻辑
├── app.wxss               # 全局样式
└── pages/
    └── index/
        ├── index.json     # 页面配置
        ├── index.wxml     # 页面模板
        ├── index.wxss     # 页面样式
        └── index.js       # 页面逻辑
```

## 常见问题

- **AppID 无效**：确认 AppID 对应的小程序已在公众平台注册，且当前登录账号有管理权限
- **项目路径不存在**：`project_open_window` 要求路径是已存在的目录
- **缺少 app.json**：DevTools 打开项目后会报错，至少需要 `{"pages":["pages/index/index"]}` 
- **云函数部署失败**：确认 `cloudfunctionRoot` 配置正确，且云环境 ID 有效
