# create-vite-taro

## 0.8.10

### 修复

- b932fed7：默认模板由应用直接管理 Vite 和 VPT，Rolldown 交由工具链依赖管理。
- 1e8d3f24：默认模板为 H5 配置 `tabBar.custom: true` 并注册标签页，使用自定义 React 标签栏切换页面时保留计数器等页面状态。

### 升级说明

生成器从 `0.8.9` 升级到 `0.8.10`，使用新版模板创建项目：

```sh
pnpm create vite-taro@0.8.10 my-app
```

新项目自动使用 `0.8.10` 版插件与运行时。已有项目执行 `pnpm add -D --save-exact vite-plugin-taro@0.8.10`；删除 `overrides` 或 `resolutions` 中为 VPT 添加的 Rolldown 条目，并执行 `pnpm remove -D rolldown` 移除仅为 VPT 添加的直接依赖。项目自身调用 Rolldown API 时保留所需直接依赖。

已有模板项目在 `vite.config.ts` 的 `createAppJson()` 中为 H5 返回 `tabBar: { custom: true, list: tabPages.map(({ path, label }) => ({ pagePath: path, text: label })) }`，保留各页面的 React `<TabBar>` 及其 `Taro.switchTab()` 调用。重新安装依赖、重启开发服务器并重新构建 H5。

## 0.8.9

### 变更

- e2ede48f：默认模板新增小红书 `dev:xhs`、`build:xhs` 命令、`VITE_VPT_XIAOHONGSHU_APP_ID` 环境变量、平台类型和共享及私有项目配置。
- e2ede48f：适配小红书导航栏与设备信息；启用 `tabBar.custom` 时使用模板的 React 标签栏。

### 升级说明

生成器从 `0.8.8` 升级到 `0.8.9`，使用新版模板创建项目：

```sh
pnpm create vite-taro@0.8.9 my-app
```

新项目自动使用 `0.8.9` 版插件与运行时。开发小红书项目时，在 `.env.local` 设置 `VITE_VPT_XIAOHONGSHU_APP_ID`，运行 `pnpm dev:xhs` 或 `pnpm build:xhs`，并将 `dist/xhs` 导入小红书开发者工具。

已有项目执行 `pnpm add -D --save-exact vite-plugin-taro@0.8.9`。接入小红书时参考新版模板补充目标选择、App ID、项目配置和命令；其他目标保持原配置。

## 0.8.8

### 变更

- 847f00b0：默认模板更新 Vite 至 `8.3.7`、Rolldown 至 `1.2.18`，与插件的构建依赖保持一致。

### 升级说明

生成器从 `0.8.7` 升级到 `0.8.8`，使用新版模板创建项目：

```sh
pnpm create vite-taro@0.8.8 my-app
```

新项目自动使用 `0.8.8` 版插件与运行时。已有项目同步升级构建依赖：

```sh
pnpm add -D --save-exact vite-plugin-taro@0.8.8 vite@8.3.7 rolldown@1.2.18
```

如项目在 overrides 或 resolutions 中固定了 Vite、Rolldown 版本，同步改为 `8.3.7` 和 `1.2.18`；引用直接依赖的 `$rolldown` 配置保持不变。安装后重启开发服务器并重新构建应用。

## 0.8.7

### 变更

本包无面向用户的变更。

### 升级说明

生成器从 `0.8.6` 升级到 `0.8.7`，使用同版插件创建新项目：

```sh
pnpm create vite-taro@0.8.7 my-app
```

新项目自动使用 `0.8.7` 版插件与运行时。已有项目执行 `pnpm add -D --save-exact vite-plugin-taro@0.8.7`，然后重启开发服务器并重新构建应用。

## 0.8.6

### 变更

- 784bfcae：默认模板更新 Vite 至 `8.3.6`、Rolldown 至 `1.2.16`、Node.js 类型至 `^26.6.6`，与插件的构建依赖保持一致。

### 升级说明

生成器从 `0.8.5` 升级到 `0.8.6`，使用新版模板创建项目：

```sh
pnpm create vite-taro@0.8.6 my-app
```

新项目自动使用 `0.8.6` 版插件与运行时。已有项目同步升级构建依赖：

```sh
pnpm add -D --save-exact vite-plugin-taro@0.8.6 vite@8.3.6 rolldown@1.2.16
```

如项目在 overrides 或 resolutions 中固定了 Vite、Rolldown 版本，同步改为 `8.3.6` 和 `1.2.16`；引用直接依赖的 `$rolldown` 配置保持不变。安装后重启开发服务器并重新构建应用。

## 0.8.5

### 变更

本包无面向用户的变更。

