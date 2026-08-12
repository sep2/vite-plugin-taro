import type { Plugin, Rolldown } from 'vite'
import { getWxExecutionKind, isTransportModule } from '../module.ts'
import { getNativeComponentAssetBytes } from '../native/native-component-assets.ts'
import createPlacementPlan, { getSubpackageName, type PackageLocation } from './plan.ts'

/** Native app.json declaration for one generated code-only subpackage. */
export type GeneratedSubpackage = {
    /** Stable native alias derived from the generated root hash. */
    name: string
    /** Physical directory containing this subpackage's emitted capsules. */
    root: string
    /** Marks this as a code-only subpackage with no native Page routes. */
    pages: readonly []
}

export type Placement = Readonly<{
    getPackageLocation(chunk: Rolldown.RenderedChunk | Rolldown.OutputChunk): PackageLocation
    getPhysicalChunkId(chunk: Rolldown.RenderedChunk): string
    getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async'
    finalize(bundle: Rolldown.OutputBundle): readonly GeneratedSubpackage[]
}>

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
 * 2. `renderStart` atomically starts a generation in `awaiting-chunks`; no stale plan remains reachable.
 * 3. Its pre-order `renderChunk` sees the complete tree-shaken graph, creates one immutable LTHP placement, and changes the
 *    generation to `planned` before `vpt:wx` renders transport.
 * 4. `vpt:wx` asks this plugin only for package ownership, physical relocation, and the resulting native loading mode.
 * 5. Its pre-order `generateBundle` assigns each existing Rolldown OutputChunk its package-qualified filename and atomically
 *    publishes the generated app.json declarations as `finalized` state.
 * 6. The later `vpt:wx` generateBundle hook consumes those declarations and emits native assets against finalized paths.
 *
 * The discriminated state is the only generation-local mutation: `idle → awaiting-chunks → planned → finalized`. Each hook
 * performs one whole-state transition, so stale byte maps, fake graph sentinels, empty fallback plans, duplicate planning,
 * and partially reset generations are unrepresentable.
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

/** Creates immutable ownership operations for one complete final-chunk graph. */
export function createPlacement({
    chunks,
    getAdditionalModuleBytes
}: {
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    getAdditionalModuleBytes(moduleId: string): number
}): Placement {
    const plan = createPlacementPlan({
        chunks: chunks,
        getAdditionalChunkBytes: (chunk) =>
            chunk.moduleIds.reduce((bytes, moduleId) => bytes + getAdditionalModuleBytes(moduleId), 0)
    })

    function getLocation(chunkId: string): PackageLocation {
        const location = plan.get(chunkId)
        if (!location) {
            throw new Error(`wx placement is missing final chunk: ${chunkId}`)
        }
        return location
    }

    /** Resolves typed ownership from Rolldown's preliminary physical filename before or after finalization. */
    function getPackageLocation(chunk: Rolldown.RenderedChunk | Rolldown.OutputChunk): PackageLocation {
        return getLocation('preliminaryFileName' in chunk ? chunk.preliminaryFileName : chunk.fileName)
    }

    return {
        getPackageLocation: getPackageLocation,

        /** Adds the planned package root to a physical preliminary path without changing the chunk's SystemJS identity. */
        getPhysicalChunkId(chunk: Rolldown.RenderedChunk): string {
            const location = getPackageLocation(chunk)
            return location.kind === 'main' ? chunk.fileName : `${location.root}/${chunk.fileName}`
        },

        /** Selects the native loading API directly from typed package ownership. */
        getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async' {
            return getPackageLocation(chunk).kind === 'subpackage' ? 'async' : 'sync'
        },

        /** Assigns each final chunk's Rolldown-owned physical filename and declares typed owners that survived output. */
        finalize(bundle: Rolldown.OutputBundle): readonly GeneratedSubpackage[] {
            const chunks = Object.values(bundle).filter(
                (output): output is Rolldown.OutputChunk => output.type === 'chunk'
            )
            // This local mutable set deduplicates typed package owners that retain at least one final output chunk.
            const roots = new Set<string>()
            for (const chunk of chunks) {
                // OutputChunk.fileName contains the resolved content hash. preliminaryFileName preserves the exact physical
                // candidate with placeholders that identified this chunk when the immutable plan was created during renderChunk.
                const location = getLocation(chunk.preliminaryFileName)
                if (location.kind !== 'subpackage') {
                    continue
                }
                // OutputChunk is mutable in generateBundle. Assigning fileName makes Rolldown retain all chunk metadata and
                // write that same chunk at its physical package path; deleting bundle keys or re-emitting would lose identity.
                chunk.fileName = `${location.root}/${chunk.fileName}`
                roots.add(location.root)
            }

            return [...roots].sort().map((root) => ({
                name: getSubpackageName(root),
                root: root,
                pages: []
            }))
        }
    }
}
