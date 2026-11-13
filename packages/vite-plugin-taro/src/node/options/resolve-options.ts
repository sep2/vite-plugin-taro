import type { VptOptions } from '../../options.ts'
import { orderPages } from './order-pages.ts'

/** Resolves the shared options consumed by every target without mutating caller input. */
export function resolveOptions(input: VptOptions): VptOptions {
    return { ...input, pages: orderPages(input.pages) }
}
