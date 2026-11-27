import type { VptPageOption } from '../../../options.ts'

/** A compiler page uses its public route as path and keeps the component lookup independent. */
export type ResolvedPage = VptPageOption & { sourcePath: string }

export function resolvePage(page: VptPageOption): ResolvedPage {
    return {
        ...page,
        path: page.subpackage ? `${page.subpackage}/${page.path}` : page.path,
        sourcePath: page.path
    }
}
