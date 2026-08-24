# VPT 文档站

本目录包含基于 [Astro Starlight](https://starlight.astro.build/) 构建的中文文档站。

> **推荐使用 AI 开发：** 阅读 [VPT AI 开发指南](https://vpt.js.org/guides/ai/)，让编程助手创建项目并完成开发、测试和验证。

## 本地开发

在仓库根目录运行：

```sh
pnpm dev:docs
```

开发服务器默认运行在 <http://localhost:4321/>。

## 构建

```sh
pnpm --filter docs build
pnpm --filter docs preview
```

文档内容位于 `src/content/docs`。线上文档部署在 <https://vpt.js.org>。

## AI 可读文档

构建会从相同的内容源码生成独立的 Markdown 文档，请勿手动维护构建产物：

- `/llms.txt`：简短的 AI 文档索引与关键项目约定。
- `/guides/<slug>.md`：每篇操作指南对应一个文件。
- `/references/<slug>.md`：每篇参考文档对应一个文件。

`llms.txt` 只提供索引，不会把所有页面合并成一个大文件。
