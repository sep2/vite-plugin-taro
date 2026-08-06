# vite-plugin-taro 文档站

本目录包含基于 [Astro Starlight](https://starlight.astro.build/) 构建的中文文档站。

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

文档内容位于 `src/content/docs`。推送到 `main` 的 `docs/**` 变更会通过 GitHub Actions 部署到 <https://vpt.js.org/>。
