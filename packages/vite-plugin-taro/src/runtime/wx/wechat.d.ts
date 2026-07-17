// biome-ignore lint/complexity/noBannedTypes: WeChat defined object
type WeChatAppServiceGlobal = {}

declare var global: WeChatAppServiceGlobal

/** Registers the native WeChat Mini Program application. */
declare function App(options: object): void

/** Registers a native WeChat Mini Program page. */
declare function Page(options: object): void

/** Registers a native WeChat Mini Program component. */
declare function Component(options: object): void
