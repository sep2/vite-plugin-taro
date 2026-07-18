import { appConfig, createNativeShell } from './bootstrap.ts'

const appMethods = ['onLaunch', 'onShow', 'onHide', 'onError', 'onUnhandledRejection', 'onPageNotFound'] as const

App(
    createNativeShell({
        moduleName: 'App',
        loadModule: () => import('./app-module.ts'),
        methods: appMethods,
        properties: { config: appConfig }
    })
)