### 升级说明

生成器从 `0.8.4` 升级到 `0.8.5`，使用同版插件创建新项目：

```sh
pnpm create vite-taro@0.8.5 my-app
```

新项目自动使用 `0.8.5` 版插件与运行时。已有项目执行 `pnpm add -D --save-exact vite-plugin-taro@0.8.5`，然后重启开发服务器并重新编译开发者工具中的项目。

## 0.8.4

### 新增与改进

- fbf76ee3：默认模板新增淘宝开发与构建脚本、独立 App ID 配置、导航栏适配和开发工具配置，支持自动分包及 React 自定义标签栏。
- fbf76ee3：创建项目后的开发命令提示与模板脚本保持同步；模板 README 使用 pnpm 命令，并提供 `build --watch` 示例。

### 升级说明

生成器从 `0.8.3` 升级到 `0.8.4`，使用新版模板创建项目：

```sh
pnpm create vite-taro@0.8.4 my-app
```

新项目自动使用同版插件与运行时。淘宝项目在 `.env.local` 中填写 `VITE_VPT_TAOBAO_APP_ID`，运行 `pnpm dev:tb`，并用淘宝开发者工具导入 `dist/tb`。

已有项目执行 `pnpm add -D --save-exact vite-plugin-taro@0.8.4` 升级插件；采用淘宝目标时，合并模板中的淘宝脚本、环境变量和平台配置。

## 0.8.3

### 变更

本包无面向用户的变更。

### 升级说明

从 `0.8.2` 升级到 `0.8.3`，使用同版插件创建新项目：

```sh
npm create vite-taro@0.8.3 my-app
```

新项目自动使用同版插件与运行时。已有项目通过 `pnpm add -D --save-exact vite-plugin-taro@0.8.3` 升级。

## 0.8.2

### 变更

- 51521ea7：默认模板更新 React 与 React DOM 至 `^19.3.1`、Vite 至 `8.3.5`、Rolldown 至 `1.2.15`，并同步 Node.js 类型依赖。

### 升级说明

从 `0.8.1` 升级到 `0.8.2`，使用同版插件的新模板创建项目：

```sh
npm create vite-taro@0.8.2 my-app
```

新项目自动使用同版插件与运行时。已有项目按 `vite-plugin-taro@0.8.2` 的升级说明同步 React、Vite 和 Rolldown 依赖。

## 0.8.1

### 变更

- d2cc2a4e：默认模板显式声明 `renderer: 'template'`，并补充微信 Skyline / WebView 渲染配置提示。

### 升级说明

从 `0.8.0` 升级到 `0.8.1`，使用同版插件的新模板创建项目：

```sh
npm create vite-taro@0.8.1 my-app
```

现有项目通过 `pnpm add -D --save-exact vite-plugin-taro@0.8.1` 升级插件；模板继续使用模板渲染与微信 Skyline 配置。

## 0.8.0

### 新增与改进

- 46215180、7ba1fbe5、996bd652：默认模板提供首页、探索、关于三个 Tab 页面；各页面通过 React 渲染标签栏，并集中维护导航配置与跨端原生 tabBar 声明。
- b301d0d8：模板页面启用 ScrollView flex 布局，完善页面级导航与内容布局。
- ea96811a、9e85eb14：在微信 App 的 window 配置中声明 glassEaselWebview，并验证模板的跨端窗口配置。

### 升级说明

从 `0.7.13` 升级到 `0.8.0`，使用新模板创建项目：

```sh
npm create vite-taro@0.8.0 my-app
```

新项目自动依赖同版稳定插件。现有项目不会被生成器覆盖；如需采用新标签栏示例，合并模板中的 `src/tab-pages.ts`、`src/components/tab-bar/` 及对应的页面和 `appJson.tabBar` 配置。现有项目仅升级插件时，无需迁移到新模板。

## 0.8.0-beta.0

### 新增与改进

- 46215180、7ba1fbe5、996bd652：默认模板提供首页、探索、关于三个 Tab 页面；各页面通过 React 渲染标签栏，并集中维护导航配置与跨端原生 tabBar 声明。
- b301d0d8：模板页面启用 ScrollView flex 布局，完善页面级导航与内容布局。
- ea96811a、9e85eb14：在微信 App 的 window 配置中声明 glassEaselWebview，并验证模板的跨端窗口配置。

### 升级说明

从 `0.7.13` 升级到 `0.8.0-beta.0`，使用新模板创建项目：

```sh
npm create vite-taro@0.8.0-beta.0 my-app
```

