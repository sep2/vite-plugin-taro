import path from 'node:path'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { appComponentId, bootstrapPath, pageModuleId, pageModuleIdPrefix, vitePreloadId } from './constant.ts'
import { renderPageModule } from './render-page-module.ts'

/** Resolves one exact private import using its importer and configured project root. */
type RuntimeModuleResolver = (importer: string | undefined, projectRoot: string) => string

/** Creates the private WX module resolver. */
export function createModuleResolver(options: VitePluginTaroOptions) {
    // Provide constant-time route validation and access to each configured Page JSON object.
    const pageByPath = new Map(options.pages.map((page) => [page.path, page]))

    // Bridge route-specific source generated during resolution to Vite's later load hook.
    const moduleSources = new Map<string, string>()

    const moduleResolvers = new Map<string, RuntimeModuleResolver>([
        // Reuse bootstrap's identity loader instead of Vite's browser preload implementation.
        [vitePreloadId, () => bootstrapPath],
        // Keep the configured App component behind one stable private import in the App module.
        [appComponentId, (_importer, projectRoot) => path.resolve(projectRoot, options.app)],
        [
            pageModuleId,
            (importer, projectRoot) => {
                // Recover the route attached to this specific native Page-shell entry.
                const pagePath = requirePagePath(importer)
                const page = pageByPath.get(pagePath)
                if (!page) {
                    throw new Error(`Unknown Page module: ${pagePath}`)
                }

                // Give every generated Page module a stable route identity for the graph and future HMR.
                const resolvedId = `${pageModuleIdPrefix}${encodeURIComponent(pagePath)}`
                moduleSources.set(resolvedId, renderPageModule(page, projectRoot))
                return resolvedId
            }
        ]
    ])

    return {
        resolveId(id: string, importer: string | undefined, projectRoot: string): string | undefined {
            // Unknown IDs fall through so Vite and other plugins retain normal resolution.
            return moduleResolvers.get(id)?.(importer, projectRoot)
        },

        load(id: string): string | undefined {
            // Only route-qualified Page modules have generated source to load.
            return moduleSources.get(id)
        }
    }
}

/** Reads the required Page path from an importing route module. */
function requirePagePath(importer: string | undefined): string {
    const queryIndex = importer?.indexOf('?') ?? -1
    const pagePath = queryIndex === -1 ? undefined : new URLSearchParams(importer?.slice(queryIndex + 1)).get('route')
    if (!pagePath) {
        throw new Error('Page module import must originate from a route module')
    }
    return pagePath
}
