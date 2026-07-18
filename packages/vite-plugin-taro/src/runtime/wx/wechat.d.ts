// biome-ignore lint/complexity/noBannedTypes: WeChat defined object
type WeChatAppServiceGlobal = {}

// This object is available everywhere, but no globalThis, window on WeChat Mini Program
declare var global: WeChatAppServiceGlobal

/** Registers the native WeChat Mini Program application. */
declare function App(options: object): void

/** Registers a native WeChat Mini Program page. */
declare function Page(options: object): void

/** Registers a native WeChat Mini Program component. */
declare function Component(options: object): void

/**
 * Returns the native WeChat Mini Program application instance.
 * Only available after App() is called.
 * https://developers.weixin.qq.com/miniprogram/dev/reference/api/getApp.html
 */
declare function getApp(options: object): { globalData: unknown }
