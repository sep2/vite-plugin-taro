import type { VptPageOption } from '../../../options.ts'

/** Ordered page metadata attached to the compiled application module. */
export const pageMetadataKey = 'vpt:pages'

declare module 'rolldown' {
    interface CustomPluginOptions {
        [pageMetadataKey]?: readonly VptPageOption[]
    }
}
