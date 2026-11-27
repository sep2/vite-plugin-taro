import type { Rolldown } from 'vite'

/** UTF-8 bytes of the native stylesheet emitted beside this Page shell. */
export const pageStyleBytesKey = 'vpt:page-style-bytes'

/** Modules without a page stylesheet contribute no stylesheet bytes to placement. */
export function getPageStyleBytes(meta: Rolldown.CustomPluginOptions | undefined): number {
    return meta?.[pageStyleBytesKey] ?? 0
}

declare module 'rolldown' {
    interface CustomPluginOptions {
        [pageStyleBytesKey]?: number
    }
}