新项目自动依赖同版 beta 插件。现有项目不会被生成器覆盖；如需采用新标签栏示例，合并模板中的 `src/tab-pages.ts`、`src/components/tab-bar/` 及对应的页面和 `appJson.tabBar` 配置。现有项目仅升级插件时，无需迁移到新模板。

## 0.7.13

### 修复

- 95aa6691：默认模板使用 flex 布局分配页面与共享页脚的空间，小程序页面和 H5 路由容器自适应剩余高度。

### 升级说明

从 `0.7.12` 升级到 `0.7.13`：新项目使用以下命令创建。

```sh
pnpm create vite-taro@0.7.13 my-app
```

## 0.7.12

### 变更

- 4b22bb4f：新项目默认使用 Vite `8.3.4` 和 Rolldown `1.2.13`，通过版本覆盖统一构建依赖。
- 2c7a0dd3：新项目的 Skyline 配置默认设置 `disableABTest: true`，符合条件的真机可直接使用 Skyline。
- e3d52ef2：新项目的微信页面显式启用 `glassEaselWebview`，确保开发者工具 WebView 模拟器采用 glass-easel。
- 20641bfc：新项目按需配置 `sitemapJson`，由项目自行声明微信搜索索引规则。

### 升级说明

从 `0.7.11` 升级到 `0.7.12`：新项目使用以下命令创建。

```sh
pnpm create vite-taro@0.7.12 my-app
```

## 0.7.12-beta.1

### 变更

- 4b22bb4f：新项目默认使用 Vite `8.3.4` 和 Rolldown `1.2.13`，并通过版本覆盖统一 Vite 与插件使用的 Rolldown 版本。

### 升级说明

从 `0.7.12-beta.0` 升级到 `0.7.12-beta.1`：新项目使用 `pnpm create vite-taro@0.7.12-beta.1 my-app`。

## 0.7.12-beta.0

### 变更

- 2c7a0dd3：新项目的 Skyline 配置默认设置 `disableABTest: true`，让符合条件的真机无需配置 We 分析 AB 实验即可使用 Skyline。
- e3d52ef2：新项目的微信页面显式设置 `config.glassEaselWebview: true`，并保留 App 顶层开关，避免开发者工具 WebView 模拟器忽略全局设置而未启用 glass-easel；其他目标配置不变。

### 升级说明

从 `0.7.11` 升级到 `0.7.12-beta.0`：新项目使用 `pnpm create vite-taro@0.7.12-beta.0 my-app`。

## 0.7.11

### 变更

- a1ddbbd8：新项目默认使用 Rolldown `1.2.12`，包含 macOS 文件监听保存事件丢失的修复；Vite 版本仍为 `8.3.1`。

### 升级说明

从 `0.7.10` 升级到 `0.7.11`：新项目使用 `pnpm create vite-taro@0.7.11 my-app`。

## 0.7.10

### 变更

- 1d3a0f4c: 新项目默认使用 Vite `8.3.1` 和 Rolldown `1.2.11`，并添加 Rolldown 版本覆盖，统一构建器与热更新运行时使用的版本。
- 3f8e2da2: 新项目的开发、构建和预览脚本不再强制设置 `NODE_ENV`，由 Vite 选择默认值，并保留外部传入的设置。

### 升级说明

从 `0.7.9` 升级到 `0.7.10`：新项目使用 `pnpm create vite-taro@0.7.10 my-app`。

## 0.7.10-beta.1

### 变更

- 1d3a0f4c: 新项目默认使用 Vite `8.3.1` 和 Rolldown `1.2.11`，并添加 Rolldown 版本覆盖，统一构建器与热更新运行时使用的版本。

### 升级说明

从 `0.7.10-beta.0` 升级到 `0.7.10-beta.1`：新项目使用 `pnpm create vite-taro@0.7.10-beta.1 my-app`。

## 0.7.10-beta.0

### 变更

- 3f8e2da2: 新项目的开发、构建和预览脚本不再强制设置 `NODE_ENV`，由 Vite 选择默认值，并保留外部传入的设置。

### 升级说明

从 `0.7.9` 升级到 `0.7.10-beta.0`：新项目使用 `pnpm create vite-taro@0.7.10-beta.0 my-app`。

## 0.7.9

### 变更

本包无面向用户的变更。

### 升级说明

从 `0.7.8` 升级到 `0.7.9`：新项目使用 `pnpm create vite-taro@0.7.9 my-app`。

## 0.7.8

### 变更

本包无面向用户的变更。

### 升级说明

从 `0.7.7` 升级到 `0.7.8`：新项目使用 `pnpm create vite-taro@0.7.8 my-app`。

## 0.7.7

### 变更

本包无面向用户的变更。

