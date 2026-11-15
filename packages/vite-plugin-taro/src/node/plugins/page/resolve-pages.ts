import type { VptPageOption, VptTarget } from '../../../options.ts'
import { discoverPages } from './discover-pages.ts'
import { evaluatePageModules } from './evaluate-page-modules.ts'
import { orderPages } from './order-pages.ts'
import type { PageBuildConfig } from './page-build-config.ts'

/** Resolves and validates entry-first pages for one target in the configured project root. */
export async function resolvePages({
    pages,
    target,
    root,
    define,
    resolve
}: PageBuildConfig &
    Readonly<{
        pages: readonly VptPageOption[] | undefined
        target: VptTarget
    }>): Promise<readonly VptPageOption[]> {
    return orderPages(
        pages ?? (await evaluatePageModules(await discoverPages(root), { root, define, resolve }, target))
    )
}
