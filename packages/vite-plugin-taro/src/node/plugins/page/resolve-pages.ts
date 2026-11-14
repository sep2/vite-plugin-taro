import type { VptPageOption, VptTarget } from '../../../options.ts'
import { orderPages } from './order-pages.ts'
import type { PageBuildConfig } from './page-build-config.ts'

/** Resolves and validates entry-first pages for one target in the configured project root. */
export async function resolvePages({
    pages
}: PageBuildConfig &
    Readonly<{
        pages: readonly VptPageOption[]
        target: VptTarget
    }>): Promise<readonly VptPageOption[]> {
    return orderPages(pages)
}
