import path from 'node:path'
import { normalizePath, type Rolldown } from 'vite'
import type { VptPageOption } from '../../../../options.ts'
import { normalizeModuleId, resolveAppComponentPath, resolvePageComponentPath } from '../../../utils/modules.ts'
import { createAppConfig } from '../../../utils/project-config.ts'
import { appComponentId } from '../../client/constant.ts'
import { pageMetadataKey } from '../../page/page-metadata-key.ts'
import { type ResolvedPage, resolvePage } from '../../page/resolve-page.ts'
import type { MiniContract } from '../mini-contract.ts'
import {
    appShellFileName,
    miniAppCapsuleId,
    miniAppShellId,
    miniBootstrapId,
    miniPageCapsuleId,
    miniPageShellId,
    miniTransportId,
    miniTransportOutputPath,
    pageCapsuleId,
    pageComponentId,
    rendererHostId,
    taroTargetRuntimeId,
    vitePreloadId
} from '../module/module.ts'
import { specializeAppCapsule } from './specialize-app-capsule.ts'
import { specializePageCapsule } from './specialize-page-capsule.ts'

/** Resolves one exact plugin-private ID using its importer and configured project root. */
type PrivateIdResolver = (importer: string | undefined, projectRoot: string) => string

/** Creates fixed private-ID resolution and the source specializer for the current Mini Program pages. */
export function createMiniResolver(contract: Pick<MiniContract, 'options' | 'taro' | 'supportsPagePrerender'>) {
    const normalizedAppCapsulePath = normalizePath(miniAppCapsuleId)
    const normalizedPageCapsulePath = normalizePath(miniPageCapsuleId)

    // setPages replaces the ordered page snapshot and rebuilds its constant-time route index together.
    let pages: readonly ResolvedPage[] = []

    const pageByRoute = new Map<string, ResolvedPage>()

    const privateIdResolvers = new Map<string, PrivateIdResolver>([
        // Preload needs only the initialized loader.
        [vitePreloadId, () => miniBootstrapId],
        [taroTargetRuntimeId, () => contract.taro.targetRuntimePath],
        [rendererHostId, () => contract.taro.hostPath],
        // Keep the configured App component behind one stable private import in the App capsule.
        [
            appComponentId,
            (_importer, projectRoot) => resolveAppComponentPath({ appPath: contract.options.app, projectRoot })
        ],
        [
            pageComponentId,
            (importer, projectRoot) => {
                const page = requireConfiguredPage({ moduleId: importer, pageByRoute })

                return resolvePageComponentPath({ pagePath: page.option.path, projectRoot })
            }
        ],
        [
            pageCapsuleId,
            (importer) => {
                // Query-qualify the capsule source so every Page retains a distinct graph identity.
                const page = requireConfiguredPage({ moduleId: importer, pageByRoute })

                return createRouteModuleId({ moduleId: miniPageCapsuleId, route: page.route })
            }
        ]
    ])

    return {
        appEntry: {
            capsuleId: miniAppCapsuleId,
            capsuleName: 'app-capsule',
            shellId: miniAppShellId,
            shellName: appShellFileName
        },

        pageEntries() {
            return pages.map((page) => ({
                page,
                capsuleId: createRouteModuleId({ moduleId: miniPageCapsuleId, route: page.route }),
                capsuleName: `${page.route}-capsule`,
                shellId: createRouteModuleId({ moduleId: miniPageShellId, route: page.route }),
                shellName: `${page.route}.js`
            }))
        },

        setPages(declarations: readonly VptPageOption[]) {
            pages = declarations.map(resolvePage)
            pageByRoute.clear()
            for (const page of pages) {
                pageByRoute.set(page.route, page)
            }
        },

        resolveId(
            id: string,
            importer: string | undefined,
            projectRoot: string
        ): string | Rolldown.PartialResolvedId | undefined {
            if (id === miniTransportId) {
                // The loader lives in common/; generated infrastructure has its own namespace outside the bundled graph.
                return { id: `./${path.posix.relative('common', miniTransportOutputPath)}`, external: true }
            }

            // Unknown IDs fall through so Vite and other plugins retain normal resolution.
            return privateIdResolvers.get(id)?.(importer, projectRoot)
        },

        specialize(code: string, id: string, sourcemap?: boolean) {
            const normalizedId = normalizeModuleId(id)

            if (normalizedId === normalizedAppCapsulePath) {
                return {
                    ...specializeAppCapsule({
                        code,
                        id,
                        appConfig: createAppConfig(contract.options, pages),
                        sourcemap
                    }),
                    // The application module publishes the ordered pages for consumers of the current compiler graph.
                    meta: { [pageMetadataKey]: pages }
                }
            }

            if (normalizedId === normalizedPageCapsulePath) {
                const page = requireConfiguredPage({ moduleId: id, pageByRoute })

                return specializePageCapsule({
                    code,
                    id,
                    page,
                    supportsPagePrerender: contract.supportsPagePrerender,
                    sourcemap
                })
            }
        }
    }
}

/** Creates one route-qualified module ID. */
function createRouteModuleId({ moduleId, route }: { moduleId: string; route: string }): string {
    return `${moduleId}?route=${encodeURIComponent(route)}`
}

/** Returns the configured Page identified by a route-qualified capsule ID. */
function requireConfiguredPage({
    moduleId,
    pageByRoute
}: {
    moduleId: string | undefined
    pageByRoute: ReadonlyMap<string, ResolvedPage>
}): ResolvedPage {
    const queryIndex = moduleId?.indexOf('?') ?? -1
    const route = queryIndex === -1 ? undefined : new URLSearchParams(moduleId?.slice(queryIndex + 1)).get('route')
    const page = route ? pageByRoute.get(route) : undefined
    if (!page) {
        throw new Error(
            route ? `Unknown Page capsule: ${route}` : 'Page capsule import must originate from a route module'
        )
    }
    return page
}
