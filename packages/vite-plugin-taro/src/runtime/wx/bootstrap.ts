// Install the stock minimal SystemJS loader before any native shell can request an application capsule.
import 'systemjs/s.js'
import { createNativeShell } from './native-shell.ts'
import { transport } from './transport.ts'

declare const __VITE_PLUGIN_TARO_APP_CONFIG__: Record<string, unknown>

/** Shares one App configuration object between native shells and application capsules. */
export const appConfig = __VITE_PLUGIN_TARO_APP_CONFIG__

type NativeModuleLoader = () => Promise<{ default: unknown }>

const appMethods = ['onLaunch', 'onShow', 'onHide', 'onError', 'onUnhandledRejection', 'onPageNotFound'] as const

const pageMethods = [
    'onLoad',
    'onUnload',
    'onReady',
    'onShow',
    'onHide',
    'onPullDownRefresh',
    'onReachBottom',
    'onPageScroll',
    'onResize',
    'onTabItemTap',
    'onTitleClick',
    'onOptionMenuClick',
    'onKeyboardHeight',
    'onPopMenuClick',
    'onPullIntercept',
    'onAddToFavorites',
    'onSaveExitState',
    'eh'
] as const

const componentMethods = ['eh'] as const

/** Creates the synchronous native App shell. */
export function createAppShell(loadModule: NativeModuleLoader) {
    return createNativeShell({
        moduleName: 'App',
        loadModule,
        methods: appMethods,
        properties: { config: appConfig }
    })
}

/** Creates the synchronous native Page shell. */
export function createPageShell(loadModule: NativeModuleLoader) {
    return createNativeShell({
        moduleName: 'Page',
        loadModule,
        methods: pageMethods,
        properties: {
            data: {
                root: {
                    cn: []
                }
            }
        }
    })
}

/** Creates the synchronous native recursive Component shell. */
export function createComponentShell(loadModule: NativeModuleLoader) {
    const methods = createNativeShell({
        moduleName: 'Component',
        loadModule,
        methods: componentMethods,
        properties: {}
    })

    return {
        properties: {
            i: Object,
            l: String
        },
        options: {
            virtualHost: true
        },
        methods
    }
}

// Vite wraps dynamic imports with this browser preload hook. WX has no modulepreload transport, so native chunks call
// the loader directly; application capsules receive this same cached export through bootstrap's native registration.
export const __vitePreload = <Value>(load: () => Value): Value => load()

// SystemJS installs on WeChat's `global` object; its properties are not lexical App-service bindings.
const installedSystem = (global as unknown as WeChatAppServiceGlobal & { System: System.Loader }).System
if (!installedSystem) {
    throw new Error('SystemJS failed to initialize in the WeChat runtime')
}

// Transport returns synchronous registrations for main-package capsules and amphibious modules, and promise-like
// registrations only for capsules that physically live in generated subpackages.
/** Loads one amphibious module or application capsule from the materialized transport table. */
installedSystem.instantiate = (moduleId: string): System.Registration | PromiseLike<System.Registration> => {
    const load = transport[moduleId]
    if (!load) {
        throw new Error(`Unknown System module: ${moduleId}`)
    }
    return load()
}
