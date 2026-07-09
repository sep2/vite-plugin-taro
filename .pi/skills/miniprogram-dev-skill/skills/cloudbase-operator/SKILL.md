---
name: cloudbase-operator
description: 负责云操作：云环境、云函数、云数据库、云存储。
---

# cloudbase-operator

## 用途

处理与小程序云开发云资源相关的所有操作。

典型任务：

- 列出可用云环境
- 检查已部署云函数
- 查询函数运行状态
- 部署或增量部署云函数
- 查询或修改云数据库集合与文档
- 查询或管理云存储文件

## 工作流

1. 识别目标 AppID 和目标云环境。
2. 通过运行时上下文解析环境信息。
3. 如果存在多个环境候选，则要求用户明确指定。
4. 选择能够回答当前问题的最窄云工具。
5. 输出结果。

## 通用约束

- CloudBase MCP 工具（`cloud_db_*`、`cloud_stor_*`）必须传 `appid` 和 `env`，不再要求项目本地路径。
- `env` 必须是云开发环境 ID；不明确时先用 `cloud_env_list`，不要猜测或自动选择候选环境。
- 写操作会触发确认门；用户拒绝或确认超时时不要重试破坏性操作。
- 临时下载链接属于短期签名 URL，可能包含签名、临时密钥和安全 token；只用于当前任务，不要写入代码、配置或长期文档。

## 工具列表

### cloud_env_list — 列出云环境

列出小程序可用云环境。

```bash
wechatide -c <clientName> -t cloud_env_list --project <project>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | string | 否 | 项目本地绝对路径 |
| `appid` | string | 否 | 小程序 AppID |

---

### cloud_fn_list — 列出云函数

列出目标云环境下的云函数。

```bash
wechatide -c <clientName> -t cloud_fn_list --appid <appid> --env <envId>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env` | string | 是 | 云环境 ID |
| `appid` | string | 是 | 小程序 AppID |

---

### cloud_fn_info — 查询云函数信息

查询目标云函数的状态、超时和运行时信息。

```bash
wechatide -c <clientName> -t cloud_fn_info --appid <appid> --env <envId> --names fnName
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env` | string | 是 | 云环境 ID |
| `names` | string | 是 | 云函数名称（逗号分隔） |
| `appid` | string | 是 | 小程序 AppID |

---

### cloud_fn_deploy — 部署云函数

完整部署一个或多个云函数。

固定使用 `appid` + `paths` 组合：`paths` 指向云函数目录，函数目录名即函数名称。

```bash
wechatide -c <clientName> -t cloud_fn_deploy --appid <appid> --env <envId> --paths <cloudFunctionDir> --remote-npm-install
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `env` | string | 是 | 云环境 ID |
| `appid` | string | 是 | 小程序 AppID |
| `paths` | string | 是 | 云函数目录本地绝对路径（逗号分隔多个） |
| `remote-npm-install` | boolean | 否 | 是否远程安装 npm 依赖（推荐 true） |

---

### cloud_fn_inc_deploy — 增量部署云函数

按云函数目录和变更文件或目录做增量部署。

```bash
wechatide -c <clientName> -t cloud_fn_inc_deploy --appid <appid> --env <envId> --path <cloudFunctionDir> --file index.js
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appid` | string | 是 | 小程序 AppID |
| `env` | string | 是 | 云环境 ID |
| `path` | string | 是 | 云函数目录本地绝对路径，目录名即云函数名称 |
| `file` | string | 是 | 变更文件或目录路径，必须相对云函数目录 |

---

### cloud_db_read_struct — 读取云数据库结构

只读查询 NoSQL 集合与索引结构。

```bash
wechatide -c <clientName> -t cloud_db_read_struct --appid <appid> --env <envId> --action listCollections
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appid` | string | 是 | 小程序 AppID |
| `env` | string | 是 | 云开发环境 ID |
| `action` | string | 是 | `listCollections` / `describeCollection` / `checkCollection` / `listIndexes` / `checkIndex` |
| `collectionName` | string | 否 | 集合名称；查询集合详情或索引时使用 |
| `indexName` | string | 否 | 索引名称；`checkIndex` 时使用 |
| `limit` | number | 否 | 返回数量限制 |
| `offset` | number | 否 | 分页偏移 |

---

### cloud_db_write_struct — 修改云数据库结构

创建或删除集合，管理集合索引。写操作，必须经过用户确认。

```bash
wechatide -c <clientName> -t cloud_db_write_struct \
  --appid <appid> --env <envId> \
  --action createCollection --collection-name <collection>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appid` | string | 是 | 小程序 AppID |
