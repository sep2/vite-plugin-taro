import { vptGlobal } from '\0vpt:global-binding'

// This file must not have any raw reference to the `globalThis` free binding.
// biome-ignore lint/suspicious/noShadowRestrictedNames: intentional shadow
const globalThis = vptGlobal

// Install the selected polyfills before the runtime or application uses them.
// @ts-expect-error: The Mini build resolves this private polyfills entry.
import '\0vpt:mini-polyfills'

import { transport } from '\0vpt:mini-transport'

// Install the minimal SystemJS loader and its synchronous-import extension before any native entry requests a capsule.
import { System as createdSystem } from '../systemjs/system-core.js'

// install the System on globalThis
globalThis.System = createdSystem

// Publish the installed loader as an explicit native dependency; callers need no ambient globalThis binding.
export const System = createdSystem

// Transport returns synchronous registrations for main-package capsules and amphibious modules, and promise-like
// registrations only for capsules that physically live in generated subpackages.
System.instantiate = transport

// Mini Program hosts have no modulepreload transport. Application import() boundaries retain System.import() and may load
// asynchronous subpackage or top-level-await graphs through this identity wrapper.
export const __vitePreload = <Value>(load: () => Value): Value => load()
