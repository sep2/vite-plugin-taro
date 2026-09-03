// Install the minimal SystemJS loader and its synchronous-import extension before any native entry requests a capsule.
import '../systemjs/system-core.js'
import { transport } from './transport.ts'

// Mini Program hosts have no modulepreload transport. Application import() boundaries retain System.import() and may load
// asynchronous subpackage or top-level-await graphs through this identity wrapper.
export const __vitePreload = <Value>(load: () => Value): Value => load()

// SystemJS installs on the App-wide JavaScript global; its properties are not lexical bindings.
const installedSystem = global.System
if (!installedSystem) {
    throw new Error('SystemJS failed to initialize in the WeChat runtime')
}

// Transport returns synchronous registrations for main-package capsules and amphibious modules, and promise-like
// registrations only for capsules that physically live in generated subpackages.
installedSystem.instantiate = transport