| `env` | string | 是 | 云开发环境 ID |
| `action` | string | 是 | `createCollection` / `updateCollection` / `deleteCollection` |
| `collectionName` | string | 是 | 集合名称 |
| `updateOptions` | object | 否 | `updateCollection` 使用；CreateIndexes 添加索引，DropIndexes 删除索引 |

---

### cloud_db_read_doc — 读取云数据库内容

只读查询集合文档，支持条件、投影、排序和分页。

```bash
wechatide -c <clientName> -t cloud_db_read_doc --appid <appid> --env <envId> --collection-name <collection> --query-file ./query.json --projection-file ./projection.json --sort-file ./sort.json --limit 10 --offset 0
```

JSON 文件用途：

- `query.json`：查询条件，用来筛选要读取的文档；不传则查询集合内文档。
- `projection.json`：字段投影，用来控制返回哪些字段。
- `sort.json`：排序规则，按字段升序或降序排列结果。

`query.json` 示例：

```json
{ "field": "value" }
```

`projection.json` 示例：

```json
{ "field": 1, "_id": 1 }
```

`sort.json` 示例：

```json
[{ "key": "createdAt", "direction": -1 }]
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appid` | string | 是 | 小程序 AppID |
| `env` | string | 是 | 云开发环境 ID |
| `collectionName` | string | 是 | 集合名称 |
| `query` | object | 否 | 查询条件对象 |
| `projection` | object | 否 | 返回字段投影 |
| `sort` | array | 否 | 排序条件 |
| `limit` | number | 否 | 返回数量限制 |
| `offset` | number | 否 | 跳过记录数 |

---

### cloud_db_write_doc — 修改云数据库内容

插入、更新或删除集合文档。写操作，必须经过用户确认。

```bash
# 插入文档：documents 是要插入的文档数组
wechatide -c <clientName> -t cloud_db_write_doc --appid <appid> --env <envId> --action insert --collection-name <collection> --documents-file ./documents.json

# 更新文档：query 负责找文档，update 负责描述怎么改
wechatide -c <clientName> -t cloud_db_write_doc --appid <appid> --env <envId> --action update --collection-name <collection> --query-file ./query.json --update-file ./update.json

# 删除文档：query 负责找要删除的文档
wechatide -c <clientName> -t cloud_db_write_doc --appid <appid> --env <envId> --action delete --collection-name <collection> --query-file ./query.json
```

JSON 文件用途：

- `documents.json`：`insert` 使用，必须是数组，每一项是一条要插入的文档。
- `query.json`：`update` / `delete` 使用，用来筛选要修改或删除的文档。
- `update.json`：`update` 使用，只描述更新动作，不写查询条件；推荐使用 `$set` / `$inc` / `$unset` 等操作符。

`documents.json` 示例：

```json
[{ "field": "value", "count": 1 }]
```

`query.json` 示例：

```json
{ "_id": "<docId>" }
```

`update.json` 示例：

```json
{ "$set": { "field": "newValue" } }
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appid` | string | 是 | 小程序 AppID |
| `env` | string | 是 | 云开发环境 ID |
| `action` | string | 是 | `insert` / `update` / `delete` |
| `collectionName` | string | 是 | 集合名称 |
| `documents` | array | 否 | `insert` 操作的文档数组 |
| `query` | object | 否 | `update` / `delete` 操作的查询条件 |
| `update` | object | 否 | `update` 操作的更新内容，推荐使用 `$set` / `$inc` / `$unset` 等操作符 |
| `isMulti` | boolean | 否 | 是否更新或删除多条记录 |
| `upsert` | boolean | 否 | 更新时不存在则插入 |

---

### cloud_stor_read — 读取云存储

只读查询云存储文件列表、文件信息、临时下载链接或文本内容。

```bash
wechatide -c <clientName> -t cloud_stor_read --appid <appid> --env <envId> --action list --cloud-path <cloudPath>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appid` | string | 是 | 小程序 AppID |
| `env` | string | 是 | 云开发环境 ID |
| `action` | string | 是 | `list` / `info` / `url` / `read` |
| `cloudPath` | string | 是 | 云端文件路径，例如 `files/data.txt` 或 `files/` |
| `maxAge` | number | 否 | 临时链接有效期（秒），默认 3600 |

返回提醒：

- `action=url` 返回的是 `temporaryUrl`，按 `expireTime` 过期，不是永久公开地址。
- 返回结果不暴露 `publicUrl` 和 `note`。

---

### cloud_stor_write — 修改云存储

