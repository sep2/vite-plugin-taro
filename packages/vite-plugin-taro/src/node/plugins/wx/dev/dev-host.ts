import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'

export async function createDevHost(
    _server: ViteDevServer,
    _options: VitePluginTaroOptions
): Promise<{ close(): Promise<void> }> {
    return {
        async close(): Promise<void> {}
    }
}
