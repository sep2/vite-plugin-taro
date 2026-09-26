import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizePath, type PluginOption, transformWithOxc } from 'vite'
import { cleanOutputFiles } from '../../../utils/clean-output-files.ts'
import { esTarget } from '../../../utils/constant.ts'
import { memoize } from '../../../utils/memoize.ts'
import { createExactModuleIdFilter } from '../../../utils/modules.ts'
import type { MiniContract } from '../mini-contract.ts'
import { miniPageCapsuleId, pageComponentId, rolldownRuntimeId } from '../module/module.ts'
import type { MiniStylePlugin } from '../styles/plugins.ts'
import { createMiniDevHost, type MiniDevHost } from './dev-host.ts'
import { createMiniHmrMode } from './hmr-mode.ts'
import { hmrEndpointPath } from './hmr-protocol.ts'
import { injectDevPageComponent } from './inject-dev-page-component.ts'
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
 * from unrelated Rolldown shell and bootstrap entries.
 */
export function createMiniDevelopmentPlugin(contract: MiniContract, styles: MiniStylePlugin): PluginOption[] {
    // Resolve once so plugins, journal effects, entry banners, and runtime bundling cannot disagree about the active mechanism.
    const hmrMode = createMiniHmrMode(contract.options.hmr, contract.runtime)

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
                    // React's development-only Suspense diagnostics call this browser API without guards.
                    define: { 'performance.now': 'Date.now' },
                    build: {
                        // The development cleaner owns startup cleanup so it can retain watched directories and the two
                        // DevTools project-config files. Recovery builds must also retain cached, unchanged output.
                        // Production builds retain normal Vite output cleanup.
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
                        // Patch source and reports share Vite's existing socket; rebuild mode does not connect to it.
                        ws: { path: hmrEndpointPath }
                    }
                }
            },

            configureServer: {
                // Install after Vite and user plugins have finished configuring the environment, but before server.listen()
                // asks bundledDev to create its hard-coded skip-write DevEngine.
                order: 'post',
                async handler(server) {
                    // Clean once per server before creating its engine, but never remove DevTools' project identity and
                    // private compile settings. Deleting these two files during a restart let the replacement App launch
                    // and report startup, yet later patch writes no longer updated its rendered Page. Preserving only these
                    // files fixes that failure while still removing obsolete output; the restart regression delays the
                    // replacement build by three seconds and then verifies two state-retaining rendered updates.
                    // Later recovery builds do not clean because cached unchanged companions may not be emitted again.
                    cleanOutputFiles(path.resolve(server.config.root, server.config.build.outDir), [
                        contract.output.projectConfigFilename,
                        contract.output.projectPrivateConfigFilename
                    ])

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
                async handler(_, bundle) {
                    // The shared output plugin emits the production App wrapper during every complete build: startup and each
                    // recovery build, not just once when this plugin instance is created. Development transfers that file
                    // to the host so its only physical write happens after the complete output and matching mode state are durable.
                    removeDevelopmentAppStyle(bundle, contract.styles.appFileName)

                    await emitMiniPublicAssets(this)
                }
            },

            closeBundle() {
                return host?.close()
            }
        },
        // Only serve rewrites the Page capsule: production must pass PageComponent directly to createPageConfig(),
        // while a late-opened dev Page must select its installed HMR factory before Taro captures the original export.
        {
            name: 'vpt:mini-page-capsule-hmr',
            apply: 'serve',
            transform: {
                order: 'pre',
                filter: { id: createExactModuleIdFilter(miniPageCapsuleId) },
                async handler(capsuleCode, capsuleId) {
                    // The capsule ID carries the route, so Vite resolves its actual Page import here. Reconstructing a path
                    // from the route would drift from the resolver if the source layout or extension changes.
                    const component = await this.resolve(pageComponentId, capsuleId)
                    if (!component) {
                        throw new Error(`Failed to resolve Page component imported by ${capsuleId}`)
                    }

                    // Vite returns an absolute source ID; Rolldown's installed factories use root-relative, POSIX IDs.
                    // Passing the absolute path (or Windows separators) makes hasFactory miss and first mount stays stale.
                    const componentId = normalizePath(path.relative(this.environment.config.root, component.id))

                    return injectDevPageComponent({ capsuleCode, componentId, capsuleId })
                }
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
 * physical wrapper instead contains the previous complete-build marker. If the static asset remained in this bundle, the
 * DevEngine would:
 *
 * 1. replace the versioned wrapper with static production bytes while JavaScript and HMR metadata are still being finalized;
 * 2. let the native tool observe that root-style change and reload the App against the previous patch identity, or before a
 *    rebuild-mode transaction has completed;
 * 3. let the host replace the wrapper again with the new marker, causing a second App reload.
 *
 * Deleting the in-memory bundle entry avoids both premature writes. Startup cleanup retains DevTools project configuration
 * but removes the prior physical App stylesheet; recovery builds do not clean. The host publishes the stylesheet once afterward.
 * Patch modes first reset delivery and publish matching `hmr/info.js`; rebuild mode has no patch state and writes a fresh marker
 * directly. Incremental HMR never enters this complete-output hook and changes only the imported global stylesheet; rewriting
 * the App root would reload the runtime while a JavaScript patch is awaiting acknowledgement. The serve-only plugin leaves
 * production output unchanged.
 */
export function removeDevelopmentAppStyle(bundle: Record<string, unknown>, appStyleFileName: string): void {
    delete bundle[appStyleFileName]
}

/** The Mini DevEngine writes Rolldown output directly, bypassing Vite's normal build-time publicDir copy. */
async function emitMiniPublicAssets(context: {
    environment: { config: { publicDir: string; build: { copyPublicDir: boolean } } }
    emitFile: (asset: { type: 'asset'; fileName: string; source: Uint8Array }) => string
}): Promise<void> {
    const { publicDir, build } = context.environment.config
    if (!build.copyPublicDir || !publicDir || !existsSync(publicDir)) {
        return
    }

    for (const entry of await readdir(publicDir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) {
            continue
        }
        const file = path.join(entry.parentPath, entry.name)
        context.emitFile({
            type: 'asset',
            fileName: normalizePath(path.relative(publicDir, file)),
            source: await readFile(file)
        })
    }
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
