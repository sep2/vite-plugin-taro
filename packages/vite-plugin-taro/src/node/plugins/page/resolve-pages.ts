import type { VptPageOption, VptTarget } from '../../../options.ts'
import { orderPages } from './order-pages.ts'

/** Resolves and validates entry-first pages for one target in the configured project root. */
export async function resolvePages({
    pages
}: Readonly<{
    pages: readonly VptPageOption[]
    target: VptTarget
    root: string
}>): Promise<readonly VptPageOption[]> {
    return orderPages(pages)
}
