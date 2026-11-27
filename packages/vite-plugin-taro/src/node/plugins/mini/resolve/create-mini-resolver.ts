import path from 'node:path'
import { normalizePath, type Rolldown } from 'vite'
import { normalizeModuleId, resolveAppComponentPath, resolvePageComponentPath } from '../../../utils/modules.ts'
import { createAppConfig } from '../../../utils/project-config.ts'
import { appComponentId } from '../../client/constant.ts'
import { orderPages } from '../../page/order-pages.ts'
import { pageMetadataKey } from '../../page/page-metadata-key.ts'
import type { MiniContract } from '../mini-contract.ts'
import {
    appShellFileName,
    isMiniPageShell,
    miniAppCapsuleId,
    miniAppShellId,
    miniBootstrapId,
    miniPageCapsuleId,
    miniTransportId,
    miniTransportOutputPath,
    pageCapsuleId,
    pageComponentId,
    rendererHostId,
    taroTargetRuntimeId,
    vitePreloadId
} from '../module/module.ts'
import { type MiniResolvedPage, resolveMiniPage } from './resolve-mini-page.ts'
import { specializeAppCapsule } from './specialize-app-capsule.ts'
import { specializePageCapsule } from './specialize-page-capsule.ts'

/** Resolves one exact plugin-private ID using its importer and configured project root. */
type PrivateIdResolver = (importer: string | undefined, projectRoot: string) => string

/** Creates fixed private-ID resolution and the source specializer for the current Mini Program pages. */
export function createMiniResolver(contract: Pick<MiniContract, 'options' | 'taro' | 'supportsPagePrerender'>) {
    const normalizedAppCapsulePath = normalizePath(miniAppCapsuleId)
    const normalizedPageCapsulePath = normalizePath(miniPageCapsuleId)

    const pages: readonly MiniResolvedPage[] = orderPages(contract.options.pages).map(resolveMiniPage)
    const pageByRoute = new Map(pages.map((page) => [page.route, page]))

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
                const page = requirePage(importer, pageByRoute)

                return resolvePageComponentPath({ pagePath: page.option.path, projectRoot })
            }
        ],
        [pageCapsuleId, (importer) => requirePage(importer, pageByRoute).capsuleId]
    ])

    return {
        appEntry: {
            capsuleId: miniAppCapsuleId,
            capsuleName: 'app-capsule',
            shellId: miniAppShellId,
            shellName: appShellFileName
        },

        pages,

        /** Only a declared subpackage Page shell enters the graph through its package-local loader. */
        getPageLoader(facadeModuleId: string | null): string | undefined {
            if (!isMiniPageShell(facadeModuleId)) {
                return undefined
            }
            const route = readPageRoute(facadeModuleId)
            return route ? pageByRoute.get(route)?.pageLoader : undefined
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
                const page = requirePage(id, pageByRoute)

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

/** Shell and capsule facades identify the same declared Page through their route query. */
function readPageRoute(moduleId: string | null | undefined): string | null {
    const queryIndex = moduleId?.indexOf('?') ?? -1
    return queryIndex === -1 ? null : new URLSearchParams(moduleId?.slice(queryIndex + 1)).get('route')
}

/** Returns the configured Page identified by a route-qualified capsule ID. */
function requirePage(
    moduleId: string | undefined,
    pageByRoute: ReadonlyMap<string, MiniResolvedPage>
): MiniResolvedPage {
    const route = readPageRoute(moduleId)
    const page = route ? pageByRoute.get(route) : undefined
    if (!page) {
        throw new Error(
            route ? `Unknown Page capsule: ${route}` : 'Page capsule import must originate from a route module'
        )
    }
    return page
}
