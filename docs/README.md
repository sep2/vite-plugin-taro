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

## 部署

CI 在稳定版 npm 包成功发布后，将同一提交的文档部署到 GitHub Pages，并显示该发布版本。Pull Request 会运行文档测试和构建检查。

需要单独发布文档时，在 GitHub Actions 中选择 **Deploy docs manually → Run workflow → main**，或运行：

```sh
gh workflow run deploy-docs.yml --ref main
```

手动部署会复用文档测试、构建和 GitHub Pages 部署流程，显示 npm `latest` 对应的稳定版本。

## AI 可读文档

构建会从相同的内容源码生成独立的 Markdown 文档，请勿手动维护构建产物：

- `/llms.txt`：简短的 AI 文档索引与关键项目约定。
- `/guides/<slug>.md`：每篇操作指南对应一个文件。
- `/references/<slug>.md`：每篇参考文档对应一个文件。

`llms.txt` 只提供索引，不会把所有页面合并成一个大文件。