### 升级说明

从 `0.7.6` 升级到 `0.7.7`：新项目使用 `pnpm create vite-taro@0.7.7 my-app`。

## 0.7.6

### 修复

- e61bbe2: 修复默认模板按钮的原生边框与圆角不一致的问题，移除按钮边框和 `::after` 伪元素，保留原有圆角。

### 升级说明

从 `0.7.5` 升级到 `0.7.6`：新项目使用 `pnpm create vite-taro@0.7.6 my-app`。

## 0.7.5

### 变更

- 54b2ad3: 新增抖音小程序支持。

### 升级说明

从 `0.7.4` 升级到 `0.7.5`：新项目使用 `pnpm create vite-taro@0.7.5 my-app`。

## 0.7.5-beta.1

### 变更

本包无面向用户的变更。

### 升级说明

从 `0.7.5-beta.0` 升级到 `0.7.5-beta.1`：新项目使用 `pnpm create vite-taro@0.7.5-beta.1 my-app`。

## 0.7.5-beta.0

### 变更

- 54b2ad3: 新增抖音小程序支持。

### 升级说明

从 `0.7.4` 升级到 `0.7.5-beta.0`：新项目使用 `pnpm create vite-taro@0.7.5-beta.0 my-app`。已有项目无需重新生成，运行 `pnpm add -D vite-plugin-taro@0.7.5-beta.0` 更新插件。

## 0.7.4

### 更新内容

- 509b0da: 新建 pnpm 项目不再为 `core-js` 的捐赠提示脚本要求运行 `pnpm approve-builds`，其他依赖的构建脚本审批不变。

### 升级说明

从 `0.7.3` 升级到 `0.7.4`：新建项目请使用 pnpm 10.26+ 运行 `pnpm create vite-taro@0.7.4 my-app`。已有项目无需重新生成；更新插件时请参阅 `vite-plugin-taro` 的升级说明。

## 0.7.4-beta.0

### 更新内容

本包无面向用户的变更。

### 升级说明

从 `0.7.3` 升级到 `0.7.4-beta.0` 无需修改代码或配置。新建 beta 测试项目请运行 `pnpm create vite-taro@0.7.4-beta.0`；已有项目无需重新生成，更新 `vite-plugin-taro` 即可。

## 0.7.3

### 更新内容

- f9be2ab: 默认模板的 Footer、ApiCard 和 BotanicalSprig 改用 HTML 标签，保留原有布局与 Taro API 调用。

### 升级说明

使用 `pnpm create vite-taro@0.7.3 my-app` 创建新项目。已有项目从 `0.7.2` 或 `0.7.3-beta.2` 升级到 `0.7.3` 无需重新生成；升级插件时请参阅 `vite-plugin-taro` 的升级说明。

## 0.7.3-beta.2

### 更新内容

- f9be2ab: 默认模板的 Footer、ApiCard 和 BotanicalSprig 改用 HTML 标签，保留原有布局与 Taro API 调用，并更新快速开始示例。

### 升级说明

使用 `pnpm create vite-taro@0.7.3-beta.2 my-app` 创建新项目。已有项目无需重新生成，也无需修改代码或配置；模板调整仅影响新创建的项目。

## 0.7.3-beta.1

### 更新内容

本包无面向用户的变更。

### 升级说明

使用 `pnpm create vite-taro@0.7.3-beta.1` 创建项目。已有项目从 `0.7.3-beta.0` 升级插件至 `0.7.3-beta.1`，请参阅 `vite-plugin-taro` 的升级说明，无需重新生成项目。

## 0.7.3-beta.0

### 更新内容

本包无面向用户的变更。

### 升级说明

使用 `pnpm create vite-taro@0.7.3-beta.0` 创建项目。已有项目从 `0.7.2` 升级插件至 `0.7.3-beta.0`，请参阅 `vite-plugin-taro` 的升级说明，无需重新生成项目。

## 0.7.2

### 更新内容

- 与固定版本组同步升级至 `0.7.2`，新建项目使用 `vite-plugin-taro@0.7.2`，包含本次小程序 HMR 启动恢复修复。
- 脚手架实现无其他改动。

## 0.7.1

### Patch Changes

- 80819b8: Derive the scaffolded vite-plugin-taro dependency from the generator's own release version, including beta releases, instead of maintaining a separate version in the template.

## 0.7.1-beta.2

### Patch Changes

- 80819b8: Derive the scaffolded vite-plugin-taro dependency from the generator's own release version, including beta releases, instead of maintaining a separate version in the template.

Releases through 0.7.1-beta.1 are recorded in the [historical changelog](../../CHANGELOG.md).
