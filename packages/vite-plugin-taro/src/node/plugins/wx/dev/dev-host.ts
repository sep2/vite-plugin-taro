import type { ViteDevServer } from 'vite'

export async function createDevHost(server: ViteDevServer): Promise<Readonly<{ close(): Promise<void> }>> {
    return {
        async close(): Promise<void> {}
    }
}
