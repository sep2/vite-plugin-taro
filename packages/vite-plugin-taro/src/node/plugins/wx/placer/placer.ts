import { normalizePath, type Plugin, type Rolldown } from 'vite'
import { getWxExecutionKind, isTransportModule } from '../module/module.ts'
import { getNativeComponentAssetBytes } from '../native/native-component-assets.ts'
import { createPlacement, type GeneratedSubpackage, type PackageLocation, type Placement } from './placement.ts'

export type { GeneratedSubpackage, Placement } from './placement.ts'

const pnpmFrameworkPackagePattern = /\/node_modules\/\.pnpm\/(?:@tarojs\+|react(?:-dom|-reconciler)?@|scheduler@)/
const workspaceFrameworkPackagePattern = /\/packages\/(?:taro-react|taro-plugin-framework-react)\//

/** Selects the explicit React/Taro roots whose complete dependency closure forms the framework vendor chunk. */
export function isWxFrameworkVendorModule(moduleId: string): boolean {
    const normalizedId = normalizePath(moduleId)
    return pnpmFrameworkPackagePattern.test(normalizedId) || workspaceFrameworkPackagePattern.test(normalizedId)
}

type PlacementState =
    | { phase: 'idle' }
    | { phase: 'awaiting-chunks' }
    | { phase: 'planned'; placement: Placement }
    | { phase: 'finalized'; placement: Placement; subpackages: readonly GeneratedSubpackage[] }

/** Placement services consumed by the later `vpt:wx` rendering and output hooks. */
export type WxPlacementPlugin = Plugin &
    Readonly<{
        getPackageLocation(chunk: Rolldown.RenderedChunk | Rolldown.OutputChunk): PackageLocation
        getPhysicalChunkId(chunk: Rolldown.RenderedChunk): string
        getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async'
        getSubpackages(): readonly GeneratedSubpackage[]
    }>

/**
 * Rolldown options owned by WX placement. Every field enforces a distinct output invariant. The plugin returns this object
 * from its config hook, while direct Rolldown integration tests reuse the same value to exercise the identical lifecycle.
 */
export const placementRolldownOptions = {
    /**
     * Output-stage naming remains under Rolldown's ownership. These options establish physical candidates and hash
     * participation only; LTHP mutates the resulting OutputChunk filenames later without replacing the chunks.
     */
    output: {
        /**
         * React and Taro form one stable framework boundary shared by the App and every Page capsule. Keeping their complete
         * dependency closure together prevents application edits from invalidating framework chunk identity and makes later
         * development generations eligible to reuse the unchanged vendor. All remaining modules use Rolldown's automatic
         * chunking; physical WX package placement operates on those final chunks without imposing another split strategy.
         */
        codeSplitting: {
            groups: [
                {
                    name: 'vendor',
                    test: isWxFrameworkVendorModule,
                    priority: 100,
                    includeDependenciesRecursively: true
                }
            ]
        },
        /**
         * Native App/Page/Component shells are files addressed directly by WeChat and must retain the exact names configured
         * in `input`, such as `app.js` and `pages/home/index.js`. Transport is excluded even though it is CommonJS:
         * application chunks import its content-hashed path, so it belongs with hashed runtime/capsule entries. `[hash]`
         * remains a Rolldown placeholder here and is resolved only after renderChunk transforms finish.
         */
        entryFileNames(chunk: Rolldown.PreRenderedChunk): string {
            return getWxExecutionKind(chunk) === 'native' && !isTransportModule(chunk)
                ? '[name]'
                : 'assets/[name]-[hash].js'
        },
        /**
         * Leaves chunk identity and collision handling entirely to Rolldown. This package-neutral physical pattern deliberately
         * contains no LTHP owner; generateBundle adds only the selected package root to the existing Rolldown filename.
         */
        chunkFileNames: 'assets/[name]-[hash].js',
        /**
         * Emits generic Rolldown assets under one collision-resistant hashed namespace. Native-component folders are not
         * governed by this option: createNativeComponentOutput preserves their required relative filenames and relocates the
         * complete folder beside its owning JavaScript chunk after LTHP finalization.
         */
        assetFileNames: 'assets/[name]-[hash][extname]'
    },
    /**
     * Keeps every native entry's required exports while allowing Rolldown to add cross-chunk bindings created by natural code
     * splitting. `strict` can reject those extensions; `exports-only` can merge away native boundaries; `allow-extension`
     * preserves the shell/capsule contract without forcing source-module placement groups.
     */
    preserveEntrySignatures: 'allow-extension' as const
}

/**
 * Creates the `vpt:wx-placer` lifecycle owner:
 *
 * 1. Its config hook installs package-neutral Rolldown names and entry-signature semantics.
 * 2. `renderStart` atomically starts a generation in `awaiting-chunks`; no stale placement remains reachable.
 * 3. Its first pre-order `renderChunk` creates one immutable LTHP placement from the complete tree-shaken graph.
 * 4. `vpt:wx` asks this plugin only for package ownership, physical relocation, and native loading mode.
 * 5. Its pre-order `generateBundle` assigns each OutputChunk its package-qualified filename and publishes app.json declarations.
 *
 * The discriminated state is the only generation-local mutation: `idle → awaiting-chunks → planned → finalized`. Each hook
 * performs one whole-state transition, so stale graph state, duplicate planning, and partially reset generations are
 * unrepresentable.
 */
export function createWxPlacementPlugin(): WxPlacementPlugin {
    // This one mutable cell is the output-generation state machine described above; hooks replace it atomically by phase.
    let state: PlacementState = { phase: 'idle' }

    function requirePlacement(): Placement {
        if (state.phase === 'idle' || state.phase === 'awaiting-chunks') {
            throw new Error('wx placement is unavailable before Rolldown exposes the final chunk graph')
        }
        return state.placement
    }

    return {
        name: 'vpt:wx-placer',

        config() {
            return {
                build: {
                    rolldownOptions: placementRolldownOptions
                }
            }
        },

        renderStart() {
            state = { phase: 'awaiting-chunks' }
        },

        renderChunk: {
            order: 'pre',
            handler(_code, _chunk, _outputOptions, meta) {
                if (state.phase === 'planned') {
                    return
                }
                if (state.phase !== 'awaiting-chunks') {
                    throw new Error(`wx placement received final chunks during the ${state.phase} phase`)
                }
                state = {
                    phase: 'planned',
                    placement: createPlacement({
                        chunks: meta.chunks,
                        getAdditionalModuleBytes: (moduleId) =>
                            getNativeComponentAssetBytes(this.getModuleInfo(moduleId)?.meta)
                    })
                }
            }
        },

        generateBundle: {
            order: 'pre',
            handler(_outputOptions, bundle) {
                const placement = requirePlacement()
                state = {
                    phase: 'finalized',
                    placement: placement,
                    subpackages: placement.finalize(bundle)
                }
            }
        },

        getPackageLocation(chunk: Rolldown.RenderedChunk | Rolldown.OutputChunk): PackageLocation {
            return requirePlacement().getPackageLocation(chunk)
        },

        getPhysicalChunkId(chunk: Rolldown.RenderedChunk): string {
            return requirePlacement().getPhysicalChunkId(chunk)
        },

        getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async' {
            return requirePlacement().getLoadMode(chunk)
        },

        getSubpackages(): readonly GeneratedSubpackage[] {
            if (state.phase !== 'finalized') {
                throw new Error('wx subpackages are unavailable before output finalization')
            }
            return state.subpackages
        }
    }
}
