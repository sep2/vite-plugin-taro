import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'

export async function createDevHost(
    server: ViteDevServer,
    options: VitePluginTaroOptions
): Promise<{ close(): Promise<void> }> {
    return {
        async close(): Promise<void> {}
    }
}
