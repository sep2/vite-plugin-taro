# 渲染性能基准测试

参考 [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) 的 keyed 列表测试方案，将同一份 React 应用分别构建为 DOM（`renderer: 'dom'`）和 setData（`renderer: 'template'`）模式，在**微信开发者工具**中进行对比。

## 运行

以下命令均在仓库根目录执行。

1. 执行 `pnpm install` 安装工作区依赖。
2. 将 `demo/benchmark-demo/.env.example` 复制为 `demo/benchmark-demo/.env.local`，填写当前开发者工具登录账号有权限使用的微信 AppID。自动化 CLI 需要已授权的 AppID。
3. 安装并打开微信开发者工具，确保 `wechatide` 位于 PATH 中，并授权 `pi` 客户端。本测试使用 skill API 0.3.10。
4. 在 macOS 上，将 `WECHAT_DEVTOOLS_VERSION` 设为开发者工具「关于」页面中的版本号，然后执行：

    ```bash
    WECHAT_DEVTOOLS_VERSION="<版本号>" pnpm --filter benchmark-demo benchmark
    ```

5. 测试期间保持机器空闲、开发者工具可见。脚本会构建两种模式，依次打开项目窗口，并在 `finally` 中关闭各窗口。

单独构建：

```bash
pnpm build:benchmark-demo:dom
pnpm build:benchmark-demo:template
```

在开发者工具中打开 `dist/dom` 或 `dist/template`，即可手动操作测试页面。点击行标签选中该行，点击 × 删除该行。

类型检查与测试：

```bash
pnpm typecheck:benchmark-demo
pnpm test:benchmark-demo
```

## 测试场景

共 10 项：创建 1,000 行、替换 1,000 行、更新每第 10 行的标签、选中一行、交换第 2 行与第 999 行、删除一行、追加 1,000 行、清空 1,000 行、创建 10,000 行、清空 10,000 行。

两种模式使用相同的确定性标签、递增 ID、稳定的 React key、记忆化行组件及稳定的选中/删除回调。列表完整渲染，不使用虚拟列表或应用层命令式 DOM 更新。

## 计时口径

- 两组均使用生产版 React、相同的 VPT/Taro 运行时、WebView、glass-easel、CSS，以及固定的 SDK 3.15.2，仅 VPT 的 `renderer` 配置不同。setData 基线使用 VPT 内的 Taro 模板树和 setData 更新机制，并非单独编译的上游 Taro 应用。
- 共享控制器在执行测试场景的 reducer 和状态更新前开始计时。React 提交后，两组均调用 `wx.nextTick`，再执行相同的 `wx.createSelectorQuery().select(selector).fields({ id: true, rect: true, size: true }, callback).exec()`，其中 `selector = '>>> #benchmark-state-' + revision`。查询回调返回当前版本标记的原生几何信息时停止计时。
- 主指标是**事件处理函数开始执行到原生版本/布局查询返回的耗时**，包含数据生成、React 协调、渲染后端更新、SDK 调度及原生查询桥接开销。该指标描述本次开发者工具环境中的任务耗时；设备实际呈现时间和 CPU 开销需要单独测量。
- 每个样本还记录「开始执行到 React 提交」及「React 提交到共同查询回调」两个阶段的耗时，两者之和为主指标。两组执行相同的计时代码和 SDK 调用。
- 计时内的查询确认版本标记 ID 正确且高度为正；完整列表的 key 顺序、行数、行高和选中状态在计时结束后验证。单元测试覆盖标签更新、不可变数据身份、交换位置、操作语义、行组件渲染跳过、回调引用稳定性，以及两组一致的查询字段和回调计时边界。
- 脚本确认页面使用 WebView，并根据页面数据区分 DOM 渲染后端与 setData 模式，防止 DOM 静默回退导致对比失效。
- 每次操作通过本机 HTTP 握手启动，确保自动化启动命令已返回后再执行任务。SDK 直接向脚本报告完成结果，渲染期间不依赖自动化状态轮询；启动握手、结果传输和完整列表验证均在计时范围外。

## 采样与统计

- 按 **DOM → setData** 的顺序测试。每项场景、每种渲染器采集 5 个实测样本，10 项合计 **100 个实测样本**。
- 每项场景、每个测试批次使用独立的开发者工具项目窗口；每个 SDK 上下文先预热 2 次，预热结果单独标记，不计入统计。
- 所有已完成的实测样本均参与统计，包括发生中断的会话中已完成的样本，不剔除离群值。中断信息会保存；新上下文先预热 2 次，再补齐剩余样本。
- 各项结果包含中位数、最近秩法 p95 和最小/最大值。偶数个样本的中位数取中间两项的均值；p95 取升序排列后第 `ceil(0.95 × n)` 个样本。
- 单项性能比为 setData 耗时中位数除以 DOM 耗时中位数；总体性能比为各项比值的不加权几何平均。

## 结果与复现

`results/wechat-devtools.json` 保存完整结果，文档首页直接读取该文件。格式版本为 v3，包含原始样本及预热标记、阶段耗时、逐次原生校验、统计汇总、SDK/工具链/依赖版本、会话与中断记录、源码及构建产物的 SHA-256 指纹，以及测量口径和适用范围。

每次运行的观测记录、截图和检查点保存在 Git 忽略的 `tmp/run-*/` 下。运行失败时保留检查点，已发布的结果文件保持不变。使用以下命令继续采集：

```bash
BENCHMARK_RESUME="<已有 tmp/run-* 目录的绝对路径>" \
WECHAT_DEVTOOLS_VERSION="<版本号>" \
pnpm --filter benchmark-demo benchmark
```

恢复时会校验构建产物、应用及运行时源码、开发者工具版本和依赖版本是否一致。已完成样本会保留，中断详情随结果保存；新上下文预热后继续补齐。完成整轮测试后更新结果 JSON，并重新构建文档，即可让所有图表使用同一份测量记录。

首页的「最快」限定于本测试场景和开发者工具环境中的两种渲染模式对比。首页展示其中 6 项场景的图表，并链接到本基准测试。
