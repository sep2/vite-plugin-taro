# 开发者工具官方文档索引

问开发者工具**怎么用、版本线有什么差别**时读本文。本文检索官方文档，不调用 `wechatide`，不需要登录，也不需要开发者工具的 CLI 令牌或 MCP Token。`project.config.json` 的字段含义不以官方文档为第一来源，见「和本包冲突时」。

要真正打开项目、改配置、编译、预览、截图、看日志时，回到根 [SKILL.md](../SKILL.md) 的路由表，进对应 scene。文档问题和执行动作同时出现时：口径走本文，动作交给 scene，不要用文档检索代替工具调用。

## 检索范围

只搜开发者工具板块：

| 项目 | sector |
|------|--------|
| 小程序，或类型不明 | `miniprogram/dev/devtools` |
| 小游戏（`compileType` 为 `game`，或用户明确说小游戏） | `minigame/dev/devtools` |

先搜选定板块。该板块没有可用结果时，换另一个 devtools 板块再搜一次。不要去掉 `sector` 搜全站。框架、组件、`wx.*` API、支付、视频号等不在本索引范围；需要全站文档时用 [weixin-docs](https://skillhub.cn/skills/tencent-adm/weixin-docs)（同一个文档 MCP，不锁板块）。

## 文档 MCP

地址：`https://developers.weixin.qq.com/doc/mcp`（服务名 `wx-doc-mcp-server`，Streamable HTTP，无鉴权）。

这是微信开放文档服务，不是本机 `wechatide mcp`。当前会话已挂上列工具时直接调用。未挂上时，把下面配置交给用户接入，接上后再查，不要改走本机开发者工具 MCP：

```json
{
  "mcpServers": {
    "wx-docs": {
      "url": "https://developers.weixin.qq.com/doc/mcp",
      "type": "http"
    }
  }
}
```

只用这 7 个只读工具：`list_sectors`、`search_docs`、`read_doc`、`list_directory`、`search_knowledge`、`get_knowledge`、`list_knowledge_by_doc`。

## 调用顺序

1. 问的是 `project.config.json` 字段含义或写入规则：先读 [project-config-fields.md](project-config-fields.md) 和 [project-config](../skills/project-config/SKILL.md)。本包已有的字段按该表回答。表里没有的字段，再 `read_doc` 对应板块的 `projectconfig.md`，并说明这是官方文档补充。
2. 其他问题能对上「高频入口」时，先 `read_doc` 那一条 path。
3. 对不上、或读完仍答不了：`search_docs`，带上节的 `sector`，`query` 用用户原话，`limit` 取 8 左右。
4. 对最相关的一条 `read_doc`。`chunk.hasMore` 为 true 时，只用返回的 `headings[].offset` 或 `chunk.nextOffset` 续读相关章节，不要把更新日志整篇读完。
5. 文档正文没有答案时，再 `search_knowledge`；要全文用 `get_knowledge`。已经有页面 URL 或 path 时，用 `list_knowledge_by_doc` 反查 FAQ。
6. 板块确认不了时，先 `list_sectors`，仍只选上表两个 devtools 板块。

`read_doc` / `search_docs` 的 path 带 `.md`，例如 `miniprogram/dev/devtools/cli.md`。回答里的链接用 `read_doc` 返回的线上 URL，不要自己拼未读过的地址。

## 高频入口

小游戏把前缀 `miniprogram` 换成 `minigame`。小游戏侧没有同名页时，回到 `search_docs`，不要沿用小程序 URL。

| 意图 | path |
|------|------|
| 命令行 CLI | `miniprogram/dev/devtools/cli.md` |
| HTTP 调用 | `miniprogram/dev/devtools/http.md` |
| `project.config.json` 字段含义 | 先读 [project-config-fields.md](project-config-fields.md)；未覆盖的字段再读 `miniprogram/dev/devtools/projectconfig.md` |
| 设置、安全、服务端口 | `miniprogram/dev/devtools/settings.md` |
| Skills 安装与能力说明 | `miniprogram/dev/devtools/Skills.md` |
| 下载、Nightly / 稳定版入口 | `miniprogram/dev/devtools/download.md` |
| 稳定版更新日志 | `miniprogram/dev/devtools/log.md` |

## 和本包冲突时

分主题裁决，不要用一条规则覆盖全部：

- `project.config.json` 的字段含义与写入规则以 [project-config-fields.md](project-config-fields.md) 和 [project-config](../skills/project-config/SKILL.md) 为准，与这两处声明的优先级一致。本包已写明的字段，不要改用官方 `projectconfig.md` 里的不同说法。本包未覆盖的字段，再用官方文档补充，并注明是文档补充。
- 工具名、参数、令牌规则以本包为准：根 `SKILL.md`、[tool-index](tool-index.md)、[运行前检查](environment-readiness.md)，或 `wechatide <toolName> -h`。公开文档（含 Skills 页）若仍写旧工具名或旧目录，执行时跟本包，并说明文档页落后于当前导出的 skill。
- 菜单路径、版本线差异，以及上面两类以外的工具用法，以刚读到的官方文档为准。本包没有写的不要编造。

## 禁止

- 不要编造文档和本包都没出现的参数、菜单路径、错误码。
- 不要调用文档 MCP 以外的写接口，也不要改开放文档。
- 不要用本文去执行 `wechatide`。改本地 `project.config.json` 走 `skills/project-config/SKILL.md`。只问字段含义时同样以 [project-config-fields.md](project-config-fields.md) 为准。
