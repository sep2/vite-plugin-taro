import { type PluginOption, transformWithOxc } from 'vite'
import { esTarget } from '../../../utils/constant.ts'
import { memoize } from '../../../utils/memoize.ts'
import { createExactModuleIdFilter } from '../../../utils/modules.ts'
import type { MiniContract } from '../mini-contract.ts'
import { rolldownRuntimeId } from '../module/module.ts'
import type { MiniStylePlugin } from '../styles/plugins.ts'
import { createMiniDevHost, type MiniDevHost } from './dev-host.ts'
import { createMiniHmrMode } from './hmr-mode.ts'
import { hmrEndpointPath } from './hmr-protocol.ts'
import { createMiniReactRefreshTransforms } from './react-refresh.ts'

/** Selects the sole Vite environment that owns the physical Mini Program development project. */
export function isMiniClientEnvironment(environment: Readonly<{ name: string }>): boolean {
    return environment.name === 'client'
}

/**
 * Adds the serve-only bundled-development plugin set for a Mini Program target: the shared dev adapter, selected HMR mode, and React
 * Refresh adaptation transforms.
 *
 * The shared style pipeline already owns the resolver's ordered App/Page cascade policy, so the host does not reconstruct it
 * from unrelated Rolldown shell and transport entries.
 */
export function createMiniDevelopmentPlugin(
    contract: Pick<MiniContract, 'options' | 'runtime' | 'styles'>,
    styles: MiniStylePlugin
): PluginOption[] {
    // Resolve once so plugins, journal effects, entry banners, and runtime bundling cannot disagree about the active mechanism.
    const hmrMode = createMiniHmrMode(contract.options.hmr, contract.runtime.modules)

    /*
     * Vite creates this plugin descriptor before a server or DevEngine exists, then invokes configureServer and closeBundle on
     * different lifecycle stacks. This mutable handle transfers the one client-owned host between those hooks: configureServer
     * assigns it after asynchronous construction, and closeBundle reads it to drain the same engine. Environment scoping ensures
     * only the client hook pair participates. Capturing a construction Promise would start too early, while recreating the host
     * in closeBundle would lose every live action, patch, style, and client frontier owned by the running instance.
     */
    let host: MiniDevHost | null = null
    return [
        {
            name: 'vpt:mini-dev',
            apply: 'serve',
            // The physical Mini Program DevEngine is a client build. Environment scoping gives its host exactly one
            // generate/close lifecycle instead of admitting hooks from Vite's unrelated SSR environment.
            applyToEnvironment: isMiniClientEnvironment,

            config() {
                return {
                    build: {
                        // Development output is the live project opened by the native tool, not a disposable build artifact.
                        // Deleting and recreating its directory tree during a dev-server restart detaches the native watcher;
                        // recreating identical paths does not reliably reattach it. Both HMR modes depend on that watcher for
                        // complete builds and styles, while DevTools mode also uses it for JavaScript patches.
                        // Preserve watched paths and overwrite their contents. Production builds retain normal output cleanup.
                        emptyOutDir: false,
                        // Disable maps in resolved environment config as well as final output so Oxc and Babel skip producing
                        // intermediate maps that Rolldown would discard.
                        sourcemap: false
                    },
                    experimental: {
                        // Ask Vite to resolve its bundled-development graph and expose the private adapter instance. The Mini
                        // configureServer hook replaces only its startup method with the directly writing DevEngine.
                        bundledDev: true
                    },
                    server: {
                        // Source and reports share Vite's existing socket at the one generated runtime endpoint.
                        ws: { path: hmrEndpointPath }
                    }
                }
            },

            configureServer: {
                // Install after Vite and user plugins have finished configuring the environment, but before server.listen()
                // asks bundledDev to create its hard-coded skip-write DevEngine.
                order: 'post',
                async handler(server) {
                    host = await createMiniDevHost({
                        server: server,
                        contract: contract,
                        styles: styles,
                        hmrMode: hmrMode
                    })
                }
            },

            generateBundle: {
                order: 'post',
                handler(_, bundle) {
                    // The shared output plugin emits the production App wrapper during every complete build: startup and each
                    // recovery build, not just once when this plugin instance is created. Development transfers that file
                    // to the host so its only physical write happens after the matching build identity is durable.
                    removeDevelopmentAppStyle(bundle, contract.styles.appFileName)
                }
            },

            closeBundle() {
                return host?.close()
            }
        },
        {
            name: 'vpt:mini-runtime-lowering',
            apply: 'serve',
            transform: {
                order: 'post',
                // The dev-mode transform assembles the runtime chunk (Rolldown's base runtime
                // plus our injected implement) as this module's transform output, which
                // bypasses the build's es2018 lowering. Real-device engines and native upload
                // parsers predate class fields and nullish operators, so the assembled
                // runtime is lowered here — the only module that needs it. The exact id
                // filter needs no code scan and is constructed from the same authoritative Rolldown runtime ID.
                filter: { id: createExactModuleIdFilter(rolldownRuntimeId) },
                handler(code) {
                    // The `setPublicClassFields` assumption emits plain `this.x = ...`
                    // assignments instead of external helpers, whose references the later
                    // minifier would mangle.
                    return fixRolldownRuntime(code)
                }
            }
        },
        ...hmrMode.plugins,
        ...createMiniReactRefreshTransforms()
    ]
}

/**
 * Transfers development ownership of the App stylesheet from complete output to the dev host.
 *
 * The ordinary output hook emits the static production wrapper during every complete build. In development, the existing
 * physical wrapper instead contains the previous build ID. If the static asset remained in this bundle, the DevEngine would:
 *
 * 1. replace the versioned wrapper with static production bytes while JavaScript and HMR metadata are still being finalized;
 * 2. let DevTools observe that root-style change and reload the App against the previous build identity;
 * 3. let the host replace the wrapper again with the new build ID, causing a second App reload.
 *
 * Deleting only the in-memory bundle entry avoids both premature writes. Development sets `emptyOutDir: false`, so the prior
 * physical App stylesheet remains available while complete output is written. The host replaces it exactly once after the
 * selected mode has reset and the matching `hmr/info.js` identity is durable. Incremental HMR never enters this complete-output
 * hook and changes only the imported global stylesheet; rewriting the App root would reload the heap while a JavaScript patch is
 * awaiting acknowledgement. The serve-only plugin leaves production output unchanged.
 */
export function removeDevelopmentAppStyle(bundle: Record<string, unknown>, appStyleFileName: string): void {
    delete bundle[appStyleFileName]
}

/*
 * memoize owns a mutable one-entry-by-input cache. The assembled runtime source is byte-identical across complete generations
 * because both the Rolldown base and injected implementation are immutable for the server lifetime. Reusing its lowered result
 * avoids repeating the only large Oxc transform on every rebuild; keying by source still invalidates correctly if a future Vite
 * generation changes the runtime, unlike a module-global cached string detached from its actual input.
 */
const fixRolldownRuntime = memoize((code: string) => {
    return transformWithOxc(code, rolldownRuntimeId, {
        lang: 'js',
        target: esTarget,
        sourcemap: false,
        assumptions: { setPublicClassFields: true }
    })
})
