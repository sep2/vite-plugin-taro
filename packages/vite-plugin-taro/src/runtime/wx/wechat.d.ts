/**
 * The WeChat global. Free-variable reads never resolve its properties (verified: the
 * free lookup is undefined while `global.X` exists), so everything stored here must be
 * accessed as an explicit member expression.
 */
type WeChatGlobal = object

/** The App-global Rolldown dev runtime; present only in wx development builds. */
declare const __rolldown_runtime__:
    | {
          injectPageHmr(config: object): object
      }
    | undefined

// This object is available everywhere, but no globalThis, window on WeChat Mini Program
declare const global: WeChatGlobal

/** Minimal wx.request result used by the development runtime; application API types remain owned by Taro/WeChat packages. */
type WeChatRequestResult<Result> = Readonly<{
    statusCode: number
    data: Result
}>

/** Minimal POST surface used by HMR reports. */
type WeChatRequestOptions<Result> = Readonly<{
    url: string
    method: 'POST'
    data?: unknown
    header?: Readonly<Record<string, string>>
    success(result: WeChatRequestResult<Result>): void
    fail(error: unknown): void
}>

/** Minimal SocketTask surface used by interpreter HMR. */
type WeChatSocketTask = Readonly<{
    send(options: Readonly<{ data: string | ArrayBuffer; fail?: (error: unknown) => void }>): void
    close(options: Readonly<{ code: number; reason: string }>): void
    onOpen(listener: () => void): void
    onMessage(listener: (result: Readonly<{ data: string | ArrayBuffer }>) => void): void
    onClose(listener: (result: Readonly<{ code: number; reason: string }>) => void): void
    onError(listener: (error: unknown) => void): void
}>

type WeChatConnectSocketOptions = Readonly<{
    url: string
    protocols: readonly string[]
    fail?: (error: unknown) => void
}>

/** Native network APIs available in the Mini Program JavaScript environment. */
declare const wx: {
    request<Result>(options: WeChatRequestOptions<Result>): void
    connectSocket(options: WeChatConnectSocketOptions): WeChatSocketTask
}

/** Native Page surface used by the singleton App-data scheduler. */
type WeChatPage = {
    setData(data: Readonly<Record<string, unknown>>, callback?: () => void): void
}

/** Returns every mounted native Page in stack order. */
declare function getCurrentPages(): WeChatPage[]

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
