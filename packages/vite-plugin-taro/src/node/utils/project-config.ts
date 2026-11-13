import type { VptJsonObject, VptPageConfig, VptPageOption } from '../../options.ts'
import type { ResolvedOptions } from '../options/resolved-options.ts'

/** Resolves an omitted Page configuration to its empty native representation. */
export function getPageConfig(page: VptPageOption): VptPageConfig {
    return page.config ?? {}
}

/** Creates shared App configuration with configured Page order as the authoritative value. */
export function createAppConfig(options: ResolvedOptions): VptJsonObject {
    const { subPackages: _subPackages, subpackages: _subpackages, ...appJson } = options.appJson
    return {
        ...appJson,
        pages: options.pages.map((page) => page.path)
    }
}
