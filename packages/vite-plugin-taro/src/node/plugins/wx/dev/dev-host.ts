import type { ViteDevServer } from 'vite'
import { createControlChannel } from './control.ts'
import { createWxDevEngine } from './dev-engine.ts'

export async function createDevHost(server: ViteDevServer): Promise<Readonly<{ close(): Promise<void> }>> {
    const devEngine = await createWxDevEngine({ server })
    createControlChannel(server)

    return {
        async close(): Promise<void> {
            await devEngine.close()
        }
    }
}
