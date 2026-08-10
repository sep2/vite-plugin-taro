import type { VitePluginTaroOptions, VitePluginTaroPageOption } from '../../../../options.ts'
import { normalizeModuleId, resolveAppComponentPath, resolvePageComponentPath } from '../../../utils/modules.ts'
import { createAppConfig } from '../../../utils/project-config.ts'
import { appComponentId } from '../../client/constant.ts'
import {
    appCapsulePath,
    appShellFileName,
    appShellPath,
    bootstrapPath,
    componentCapsulePath,
    componentShellFileName,
    componentShellPath,
    pageCapsuleId,
    pageCapsulePath,
    pageComponentId,
    pageShellPath,
    transportPath,
    vitePreloadId
} from '../module.ts'
import { specializeBootstrap } from './specialize-bootstrap.ts'
import { specializePageCapsule } from './specialize-page-capsule.ts'

/** Resolves one exact plugin-private ID using its importer and configured project root. */
type PrivateIdResolver = (importer: string | undefined, projectRoot: string) => string

/** Creates the resolver and source specializer for the wx module graph. */
export function createResolver(options: VitePluginTaroOptions) {
    const normalizedBootstrapPath = normalizeModuleId(bootstrapPath)
    const normalizedPageCapsulePath = normalizeModuleId(pageCapsulePath)

    // Construct output input and application traversal roots together once so style order cannot drift from route order.
    const entryGraph = createEntryGraph(options.pages)

    // Provide constant-time route validation and access to each configured Page JSON object.
    const pageByPath = new Map(options.pages.map((page) => [page.path, page]))

    const privateIdResolvers = new Map<string, PrivateIdResolver>([
        // Share bootstrap's preload identity through native require and its amphibious SystemJS registration.
        [vitePreloadId, () => bootstrapPath],
        // Keep the configured App component behind one stable private import in the App capsule.
        [appComponentId, (_importer, projectRoot) => resolveAppComponentPath({ appPath: options.app, projectRoot })],
        [
            pageComponentId,
            (importer, projectRoot) => {
                const page = requireConfiguredPage({ moduleId: importer, pageByPath })

                return resolvePageComponentPath({ pagePath: page.path, projectRoot })
            }
        ],
        [
            pageCapsuleId,
            (importer) => {
                // Query-qualify the capsule source so every Page retains a distinct graph identity.
                const page = requireConfiguredPage({ moduleId: importer, pageByPath })

                return createRouteModuleId({ moduleId: pageCapsulePath, pagePath: page.path })
            }
        ]
    ])

    return {
        ...entryGraph,

        resolveId(id: string, importer: string | undefined, projectRoot: string): string | undefined {
            // Unknown IDs fall through so Vite and other plugins retain normal resolution.
            return privateIdResolvers.get(id)?.(importer, projectRoot)
        },

        specialize(code: string, id: string, sourcemap = true) {
            const normalizedId = normalizeModuleId(id)

            if (normalizedId === normalizedBootstrapPath) {
                return specializeBootstrap({ code, id, appConfig: createAppConfig(options), sourcemap })
            }

            if (normalizedId === normalizedPageCapsulePath) {
                return specializePageCapsule({
                    code,
                    id,
                    page: requireConfiguredPage({ moduleId: id, pageByPath }),
                    sourcemap
                })
            }
        }
    }
}

/** Declares output entries and the ordered application subset that can own user styles. */
function createEntryGraph(pages: readonly VitePluginTaroPageOption[]) {
    const pageEntries = pages.map((page) => {
        return {
            capsuleId: createRouteModuleId({ moduleId: pageCapsulePath, pagePath: page.path }),
            capsuleName: `${page.path}-capsule`,
            shellId: createRouteModuleId({ moduleId: pageShellPath, pagePath: page.path }),
            shellName: `${page.path}.js`
        }
    })

    return {
        // The App owns the first global cascade layer; configured Pages follow in their declared route order.
        applicationEntryIds: [appCapsulePath, ...pageEntries.map((entry) => entry.capsuleId)],
        input: Object.fromEntries([
            ['bootstrap', bootstrapPath],
            ['transport', transportPath],
            [appShellFileName, appShellPath],
            ['app-capsule', appCapsulePath],
            [componentShellFileName, componentShellPath],
            ['component-capsule', componentCapsulePath],
            ...pageEntries.flatMap((entry) => {
                return [
                    [entry.shellName, entry.shellId],
                    [entry.capsuleName, entry.capsuleId]
                ]
            })
        ])
    }
}

/** Creates one route-qualified module ID. */
function createRouteModuleId({ moduleId, pagePath }: { moduleId: string; pagePath: string }): string {
    return `${moduleId}?route=${encodeURIComponent(pagePath)}`
}

/** Returns the configured Page identified by a route-qualified capsule ID. */
function requireConfiguredPage({
    moduleId,
    pageByPath
}: {
    moduleId: string | undefined
    pageByPath: ReadonlyMap<string, VitePluginTaroPageOption>
}): VitePluginTaroPageOption {
    const queryIndex = moduleId?.indexOf('?') ?? -1
    const pagePath = queryIndex === -1 ? undefined : new URLSearchParams(moduleId?.slice(queryIndex + 1)).get('route')
    const page = pagePath ? pageByPath.get(pagePath) : undefined
    if (!page) {
        throw new Error(
            pagePath ? `Unknown Page capsule: ${pagePath}` : 'Page capsule import must originate from a route module'
        )
    }
    return page
}
