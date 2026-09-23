# Loan Genius 测试

先按 [README](README.md#快速开始) 安装依赖并构建运行时和插件。以下命令均在**仓库根目录**运行。

## 类型检查与 Node 测试

无需启动小程序开发者工具：

```sh
pnpm typecheck:loan-genius
pnpm --filter loan-genius test
```

`test` 运行 `scripts/*.test.ts`，覆盖：

- `write-fixture-source.test.ts`：原子发布源文件，确保并发读取只看到完整内容；保留故意注入的语法错误，并在发布失败时清理临时文件。
- `hmr-fixture.test.ts`：停止 Vite 时等待进程退出并关闭日志句柄；强制终止用例仅在非 Windows 平台运行。
- `tt-target.test.ts`：实际构建 TT 产物，检查原生配置、模板和样式；通过模拟 API 验证抖音导航栏布局与 Android 判断仅调用 TT 支持的 API。

Node 测试不等同于开发者工具中的渲染和 HMR 验证。

## 构建检查

```sh
pnpm build:loan-genius:wx
pnpm build:loan-genius:zfb
pnpm build:loan-genius:tt
pnpm build:loan-genius:h5
```

小程序产物位于 `demo/loan-genius/dist/<target>`，用对应开发者工具打开。Web 构建完成后运行 `pnpm preview:loan-genius:h5`，在浏览器中检查计算器、月供明细和历史记录。

## 微信开发者工具 HMR 回归

### 准备与运行

需要安装并登录微信开发者工具，确保 `wechatide` 可用，并在 `demo/loan-genius/.env.local` 配置可用的 `VITE_VPT_WECHAT_APP_ID`。

```sh
pnpm build:plugin
wechatide auth -c Pi
pnpm test:loan-genius:hmr
pnpm test:loan-genius:hmr:restart
pnpm test:loan-genius:watch-restart
```

首次授权时按开发者工具提示确认。测试默认使用 `Pi` 客户端；如果已授权的名称不同，请在运行测试前设置环境变量 `VPT_LOAN_HMR_DEVTOOLS_CLIENT`。两个 `restart` 命令都会把替换进程的首次构建延迟三秒，以覆盖旧产物仍在磁盘上的启动窗口。

### 覆盖范围

测试通过有状态流程，检查计算器状态在以下场景中保留或按预期重置：

- React 组件、全局样式和 CSS Modules 修改；
- `layoutHoc.HOC(...)` 包装的页面、共享 HOC 实现和 `memo` 结果组件的独立更新；
- 多文件更新和突发更新；
- 已打开的选择器、弹窗及其他浮层；
- 隐藏页面、页面导航和返回；
- 语法错误恢复和正常重新挂载；
- Vite 开发服务器替换后自动加载新基线，并继续保留状态地应用两次 HMR；
- `vite build --watch` 进程替换前后的自动原生重载；
- URL polyfill 访问。

计算器、月供明细和历史页面共用 `layoutHoc.HOC(...)`，保留原有容器样式及安全区行为。测试使用默认压缩的开发产物，验证方法返回的具名组件仍可被 React Refresh 识别。HOC 用例只修改目标文件，不发布额外的页面 marker；直接断言目标内容更新、计算器输入和结果保留、包装组件 mount token 不变、构建标识不变，并在代码还原后重复断言。月供页面打开时还会修改共享 HOC，检查选中状态以及返回后隐藏计算器的状态。

适用的更新和代码还原后，还会检查生成类名是否符合 WX 约束，避免样式回归被忽略。

示例配置了 `polyfills: ['web.url']`，不配置 `URL` 的 `define` 映射。对应流程在启动、HMR 更新和代码还原后都使用裸 `URL`；更新时修改构造参数并检查新的解析结果，同时验证计算器状态保留。

### 测试目录与清理

测试使用固定临时项目：

```text
<os.tmpdir()>/vite-plugin-taro-loan-genius-hmr-v1
```

- 复制应用源码、配置和本地 App ID，注入稳定的自动化 ID；不修改仓库内的应用源码。
- 为自动化测试移除临时项目中的 Skyline 渲染配置，因此该套件不验证 Skyline。
- 原子替换每个源文件，避免 Vite 读到写入期间被截断的内容。
- 使用锁文件阻止并发运行同一套件。
- 开发服务器和 build-watch 替换期间都保持同一个开发者工具窗口；测试不调用手动编译或模拟器刷新。
- 清理阶段关闭测试项目窗口、停止 Vite 并释放锁；临时目录和日志保留以便排查。

用例失败时，脚本会输出 Vite 日志和开发者工具的错误日志。完整 Vite 日志位于上述临时目录的 `vite.log`。强制终止进程后，重跑前应确认上一次测试的 Vite 和项目窗口已关闭。

## 平台验证边界

| 目标 | 当前覆盖范围 |
| --- | --- |
| 微信（WX） | 构建检查与开发者工具 HMR 套件（含 HOC 状态保留）；不覆盖 Skyline。 |
| 支付宝（ZFB） | 构建检查；渲染和 HMR 状态保留需在支付宝开发者工具中验证。 |
| 抖音（TT） | Node 测试覆盖构建产物和模拟原生 API；渲染和 HMR 状态保留需在抖音开发者工具中验证。 |
| Web（H5） | 构建检查；浏览器交互需手动验证。 |

自动化 IDE HMR 套件仅覆盖 WX，不代表已验证支付宝、抖音或海外 TikTok 小程序兼容性。

抖音验证时使用 `interpreter` HMR，不要复制微信 Skyline 设置。异步通用分包需要基础库 **2.86.1+**；原生样式热重载需要开发者工具 **4.1.4+**、基础库 **2.98.0.0+**，并同时开启顶层 `compileHotReload` 和 `setting.autoCompile`。完整配置见[开发热更新指南](https://vpt.js.org/guides/hot-module-replacement/)。
