import type { VptJsonObject, VptOptions } from '../../options.ts'

/** Creates shared App configuration with configured Page order as the authoritative value. */
export function createAppConfig(options: VptOptions): VptJsonObject {
    const { subPackages: _subPackages, subpackages: _subpackages, ...appJson } = options.appJson
    return {
        ...appJson,
        pages: options.pages.map((page) => page.path)
    }
}
