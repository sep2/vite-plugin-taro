import type { Rolldown } from 'vite'
import { isTransportModule } from '../native/module-kind.ts'
import {
    createPlacementPlan,
    getSubpackageName,
    isGeneratedSubpackageFile,
    type ModuleGraph,
    mainPackage,
    type PackageLocation,
    type PlacementPlan
} from './placement-plan.ts'

/** Native app.json declaration for one generated code-only package. */
export type GeneratedSubpackage = {
    /** Stable native alias derived from the generated root hash. */
    name: string
    /** Physical directory containing this package's emitted capsules. */
    root: string
    /** Marks this as a code-only package with no native Page routes. */
    pages: readonly []
}

/**
 * Creates the stateful adapter between graph planning and Rolldown's output lifecycle:
 *
 * - renderStart analyzes transformed modules before chunking.
 * - codeSplitting prevents modules assigned to different packages from being merged.
 * - filename callbacks materialize planned package roots.
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
    function getChunkPackageForNaming(chunk: Rolldown.PreRenderedChunk): PackageLocation {
        let location: PackageLocation | undefined
        for (const moduleId of chunk.moduleIds) {
            const moduleLocation = plan.get(moduleId) ?? mainPackage
            if (!location) {
                location = moduleLocation
                continue
            }
            if (!isSamePackage(location, moduleLocation)) {
                throw new Error(`wx chunk mixes package owners: ${chunk.moduleIds.join(', ')}`)
            }
        }
        return location ?? mainPackage
    }

    return {
        /** Assigns every transformed module to main or one generated, size-bounded package. */
        analyze(graph: ModuleGraph): void {
            plan = createPlacementPlan(graph)
        },

        /**
         * Complete Rolldown fragment required to preserve package placement and native entry semantics.
         *
         * ```text
         * native App/Page entry
         *   └─ import() ─▶ eager application capsule [main]
         *                    └─ import() ─▶ lazy-a [package A]
         *                                      └─ static import ─▶ lazy-b [package B after size splitting]
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
         * The physical fetch is asynchronous, but SystemJS links the complete static graph before execution, so splitting
         * a static edge or cycle across packages does not turn it into an application-level dynamic import.
         */
        rolldownOptions: {
            output: {
                /**
                 * Gives every generated package a distinct Rolldown chunk group. Recursive dependency capture must stay
                 * disabled: lazy static dependencies may belong to other packages and SystemJS links them asynchronously.
                 */
                codeSplitting: {
                    groups: [
                        {
                            name(moduleId: string): string | null {
                                const location = plan.get(moduleId)
                                return location?.kind === 'subpackage' ? getSubpackageName(location.root) : null
                            },
                            // Do not let Rolldown pull a group's static closure into the same chunk. Lazy static edges may
                            // cross physical packages because transport obtains registrations asynchronously before
                            // SystemJS links and executes the original static graph, including cycles.
                            includeDependenciesRecursively: false
                        }
                    ]
                },
                // strictExecutionOrder deliberately has no plugin default. When an application enables it through normal
                // Rolldown output options, the generated helper runtime becomes amphibious: CommonJS evaluates it once and
                // transport publishes that cached namespace to SystemJS.
                /** Preserves exact native entries while allowing transport to participate in content hashing. */
                entryFileNames(chunk: Rolldown.PreRenderedChunk): string {
                    return isTransportModule(chunk) ? 'assets/[name]-[hash].js' : '[name]'
                },
                /** Converts the planned owner into its physical main or generated-package filename template. */
                chunkFileNames(chunk: Rolldown.PreRenderedChunk): string {
                    const location = getChunkPackageForNaming(chunk)
                    if (location.kind === 'main') {
                        return 'assets/[name]-[hash].js'
                    }
                    // The containing package already supplies a stable identity. Do not leak the Rolldown group name into
                    // every physical chunk filename; content identity alone is sufficient inside that package root.
                    return `${location.root}/assets/[hash].js`
                },
                /** Keeps the one global stylesheet exact and places all other assets in main-package assets. */
                assetFileNames(asset: Rolldown.PreRenderedAsset): string {
                    return asset.names.some((name) => name.endsWith('.css'))
                        ? 'app.wxss'
                        : 'assets/[name]-[hash][extname]'
                }
            },
            // Rolldown rejects strict entry signatures when code-splitting groups disable recursive dependency capture.
            // allow-extension retains required native-entry exports while permitting the extra cross-chunk bindings used
            // to split lazy static closures across physical packages.
            preserveEntrySignatures: 'allow-extension' as const
        },

        /**
         * Selects loading mode from physical output rather than graph intent. Transport executes in main, so main files
         * use require() and every generated-package file uses require.async().
         */
        getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async' {
            return isGeneratedSubpackageFile(chunk.fileName) ? 'async' : 'sync'
        },

        /**
         * Reconciles planned ownership with final chunks through module IDs. Tree-shaken packages disappear naturally,
         * while roots are deduplicated and sorted before becoming deterministic app.json declarations.
         */
        getSubpackages(bundle: Rolldown.OutputBundle): GeneratedSubpackage[] {
            const emittedPackageRoots = new Set<string>()
            for (const output of Object.values(bundle)) {
                if (output.type !== 'chunk') {
                    continue
                }
                for (const moduleId of output.moduleIds) {
                    const location = plan.get(moduleId)
                    if (location?.kind === 'subpackage') {
                        emittedPackageRoots.add(location.root)
                    }
                }
            }

            return [...emittedPackageRoots].sort().map((root) => ({
                name: getSubpackageName(root),
                root,
                pages: []
            }))
        }
    }
}

/** Compares main by discriminant and generated packages by their unique physical root. */
function isSamePackage(left: PackageLocation, right: PackageLocation): boolean {
    return left.kind === 'main' ? right.kind === 'main' : right.kind === 'subpackage' && left.root === right.root
}
