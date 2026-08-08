/**
 * The WeChat global. Free-variable reads never resolve its properties (verified: the
 * free lookup is undefined while `global.X` exists), so everything stored here must be
 * accessed as an explicit member expression.
 */
type WeChatGlobal = object

/** The App-global Rolldown dev runtime; present only in wx development builds. */
declare const __rolldown_runtime__:
    | {
          connectTaro(current: object, document: object, injectPageInstance: (...args: unknown[]) => unknown): void
          injectPageHmr(config: object, route: string): void
      }
    | undefined

// This object is available everywhere, but no globalThis, window on WeChat Mini Program
declare const global: WeChatGlobal

/** Minimal wx.request surface used by the DevRuntime; application API types remain owned by Taro/WeChat packages. */
type WeChatRequestOptions = Readonly<{
    url: string
    method: 'POST'
    data: unknown
    header: Readonly<Record<string, string>>
    timeout?: number
    success(result: unknown): void
    fail(error: unknown): void
}>

/** Native HTTP request API available in the Mini Program JavaScript environment. */
declare const wx: {
    request(options: WeChatRequestOptions): void
}

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
