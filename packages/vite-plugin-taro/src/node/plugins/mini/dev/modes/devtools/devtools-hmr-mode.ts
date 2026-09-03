import path from 'node:path'
import type { Plugin } from 'vite'
import { createExactModuleIdFilter } from '../../../../../utils/modules.ts'
import type { RuntimeModulesContract } from '../../../mini-contract.ts'
import { appShellFileName } from '../../../module/module.ts'
import { hmrInfoFileName } from '../../hmr-files.ts'
import type { MiniHmrMode } from '../../hmr-mode.ts'
import type { PatchUpdate } from '../../hmr-protocol.ts'

export const devtoolsPatchesFileName = 'hmr/patches.js'

/**
 * Collects behavior that depends on native development-tool project-file compilation.
 *
 * Runtime entry, Page transform, entry banners, and patch delivery stay in one descriptor because they implement one protocol:
 * DevTools observes a changed Page dependency, re-executes the Page shell, and that shell synchronously gives the cumulative
 * native factory payload to the persistent App runtime. Mixing any one of these pieces with another mode would break that chain.
 */
export function createDevtoolsHmrMode(modules: RuntimeModulesContract): MiniHmrMode {
    return {
        runtimeFile: modules.devtoolsHmrRuntime,
        plugins: [createDevtoolsPagePlugin(modules.pageShell)],
        createEntryBanner: createDevtoolsEntryBanner,
        // Every Page requires this path from its first complete build. Exporting undefined keeps that dependency valid while
        // making initial Page evaluation a no-op in the runtime adapter until a real cumulative patch suffix exists.
        reset: () => ({
            kind: 'write',
            fileName: devtoolsPatchesFileName,
            source: renderInitialDevtoolsPatches()
        }),
        // Later publications always replace the same watched path. The journal supplies the entire unacknowledged suffix so a
        // coalesced or missed DevTools file event cannot strand the App runtime between two Rolldown generations.
        publish: (publication) => ({
            kind: 'write',
            fileName: devtoolsPatchesFileName,
            source: renderDevtoolsPatches(publication.buildId, publication.patches)
        })
    }
}

/** Provides a valid, inert CommonJS dependency before the host has a patch range to publish. */
export function renderInitialDevtoolsPatches(): string {
    return 'module.exports = undefined;\n'
}

/**
 * Renders the cumulative patch suffix as inert CommonJS data.
 *
 * DevTools re-executes a live Page because this physical dependency changed. The Page banner passes the exported payload to the
 * persistent App runtime before importing its capsule. Keeping the module inert—rather than applying factories at top level—
 * makes that ordering explicit, lets the runtime reject stale build IDs, and makes replay by several live Pages safe.
 */
export function renderDevtoolsPatches(buildId: string, patches: readonly PatchUpdate[]): string {
    if (patches.length === 0) {
        throw new Error('Cannot render an empty Mini Program patch range.')
    }

    const rendered = patches.map(
        (patch) =>
            `{seq: ${patch.seq}, changedIds: ${JSON.stringify(patch.changedIds)}, factory: () => {\n${patch.code}\n}}`
    )

    return `module.exports = {buildId: ${JSON.stringify(buildId)}, patches: [${rendered.join(',')}]};\n`
}

/**
 * Prepends physical CommonJS edges after Rolldown graph analysis.
 *
 * App initialization reads the build identity once into its persistent heap. Every Page reads the stable patch path immediately
 * before its capsule, so DevTools classifies a replacement as Page JavaScript hot reload instead of an App restart. Injecting
 * these requires as source imports would incorrectly pull host-only files into Rolldown's application chunk graph.
 */
function createDevtoolsEntryBanner(pageFiles: ReadonlySet<string>) {
    return (chunk: Readonly<{ name: string; fileName: string }>): string => {
        if (chunk.name === appShellFileName) {
            return `__rolldown_runtime__.initialize(require('./${hmrInfoFileName}'));\n`
        }
        if (pageFiles.has(chunk.name)) {
            const patchesPath = path.posix.relative(path.posix.dirname(chunk.fileName), devtoolsPatchesFileName)
            return `__rolldown_runtime__.applyPatches(require('${patchesPath}'));\n`
        }
        return ''
    }
}

/** Transforms only the contracted native Page shell identity. */
function createDevtoolsPagePlugin(pageShell: string): Plugin {
    const pageShellFilter = createExactModuleIdFilter(pageShell)

    return {
        name: 'vpt:mini-page-shell-hmr',
        apply: 'serve',
        transform: {
            order: 'post',
            filter: { id: pageShellFilter },
            handler(code) {
                return injectPageShellHmr(code)
            }
        }
    }
}

/**
 * Injects Page handoff at the exact native registration edge rather than wrapping arbitrary user `Page` calls.
 *
 * The native shell has one stable `Page(pageConfig)` contract. Failing when that contract changes is intentional: silently
 * skipping this transform would let DevTools unload the live Taro Page and destroy React state while appearing to support HMR.
 */
export function injectPageShellHmr(code: string): { code: string; map: null } {
    const registration = 'Page(pageConfig)'
    if (!code.includes(registration)) {
        throw new Error('Mini Program Page shell must register pageConfig')
    }

    return {
        code: code.replace(registration, 'Page(__rolldown_runtime__.injectPageHmr(pageConfig))'),
        map: null
    }
}
