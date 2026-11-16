import path from 'node:path'
import { normalizePath, type Rolldown } from 'vite'
import type { VptPageOption } from '../../../../options.ts'
import { normalizeModuleId, resolveAppComponentPath, resolvePageComponentPath } from '../../../utils/modules.ts'
import { createAppConfig } from '../../../utils/project-config.ts'
import { appComponentId } from '../../client/constant.ts'
import { pageMetadataKey } from '../../page/page-metadata-key.ts'
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
    let pages: readonly VptPageOption[] = []

    const pageByPath = new Map<string, VptPageOption>()

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
                const page = requireConfiguredPage({ moduleId: importer, pageByPath })

                return resolvePageComponentPath({ pagePath: page.path, projectRoot })
            }
        ],
        [
            pageCapsuleId,
            (importer) => {
                // Query-qualify the capsule source so every Page retains a distinct graph identity.
                const page = requireConfiguredPage({ moduleId: importer, pageByPath })

                return createRouteModuleId({ moduleId: miniPageCapsuleId, pagePath: page.path })
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
                capsuleId: createRouteModuleId({ moduleId: miniPageCapsuleId, pagePath: page.path }),
                capsuleName: `${page.path}-capsule`,
                shellId: createRouteModuleId({ moduleId: miniPageShellId, pagePath: page.path }),
                shellName: `${page.path}.js`
            }))
        },

        setPages(resolvedPages: readonly VptPageOption[]) {
            pageByPath.clear()
            for (const page of resolvedPages) {
                pageByPath.set(page.path, page)
            }
            pages = resolvedPages
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
                const page = requireConfiguredPage({ moduleId: id, pageByPath })

                return specializePageCapsule({
                    code,
                    id,
                    page: { ...page, prerender: contract.supportsPagePrerender && page.prerender === true },
                    sourcemap
                })
            }
        }
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
    pageByPath: ReadonlyMap<string, VptPageOption>
}): VptPageOption {
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
