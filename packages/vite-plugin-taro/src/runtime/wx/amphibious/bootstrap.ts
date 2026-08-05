// Install the minimal SystemJS loader and its synchronous-import extension before any shell requests a capsule.
import '../systemjs/system-core.js'
import { loadCapsuleConfig } from '../native/load-capsule-config.ts'
import { transport } from './transport.ts'

declare const __VITE_PLUGIN_TARO_APP_CONFIG__: Record<string, unknown>

/** Shares one App configuration object between native shells and capsules. */
export const appConfig = __VITE_PLUGIN_TARO_APP_CONFIG__

type CapsuleLoader = Parameters<typeof loadCapsuleConfig>[1]

/** Activates the eager App capsule before registration and adds its shared build configuration. */
export function createAppShell(loadCapsule: CapsuleLoader) {
    return {
        ...loadCapsuleConfig('App', loadCapsule),
        config: appConfig
    }
}

/** Activates the route-specific eager Page capsule before registration and supplies Taro's initial root. */
export function createPageShell(loadCapsule: CapsuleLoader) {
    return {
        ...loadCapsuleConfig('Page', loadCapsule),
        data: {
            root: {
                cn: []
            }
        }
    }
}

/** Activates the eager recursive Component capsule and installs its configuration directly as native methods. */
export function createComponentShell(loadCapsule: CapsuleLoader) {
    return {
        properties: {
            i: Object,
            l: String
        },
        options: {
            virtualHost: true
        },
        methods: loadCapsuleConfig('Component', loadCapsule)
    }
}

// Vite wraps dynamic imports with this browser preload hook. WX has no modulepreload transport: native entry split points
// become importSync() and must have synchronous static closures, while dynamic imports inside capsules retain System.import()
// and may load asynchronous subpackage or top-level-await graphs through this identity wrapper.
export const __vitePreload = <Value>(load: () => Value): Value => load()

// SystemJS installs on WeChat's `global` object; its properties are not lexical App-service bindings.
const installedSystem = (global as unknown as WeChatAppServiceGlobal & { System: System.Loader }).System
if (!installedSystem) {
    throw new Error('SystemJS failed to initialize in the WeChat runtime')
}

// Transport returns synchronous registrations for main-package capsules and amphibious modules, and promise-like
// registrations only for capsules that physically live in generated subpackages.
installedSystem.instantiate = transport
