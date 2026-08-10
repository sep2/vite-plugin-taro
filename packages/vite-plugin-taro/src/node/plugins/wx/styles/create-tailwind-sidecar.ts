import { readFile } from 'node:fs/promises'
import type { Plugin, ViteDevServer } from 'vite'
import { createTailwindSidecarId, extractViteCss } from './utils.ts'

type TailwindSidecarApi = Readonly<{
    getTailwindCss: () => ReadonlyMap<string, string>
    getTailwindRoots: () => ReadonlySet<string>
    transformTailwindRoot: (rootId: string) => Promise<string>
}>

/** Establishes the serve-only owner of Tailwind root regeneration. */
export function createTailwindSidecar(getTailwindRoots: () => ReadonlySet<string>): Plugin<TailwindSidecarApi> {
    // Vite assigns this once during serve configuration, before any later regeneration hook can request a root transform.
    let server: ViteDevServer

    // Root transforms are the sole writers. The live cache retains complete generated fragments for later WXSS composition.
    const tailwindCss = new Map<string, string>()

    return {
        name: 'vpt:wx-tailwind-sidecar',
        apply: 'serve',
        // Keep access to the live dependencies attached until the regeneration hook consumes them.
        api: {
            getTailwindCss: () => tailwindCss,
            getTailwindRoots,
            async transformTailwindRoot(rootId) {
                const css = await transformTailwindRoot(server, rootId)
                tailwindCss.set(rootId, css)
                return css
            }
        },
        configureServer(configuredServer) {
            server = configuredServer
        }
    }
}

/** Runs one physical Tailwind root through the existing Vite CSS pipeline without adding another graph source. */
async function transformTailwindRoot(server: ViteDevServer, rootId: string): Promise<string> {
    /*
     * The low-level plugin-container transform accepts code and an ID; unlike `transformRequest`, it does not load the file.
     * Read the already-discovered physical root here so CSS edits cannot leave a cached initial source behind. This read can
     * be removed if the sidecar later uses a Vite load-and-transform API, or if upstream exposes generation from a root ID
     * and owns current-source invalidation itself.
     */
    const source = await readFile(rootId, 'utf8')

    const sidecarId = createTailwindSidecarId(rootId)

    const result = await server.environments.client.pluginContainer.transform(source, sidecarId)

    return extractViteCss(result.code, rootId)
}
