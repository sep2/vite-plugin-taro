import path from 'node:path'
import { normalizePath, type Rolldown } from 'vite'
import { normalizeModuleId, resolveAppComponentPath, resolvePageComponentPath } from '../../../utils/modules.ts'
import { createAppConfig } from '../../../utils/project-config.ts'
import { appComponentId } from '../../client/constant.ts'
import type { MiniContract, MiniPage } from '../mini-contract.ts'
import {
    appShellFileName,
    componentShellFileName,
    customWrapperShellFileName,
    miniAppCapsuleId,
    miniAppShellId,
    miniBootstrapId,
    miniComponentCapsuleId,
    miniComponentShellId,
    miniCustomWrapperShellId,
    miniPageCapsuleId,
    miniPageShellId,
    miniTransportFileName,
    miniTransportId,
    pageCapsuleId,
    pageComponentId,
    taroTargetRuntimeId,
    vitePreloadId
} from '../module/module.ts'
import { specializeAppCapsule } from './specialize-app-capsule.ts'
import { specializePageCapsule } from './specialize-page-capsule.ts'

/** Resolves one exact plugin-private ID using its importer and configured project root. */
type PrivateIdResolver = (importer: string | undefined, projectRoot: string) => string

/** Creates the resolver and source specializer for one Mini Program module graph. */
export function createResolver(contract: Pick<MiniContract, 'options' | 'taro'>) {
    const normalizedAppCapsulePath = normalizePath(miniAppCapsuleId)
    const normalizedPageCapsulePath = normalizePath(miniPageCapsuleId)

    // Construct output input and application traversal roots together once so style order cannot drift from route order.
    const entryGraph = createEntryGraph(contract.options.pages)

    // Provide constant-time route validation and access to each configured Page JSON object.
    const pageByPath = new Map(contract.options.pages.map((page) => [page.path, page]))

    const privateIdResolvers = new Map<string, PrivateIdResolver>([
        // Share bootstrap's preload identity through native require and its amphibious SystemJS registration.
        [vitePreloadId, () => miniBootstrapId],
        [taroTargetRuntimeId, () => contract.taro.targetRuntimePath],
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
        ...entryGraph,

        resolveId(
            id: string,
            importer: string | undefined,
            projectRoot: string
        ): string | Rolldown.PartialResolvedId | undefined {
            if (id === miniTransportId) {
                // Bootstrap lives in common/; generated infrastructure has its own namespace outside the bundled graph.
                return { id: `./${path.posix.relative('common', miniTransportFileName)}`, external: true }
            }

            // Unknown IDs fall through so Vite and other plugins retain normal resolution.
            return privateIdResolvers.get(id)?.(importer, projectRoot)
        },

        specialize(code: string, id: string, sourcemap?: boolean) {
            const normalizedId = normalizeModuleId(id)

            if (normalizedId === normalizedAppCapsulePath) {
                return specializeAppCapsule({ code, id, appConfig: createAppConfig(contract.options), sourcemap })
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
function createEntryGraph(pages: readonly MiniPage[]) {
    const pageEntries = pages.map((page) => {
        return {
            capsuleId: createRouteModuleId({ moduleId: miniPageCapsuleId, pagePath: page.path }),
            capsuleName: `${page.path}-capsule`,
            shellId: createRouteModuleId({ moduleId: miniPageShellId, pagePath: page.path }),
            shellName: `${page.path}.js`
        }
    })

    return {
        // The App owns the first global cascade layer; configured Pages follow in their declared route order.
        applicationEntryIds: [miniAppCapsuleId, ...pageEntries.map((entry) => entry.capsuleId)],
        input: Object.fromEntries([
            ['bootstrap', miniBootstrapId],
            [appShellFileName, miniAppShellId],
            ['app-capsule', miniAppCapsuleId],
            [componentShellFileName, miniComponentShellId],
            ['component-capsule', miniComponentCapsuleId],
            [customWrapperShellFileName, miniCustomWrapperShellId],
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
    pageByPath: ReadonlyMap<string, MiniPage>
}): MiniPage {
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
