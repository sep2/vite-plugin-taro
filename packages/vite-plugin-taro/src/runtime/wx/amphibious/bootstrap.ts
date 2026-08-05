// Install the minimal SystemJS loader and its synchronous-import extension before any native entry requests a capsule.
import '../systemjs/system-core.js'
import { transport } from './transport.ts'

declare const __VITE_PLUGIN_TARO_APP_CONFIG__: Record<string, unknown>

interface CapsuleNamespace {
    default: unknown
}

type CapsuleLoader = () => CapsuleNamespace | PromiseLike<CapsuleNamespace>

/** Shares one App configuration object between the specialized bootstrap and App capsule. */
export const appConfig = __VITE_PLUGIN_TARO_APP_CONFIG__

/** Unwraps one eager capsule without changing the complete native configuration created inside it. */
export function loadCapsuleConfig(shellName: 'App' | 'Page' | 'Component', loadCapsule: CapsuleLoader): object {
    const capsule = loadCapsule()
    if (isThenable(capsule)) {
        throw new Error(`${shellName} capsule must load synchronously`)
    }
    if (!capsule.default || typeof capsule.default !== 'object' || Array.isArray(capsule.default)) {
        throw new Error(`Expected a ${shellName} configuration`)
    }
    return capsule.default
}

/** Recognizes native and custom thenables returned by misplaced eager capsules. */
function isThenable(value: CapsuleNamespace | PromiseLike<CapsuleNamespace>): value is PromiseLike<CapsuleNamespace> {
    return 'then' in value && typeof value.then === 'function'
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
