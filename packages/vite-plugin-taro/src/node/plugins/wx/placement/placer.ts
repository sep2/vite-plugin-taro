import type { Rolldown } from 'vite'
import { getWxExecutionKind, isTransportModule } from '../module.ts'
import {
    createPlacementPlan,
    getSubpackageName,
    isGeneratedSubpackageFile,
    type ModuleGraph,
    mainPackage,
    type PackageLocation,
    type PlacementPlan
} from './plan.ts'

/** Native app.json declaration for one generated code-only subpackage. */
export type GeneratedSubpackage = {
    /** Stable native alias derived from the generated root hash. */
    name: string
    /** Physical directory containing this subpackage's emitted capsules. */
    root: string
    /** Marks this as a code-only subpackage with no native Page routes. */
    pages: readonly []
}

/**
 * Creates the stateful adapter between graph planning and Rolldown's output lifecycle:
 *
 * - renderStart analyzes transformed modules before chunking.
 * - codeSplitting prevents modules assigned to different packages from being merged.
 * - filename callbacks materialize planned subpackage roots.
 * - renderChunk derives native loading mode from those physical paths.
 * - generateBundle reconciles the plan with chunks that survived tree shaking.
 */
export function createPlacer() {
    // Filename and output callbacks run after analyze and read this immutable plan through their shared closure.
    let plan: PlacementPlan = new Map()

    /**
     * Reduces module ownership to one package for filename generation. Unknown Rolldown-generated modules default to
     * main, empty chunks default to main, and a chunk containing multiple known owners is rejected before paths diverge.
     */
    function getChunkLocation(chunk: Rolldown.PreRenderedChunk): PackageLocation {
        let location: PackageLocation | undefined
        for (const moduleId of chunk.moduleIds) {
            const moduleLocation = plan.get(moduleId) ?? mainPackage
            if (!location) {
                location = moduleLocation
                continue
            }
            if (!hasSameLocation(location, moduleLocation)) {
                throw new Error(`wx chunk mixes package owners: ${chunk.moduleIds.join(', ')}`)
            }
        }
        return location ?? mainPackage
    }

    return {
        /** Assigns every transformed module to main or one generated, size-bounded subpackage. */
        analyze(graph: ModuleGraph): void {
            plan = createPlacementPlan(graph)
        },

        /**
         * Complete Rolldown fragment required to preserve package placement and native entry semantics.
         *
         * ```text
         * native App/Page/Component shell entry
         *   └─ static import / runtime importSync() ─▶ explicit capsule entry + static closure [main, no TLA]
         *                                                └─ System.import() ─▶ lazy-a [package A, TLA allowed]
         *                                                                      └─ static import ─▶ lazy-b [package B]
         *
         * name()                              assigns lazy-a and lazy-b to their planned package groups
         * includeDependenciesRecursively      false: does not pull lazy-b back into package A
         * preserveEntrySignatures             allows cross-chunk bindings without weakening native entry exports
         *
         * package A capsule
         *   └─ SystemJS dependency ─▶ package B capsule
         *                                ▲
         *                                └─ main transport obtains registration with require.async()
         * ```
         *
         * Explicit entries preserve the shell/capsule rendering boundary while their static edge executes synchronously
         * from main. Once a dynamic boundary is crossed, physical fetches may be asynchronous and modules may use
         * top-level await. SystemJS still links that complete static lazy graph before execution, even across packages.
         */
        rolldownOptions: {
            output: {
                /**
                 * Gives every generated subpackage a distinct Rolldown chunk group. Recursive dependency capture must
                 * stay disabled: lazy static dependencies may belong to other subpackages and SystemJS links them
                 * asynchronously.
                 */
                codeSplitting: {
                    groups: [
                        {
                            name(moduleId: string): string | null {
                                const location = plan.get(moduleId)
                                return location?.kind === 'subpackage' ? getSubpackageName(location.root) : null
                            },
                            // Do not let Rolldown pull a lazy group's static closure into one chunk. Past the nested dynamic
                            // boundary, transport may obtain registrations from several packages asynchronously before
                            // SystemJS links and executes the original graph, including cycles and top-level await.
                            includeDependenciesRecursively: false
                        }
                    ]
                },
                // strictExecutionOrder deliberately has no plugin default. When an application enables it through normal
                // Rolldown output options, the generated helper runtime becomes amphibious: CommonJS evaluates it once and
                // transport publishes that cached namespace to SystemJS.
                /** Preserves exact native shell paths while hashing transport and explicit capsule entries. */
                entryFileNames(chunk: Rolldown.PreRenderedChunk): string {
                    return getWxExecutionKind(chunk) === 'native' && !isTransportModule(chunk)
                        ? '[name]'
                        : 'assets/[name]-[hash].js'
                },
                /** Converts the planned owner into its physical main or generated subpackage filename template. */
                chunkFileNames(chunk: Rolldown.PreRenderedChunk): string {
                    const location = getChunkLocation(chunk)
                    if (location.kind === 'main') {
                        return 'assets/[name]-[hash].js'
                    }
                    // The containing subpackage already supplies a stable identity. Do not leak the Rolldown group name
                    // into every physical chunk filename; content identity alone is sufficient beneath that root.
                    return `${location.root}/assets/[hash].js`
                },
                // Keep generic assets independent of native output identities assigned after bundling.
                assetFileNames: 'assets/[name]-[hash][extname]'
            },
            // Rolldown rejects strict entry signatures when code-splitting groups disable recursive dependency capture.
            // allow-extension retains required native-entry exports while permitting the extra cross-chunk bindings used
            // to split lazy static closures across physical packages.
            preserveEntrySignatures: 'allow-extension' as const
        },

        /**
         * Selects loading mode from physical output rather than graph intent. Transport executes in main, so main files
         * use require() and every generated subpackage file uses require.async().
         */
        getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async' {
            return isGeneratedSubpackageFile(chunk.fileName) ? 'async' : 'sync'
        },

        /**
         * Reconciles planned ownership with final chunks through module IDs. Tree-shaken subpackages disappear naturally,
         * while roots are deduplicated and sorted before becoming deterministic app.json declarations.
         */
        getSubpackages(bundle: Rolldown.OutputBundle): GeneratedSubpackage[] {
            const emittedSubpackageRoots = new Set<string>()
            for (const output of Object.values(bundle)) {
                if (output.type !== 'chunk') {
                    continue
                }
                for (const moduleId of output.moduleIds) {
                    const location = plan.get(moduleId)
                    if (location?.kind === 'subpackage') {
                        emittedSubpackageRoots.add(location.root)
                    }
                }
            }

            return [...emittedSubpackageRoots].sort().map((root) => ({
                name: getSubpackageName(root),
                root,
                pages: []
            }))
        }
    }
}

/** Compares main by discriminant and generated subpackages by their unique physical root. */
function hasSameLocation(left: PackageLocation, right: PackageLocation): boolean {
    return left.kind === 'main' ? right.kind === 'main' : right.kind === 'subpackage' && left.root === right.root
}
