import type { ViteDevServer } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createWxDevEngine } from './dev-engine.ts'

export async function createDevHost(
    server: ViteDevServer,
    options: VitePluginTaroOptions
): Promise<Readonly<{ close(): Promise<void> }>> {
    const devEngine = await createWxDevEngine({ server, options })

    return {
        async close(): Promise<void> {
            await devEngine.close()
        }
    }
}
