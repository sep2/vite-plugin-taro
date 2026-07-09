---
name: previewer
description: 负责预览和发布：推送手机预览、生成预览码、真机预览、上传代码包。
---

# previewer

## 用途

处理与预览和发布相关的操作。

典型任务：

- 推送预览到手机
- 生成预览二维码文件
- 触发真机预览流程
- 上传代码包到后台

## 工作流

1. 确认项目已打开且登录态正常。
2. 根据任务选择合适的工具（**优先 `auto_preview`**）。
3. 执行并返回结果。

## 工具列表

### auto_preview — 推送手机预览，自动预览

把预览直接推送到开发者微信，无需生成二维码文件。**预览场景的默认首选。**

对应 `tools.yaml` 中的 `auto_preview`。

```bash
wechatide -c <clientName> -t auto_preview --project <project>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |

**重要：只传 `project` 一个参数即可。** 不要传 `info-output`、`qr-output` 等额外参数。如需落地输出文件，请改用 `create_preview_qrcode` 并传本地输出路径。

---

### create_preview_qrcode — 获取小程序预览二维码

生成可扫码的小程序预览二维码。**默认使用 `qr-format: "window"` 在新窗口中展示二维码，无需指定本地输出路径。**

```bash
wechatide -c <clientName> -t create_preview_qrcode --project <project> --qr-format window
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `qr-format` | string | 否 | `window`（默认，弹窗展示） |
| `qr-output` | string | 否 | 二维码本地输出文件路径；默认 `window` 不需要传 |
| `info-output` | string | 否 | 预览信息本地输出文件路径 |

**重要：优先使用 `qr-format: "window"`**，直接在 DevTools 内弹窗展示二维码，用户扫码后手动关闭窗口或等待 120 秒自动关闭。不需要指定 `qr-output` 路径，避免路径权限问题。

---

### miniprogram_upload — 发布体验版

上传代码包发布体验版。**仅在用户明确要求「发布体验版」时调用。**

对应 `tools.yaml` 中的 `miniprogram_upload`。

```bash
wechatide -c <clientName> -t miniprogram_upload --project <project> --upload-version 1.0.0 [--desc "备注"]
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 是 | 项目本地绝对路径 |
| `version` | string | 是 | 版本号（如 `"1.0.0"`） |
| `desc` | string | 否 | 版本备注说明 |

---

## 常见目标到工具

| 用户意图 | 选择 |
|---------|------|
| “预览一下” / “发到手机看看” / “真机预览” / “自动预览” | `auto_preview` |
| “给我一个二维码” / “扫码预览” / “开发版二维码” | `create_preview_qrcode`（默认 `qr-format: “window”`） |
| “发布体验版” | `miniprogram_upload` |

## 使用边界

- 只处理预览、二维码和上传相关目标
- `auto_preview` 是默认预览工具，只传 `project`
- `miniprogram_upload` 只在用户明确提出发布体验版时使用
