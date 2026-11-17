import { createServer } from 'vite'

const entryId = 'virtual:ps/entry'

type Props = Readonly<{ root: string }>

/** Creates a headless Vite dev server whose lifetime is owned by the caller. */
export async function createPageServer({ root }: Props): Promise<{ close(): Promise<void> }> {
    const server = await createServer({
        root,
        configFile: false,
        envDir: false,
        publicDir: false,
        appType: 'custom',
        logLevel: 'silent',
        optimizeDeps: { noDiscovery: true, include: [] },
        plugins: [
            {
                name: 'ps:entry',
                resolveId: (id) => (id === entryId ? `\0${id}` : undefined),
                load: (id) => (id === `\0${entryId}` ? "export default import.meta.glob('/src/**/*.tsx')" : undefined)
            }
        ],
        server: { middlewareMode: true, ws: false }
    })

    return { close: () => server.close() }
}
