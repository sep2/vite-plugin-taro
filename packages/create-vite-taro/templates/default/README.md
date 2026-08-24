# VPT

基于 Vite 8、React 19、Taro 4、TypeScript 和 Tailwind CSS v4，一套代码运行于微信小程序和 Web。

- [文档](https://vpt.js.org)
- [GitHub](https://github.com/sep2/vite-plugin-taro)

## AI 开发

把下面的提示词交给编程助手，让它先读取 VPT 文档，再开发并验证功能：

```text
请先阅读 https://vpt.js.org/llms.txt，再根据我的需求开发这个 VPT 项目。
```

测试微信小程序时，可安装微信官方的[开发者工具 Skills](https://developers.weixin.qq.com/miniprogram/dev/devtools/Skills.html)，让 AI 操作模拟器、读取日志、截图和预览。

## 快速开始

安装依赖：

```sh
npm install
```

### 微信小程序

1. 在 `.env.local` 中填写微信 App ID：

    ```dotenv
    VITE_VPT_WECHAT_APP_ID=wx1234567890abcdef
    ```

2. 启动开发构建：

    ```sh
    npm run dev:wx
    ```

3. 用微信开发者工具导入 `dist/wx`，不要导入项目根目录。

开发期间保持命令运行。模板已开启热更新、关闭本地开发的 URL 校验，并默认关闭开发者工具中暂不支持热更新的 Skyline。

### Web

```sh
npm run dev:h5
```

打开 Vite 输出的地址，通常是 <http://localhost:5173>。

## 开发

默认页面是 `src/pages/home/index.tsx`。VPT 通过虚拟模块提供 Taro 组件和 API：

```tsx
import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'
```

不要直接安装或导入 `@tarojs/*`。在 `vite.config.ts` 中添加页面并修改应用或微信项目配置。

模板包含条件编译、微信原生组件、懒加载、自定义导航栏、Tailwind CSS、CSS Modules 和全局样式示例；不需要的示例可直接删除。

### 样式

全局样式和 Tailwind 主题位于 `src/app.css`。保留 Tailwind 导入和 `@source "./";`，并在源码中写完整类名，不要拼接类名。组件独立样式使用 `*.module.css`。

### 热更新

微信端热更新通常会保留 App 数据、当前页面、兼容的 React Hook 状态和原生输入值。修改 Vite 配置、组件或 Hook 结构不兼容，或更新无法安全应用时，会整页重载。详见[热更新指南](https://vpt.js.org/guides/hot-module-replacement/)。

## 命令

| 命令 | 用途 | 输出 |
| --- | --- | --- |
| `npm run dev:wx` | 开发微信小程序 | `dist/wx` |
| `npm run dev:h5` | 开发 Web | — |
| `npm run build:wx` | 构建微信小程序 | `dist/wx` |
| `npm run build:h5` | 构建 Web | `dist/h5` |
| `npm run preview:h5` | 预览 Web 生产构建 | — |
| `npm run typecheck` | TypeScript 类型检查 | — |

## 常见问题

- **开发者工具无法打开项目：** 确认导入的是 `dist/wx`，且 `.env.local` 中的 App ID 可用。
- **热更新失败：** 依次关闭微信开发者工具、停止 `dev:wx`、删除 `dist/wx`、重新运行 `npm run dev:wx`，再打开开发者工具并导入 `dist/wx`。
- **Tailwind 类未生效：** 保留 `src/app.css` 中的 `@source "./";`，并使用完整类名。
- **pnpm 忽略依赖构建脚本：** 运行 `pnpm approve-builds`，批准所需脚本后重新安装。

继续阅读[快速开始指南](https://vpt.js.org/guides/quick-start/)或[完整文档](https://vpt.js.org)。
