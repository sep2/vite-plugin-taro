import type { VptPageOption } from '../../../options.ts'

/** Places the unique application entry first while preserving all other pages' declared order. */
export function orderPages(pages: readonly VptPageOption[]): VptPageOption[] {
    const entries = pages.filter((page) => page.entry === true)
    if (entries.length > 1) {
        throw new Error(`Only one page may set entry: true. Received: ${entries.map((page) => page.path).join(', ')}`)
    }
    return [...entries, ...pages.filter((page) => page.entry !== true)]
}
