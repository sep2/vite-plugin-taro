import { createNativeConfig } from './bootstrap.ts'

const appMethods = ['onLaunch', 'onShow', 'onHide', 'onError', 'onUnhandledRejection', 'onPageNotFound'] as const

declare const __VITE_PLUGIN_TARO_APP_CONFIG__: Record<string, unknown>

const loadAppModule = () => import('./app-module.ts')
const appConfig = createNativeConfig('App', loadAppModule, appMethods, {
    config: __VITE_PLUGIN_TARO_APP_CONFIG__
})

App(appConfig)
