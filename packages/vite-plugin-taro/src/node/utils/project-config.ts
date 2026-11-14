import type { VptJsonObject, VptOptions, VptPageConfig, VptPageOption } from '../../options.ts'

/** Resolves an omitted Page configuration to its empty native representation. */
export function getPageConfig(page: VptPageOption): VptPageConfig {
    return page.config ?? {}
}

/** Creates shared App configuration with the resolved page order as the authoritative value. */
export function createAppConfig(
    options: Pick<Readonly<VptOptions>, 'appJson'>,
    pages: readonly VptPageOption[]
): VptJsonObject {
    const { subPackages: _subPackages, subpackages: _subpackages, ...appJson } = options.appJson
    return {
        ...appJson,
        pages: pages.map((page) => page.path)
    }
}
