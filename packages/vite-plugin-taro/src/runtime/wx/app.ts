import './bootstrap.ts'

declare const __VITE_PLUGIN_TARO_APP_CONFIG__: Record<string, unknown>

App({
    config: __VITE_PLUGIN_TARO_APP_CONFIG__
})
