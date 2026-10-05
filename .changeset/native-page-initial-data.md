---
'vite-plugin-taro': minor
'vite-plugin-taro-runtime': minor
---

新增页面选项 `pages[].prerender?: boolean`，仅在设置为 `true` 时启用微信页面预渲染；省略或设为 `false` 时使用普通原生 Page 初始化，其他平台忽略该选项。App 就绪后，启用预渲染的微信 glass-easel 页面（Skyline 和 WebView）在原生 `Page({ data: () => ... })` 工厂中同步渲染，并直接返回 App/Page 初始数据。`wx.onBeforePageLoad` 仅捕获原生 query，不替换 Taro / wx 导航 API，不新增 URL 解析、导航队列或模块预加载。

首次渲染使用已有 App React root，真实 `onLoad` 复用同一个 Page 实例身份、state、节点和事件绑定。不使用 Activity、独立 root、快照缓存、专用 renderer 提交通知或定时器；不增加 `attached`，不合成、转发或重放业务生命周期。`useRouter()` 与 `useRouter(true)` 保持上游语义，不新增页面路由 Context。

冷启动时若 App 尚未就绪，不强制提交 App，保留空种子并走原有异步挂载流程。直接原生导航和 Taro 导航使用同一原生创建流程。已保留的 tab 不重复挂载，原生拒绝导航且未创建页面时不渲染 React。Suspense 的已提交 fallback 可作为初始界面；没有提交 fallback 的整体挂起页面保留空种子，等待正常挂载完成。初始 `page.cn` 由原生 Page 数据工厂返回；`onLoad` 和后续更新保留 Taro 原有的更新队列与异步 `setData`，不额外发布整棵 Page 快照。

注意：首次 React 渲染同步占用页面创建时间。refs、layout/passive effects 和 class 挂载回调可能早于真实 `onLoad` 执行；此时 `Current.router` 已初始化，而 `Current.page` 尚未绑定新页面。依赖原生实例的操作应放在真实 `useLoad` / class `onLoad` 中。

路由监听要求基础库 3.5.5+；默认模板和演示应用在 `appJson.window` 设置 `glassEaselWebview: true`（页面级可直接写入 `page.config`）；该字段不能放在 `appJson` 顶层，已有项目需同步调整，插件不改写应用或页面配置。WebView 回退要求基础库 3.8.12+。建议开发者工具使用 3.8.12 或更高版本。微信页面现在要求 `componentFramework: 'glass-easel'`，不再支持 exparser 初始化回退；其他平台保持普通初始化。`createPageConfig()` 仍只返回普通配置，`data` 保持对象，不附加初始化方法。Page 胶囊保持普通配置导出，由共享原生壳调用平台 Page 构造适配器。VPT 把组件、路由、`prerender` 选项和 `skipPrerender` 标记放入不可枚举的 `__vpt_meta`，待交接身份存入同一元数据对象的 `prerenderIdentity`，微信构造适配器在启用预渲染的 Page 数据工厂中调用 `prerenderToData(config)`；TT / 支付宝直接使用原生 `Page`。Taro 补丁仅让原有 `onLoad` 读取并清空 `__vpt_meta.prerenderIdentity`，保留其他元数据，保持原工厂签名。

微信预渲染使用对象形式的 `Page(...)` 注册，避免链式 Component API 导致开发者工具不重新执行页面脚本。glass-easel 热注册保留已挂载的原生 Page，不调用数据工厂，也不重放生命周期。共享 HMR helper 通过实例的 `groupUpdates` 能力识别 glass-easel，跳过生命周期抑制和原生快照交接；真实卸载、导航和预渲染仍正常执行。
