/*
 * DevTools adapter injected into the App-global Rolldown runtime chunk. Every Page evaluates the inert `hmr/patches.js` payload
 * before its route capsule, while this singleton survives Page JavaScript hot reload in the App heap. That lifetime difference is
 * what allows module and React state to survive repeated native Page registration.
 */

import { type RuntimePatch, WxHmrRuntime } from '../../wx-hmr-runtime.ts'
import { injectPageHmr as injectDevtoolsPageHmr } from './page-hmr.ts'

/**
 * One physical DevTools patch. DevTools compiles `factory` as native project JavaScript; invoking it registers updated Rolldown
 * factories but does not execute application modules, allowing the shared runtime to install a complete batch before one render.
 */
type DevtoolsPatch = RuntimePatch & {
    readonly factory: () => void
}

type HmrPageConfig = Parameters<typeof injectDevtoolsPageHmr>[0]

/** Adapts physical DevTools patch modules and Page replacement onto the shared WX HMR runtime. */
class DevtoolsHmrRuntime extends WxHmrRuntime {
    /** Applies one Page-delivered payload before the native shell imports its route capsule. */
    applyPatches(payload: Readonly<{ buildId: string; patches: readonly DevtoolsPatch[] }> | undefined): void {
        // The initial physical dependency exports undefined until the host has a patch range. Once present, apply synchronously:
        // imports below the Page banner must resolve against the new registry during this same native Page evaluation.
        if (!payload) return

        this.applyPatchPayload(payload, installDevtoolsPatch)
    }

    /** Preserves the mounted Page connection while DevTools re-registers its static config. */
    injectPageHmr(config: HmrPageConfig): HmrPageConfig {
        return injectDevtoolsPageHmr(config)
    }
}

/** Executes only the native registration program; graph application remains owned by `WxHmrRuntime`. */
function installDevtoolsPatch(patch: DevtoolsPatch): void {
    patch.factory()
}

// Generated modules already address this App-global name. Install exactly one adapter with the runtime chunk rather than one per
// Page, because Page hot reload re-evaluates shells while the App heap and its module registry remain alive.
const runtime = new DevtoolsHmrRuntime()
;(globalThis as { __rolldown_runtime__?: DevtoolsHmrRuntime }).__rolldown_runtime__ = runtime