上传、下载或删除云存储文件。`upload` / `delete` 是写操作，必须经过用户确认；`download` 不触发确认。

```bash
wechatide -c <clientName> -t cloud_stor_write --appid <appid> --env <envId> --action upload --cloud-path <cloudPath> --local-path <localPath>
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appid` | string | 是 | 小程序 AppID |
| `env` | string | 是 | 云开发环境 ID |
| `action` | string | 是 | `upload` / `download` / `delete` |
| `cloudPath` | string | 是 | 云端文件路径，例如 `files/data.txt` |
| `localPath` | string | 否 | 本地文件路径；`upload` / `download` 时必需 |
| `force` | boolean | 否 | `delete` 时建议传 `true` |
| `isDirectory` | boolean | 否 | 是否按目录操作 |

返回提醒：

- `upload` 成功后可能返回 `temporaryUrl`、`expireTime` 和 `storageCdnDomain`。
- 返回结果不暴露 `publicUrl` 和 `note`。
- 删除目录前要明确 `cloudPath` 范围；不要用空路径或过宽前缀做删除。

## 常见目标到工具

| 用户意图 | 选择 |
|---------|------|
| "先看看有哪些环境" | `cloud_env_list` |
| "当前有哪些云环境候选" | `cloud_env_list` |
| "把函数列表给我" | `cloud_fn_list` |
| "查一下这个函数的状态" | `cloud_fn_info` |
| "把这个函数部署上去" | `cloud_fn_deploy`（用 `appid` + `paths`） |
| "只改了一个文件或目录，增量部署" | `cloud_fn_inc_deploy` |
| "有哪些数据库集合" | `cloud_db_read_struct` |
| "创建集合 / 改索引" | `cloud_db_write_struct` |
| "查询集合里的数据" | `cloud_db_read_doc` |
| "插入 / 更新 / 删除文档" | `cloud_db_write_doc` |
| "列出云存储文件" | `cloud_stor_read`（action=list） |
| "获取云存储临时下载链接" | `cloud_stor_read`（action=url） |
| "读取云存储文本内容" | `cloud_stor_read`（action=read） |
| "上传 / 删除云存储文件" | `cloud_stor_write` |
| "下载云存储文件到本地" | `cloud_stor_write`（action=download，无需确认） |

## 选择提醒

- 如果环境名还不明确，先做 `cloud_env_list`
- 如果只是想确认状态，优先函数只读查询，不要直接部署
- **部署云函数固定使用 `appid` + `paths` 组合**，明确传入云函数目录的本地绝对路径
- **增量部署云函数固定使用 `appid` + `path` 组合**，`file` 必须是相对该云函数目录的文件或目录路径
- **云数据库工具必须显式传 `appid` 和 `env`**；先用 `cloud_env_list` 获取环境 ID
- 云数据库写操作会触发确认；更新文档时优先使用 `$set` / `$inc` / `$unset` 等操作符
- **云存储工具必须显式传 `appid` 和 `env`**；先用 `cloud_env_list` 获取环境 ID
- 云存储 upload/delete 会触发确认；delete 还需传 `force=true`
- `cloud_stor_read` 的 `action=url` 和 `cloud_stor_write` 的 upload 返回临时签名链接，不可当作永久公开 URL
- 云存储返回结果不暴露 `publicUrl` 和 `note`；不要基于这两个字段编写后续流程

## 云数据库工具

- `cloud_db_read_struct`：读取集合、集合详情、索引列表。
- `cloud_db_write_struct`：创建 / 删除集合、添加 / 删除索引（写操作，需用户确认）。
- `cloud_db_read_doc`：查询集合文档，支持条件、投影、排序、分页。
- `cloud_db_write_doc`：插入、更新、删除文档（写操作，需用户确认）。

## 云存储工具

- `cloud_stor_read`：列出文件、获取文件信息、临时下载链接、读取文本内容。
- `cloud_stor_write`：上传、下载、删除云存储文件；upload/delete 需用户确认，delete 还需 `force=true`。

## 使用边界

- 当存在多个候选环境时，绝不自动选择其中一个
- 部署云函数固定使用 `appid` + `paths` 组合
- 云数据库写操作必须经过用户确认
- 云存储 upload/delete 必须经过用户确认
- 云存储 delete 必须明确目标路径；目录删除要传 `--is-directory` 并确认范围
- 当结果是部分成功或混合结果时，应保留真实返回结构

## 备注

- 如果需要在微信小程序中使用 FiledId 代表云存储资源，可按 `cloud://<envid>.<bucketid>/xxx/` 拼接 FileId，其中 `xxx/` 是资源路径。
