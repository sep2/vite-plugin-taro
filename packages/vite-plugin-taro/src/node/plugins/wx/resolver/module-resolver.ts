import path from 'node:path'
import type { VitePluginTaroOptions, VitePluginTaroPageOption } from '../../../../options.ts'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { appComponentId } from '../../client/constant.ts'
import {
    appShellFileName,
    appShellPath,
    bootstrapPath,
    componentShellFileName,
    componentShellPath,
    pageModuleId,
    pageModulePath,
    pageShellPath,
    vitePreloadId
} from '../native/constant.ts'
import { transformPageModule } from '../native/transform-page-module.ts'

/** Resolves one exact private import using its importer and configured project root. */
type RuntimeModuleResolver = (importer: string | undefined, projectRoot: string) => string

/** Creates the private WX module resolver. */
export function createModuleResolver(options: VitePluginTaroOptions) {
    // Provide constant-time route validation and access to each configured Page JSON object.
    const pageByPath = new Map(options.pages.map((page) => [page.path, page]))

    const moduleResolvers = new Map<string, RuntimeModuleResolver>([
        // Share bootstrap's identity helper through native require and the specialized SystemJS transport case.
        [vitePreloadId, () => bootstrapPath],
        // Keep the configured App component behind one stable private import in the App module.
        [appComponentId, (_importer, projectRoot) => path.resolve(projectRoot, options.app)],
        [
            pageModuleId,
            (importer) => {
                // Query-qualify the real module so every Page retains a distinct graph identity.
                const page = requirePage({ moduleId: importer, pageByPath })

                return createRouteModuleId({ moduleId: pageModulePath, pagePath: page.path })
            }
        ]
    ])

    return {
        // Make every native shell a distinct entry, so Rolldown preserves WeChat's exact file paths.
        input: {
            [appShellFileName]: appShellPath,
            [componentShellFileName]: componentShellPath,

            ...Object.fromEntries(
                options.pages.map((page) => {
                    return [
                        `${page.path}.js`,
                        createRouteModuleId({
                            moduleId: pageShellPath,
                            pagePath: page.path
                        })
                    ]
                })
            )
        },

        resolveId(id: string, importer: string | undefined, projectRoot: string): string | undefined {
            // Unknown IDs fall through so Vite and other plugins retain normal resolution.
            return moduleResolvers.get(id)?.(importer, projectRoot)
        },

        transform(code: string, id: string, projectRoot: string) {
            if (normalizeModuleId(id) === normalizeModuleId(pageModulePath)) {
                return transformPageModule({
                    code,
                    id,
                    page: requirePage({ moduleId: id, pageByPath }),
                    projectRoot
                })
            }
        }
    }
}

/** Creates one route-qualified module ID. */
function createRouteModuleId({ moduleId, pagePath }: { moduleId: string; pagePath: string }): string {
    return `${moduleId}?route=${encodeURIComponent(pagePath)}`
}

/** Returns the configured Page identified by a route-qualified module ID. */
function requirePage({
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
            pagePath ? `Unknown Page module: ${pagePath}` : 'Page module import must originate from a route module'
        )
    }
    return page
}
