import path from 'node:path'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { normalizeModuleId } from '../../../utils/modules.ts'
import {
    appComponentId,
    appShellFileName,
    appShellPath,
    bootstrapPath,
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
        // Reuse bootstrap's identity loader instead of Vite's browser preload implementation.
        [vitePreloadId, () => bootstrapPath],
        // Keep the configured App component behind one stable private import in the App module.
        [appComponentId, (_importer, projectRoot) => path.resolve(projectRoot, options.app)],
        [
            pageModuleId,
            (importer) => {
                // Recover the route attached to this specific native Page-shell entry.
                const pagePath = requirePagePath(importer)
                if (!pageByPath.has(pagePath)) {
                    throw new Error(`Unknown Page module: ${pagePath}`)
                }

                // Query-qualify the real module so every Page retains a distinct graph identity.
                return `${pageModulePath}?route=${encodeURIComponent(pagePath)}`
            }
        ]
    ])

    return {
        // Make every native shell a distinct entry so Rolldown preserves WeChat's exact file paths.
        input: {
            [appShellFileName]: appShellPath,
            ...Object.fromEntries(
                options.pages.map((page) => {
                    return [`${page.path}.js`, `${pageShellPath}?route=${encodeURIComponent(page.path)}`]
                })
            )
        },

        resolveId(id: string, importer: string | undefined, projectRoot: string): string | undefined {
            // Unknown IDs fall through so Vite and other plugins retain normal resolution.
            return moduleResolvers.get(id)?.(importer, projectRoot)
        },

        transform(code: string, id: string, projectRoot: string) {
            if (normalizeModuleId(id) !== normalizeModuleId(pageModulePath)) {
                return
            }

            const pagePath = requirePagePath(id)
            const page = pageByPath.get(pagePath)
            if (!page) {
                throw new Error(`Unknown Page module: ${pagePath}`)
            }

            return transformPageModule(code, id, page, projectRoot)
        }
    }
}

/** Reads the required Page path from a route-qualified module ID. */
function requirePagePath(moduleId: string | undefined): string {
    const queryIndex = moduleId?.indexOf('?') ?? -1
    const pagePath = queryIndex === -1 ? undefined : new URLSearchParams(moduleId?.slice(queryIndex + 1)).get('route')
    if (!pagePath) {
        throw new Error('Page module import must originate from a route module')
    }
    return pagePath
}
