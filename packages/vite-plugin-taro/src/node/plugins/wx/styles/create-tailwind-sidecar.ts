import { readFile } from 'node:fs/promises'
import type { Plugin, ViteDevServer } from 'vite'

type TailwindSidecarApi = Readonly<{
    getTailwindRoots: () => ReadonlySet<string>
    transformTailwindRoot: (rootId: string) => Promise<string>
}>

/** Establishes the serve-only owner of Tailwind root regeneration. */
export function createTailwindSidecar(getTailwindRoots: () => ReadonlySet<string>): Plugin<TailwindSidecarApi> {
    // Vite assigns this once during serve configuration, before any later regeneration hook can request a root transform.
    let server: ViteDevServer

    return {
        name: 'vpt:wx-tailwind-sidecar',
        apply: 'serve',
        // Keep access to the live dependencies attached until the regeneration hook consumes them.
        api: {
            getTailwindRoots,
            transformTailwindRoot: (rootId) => transformTailwindRoot(server, rootId)
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

    /*
     * `weapp-vite-sidecar` is an upstream protocol marker, not a cache-busting nonce. `weapp-tailwindcss` detects the
     * query key, strips the complete query when resolving the physical CSS pipeline file, and excludes this synthetic
     * request from transformed-source candidate collection. That lets the request use the latest candidate state without
     * feeding its generated CSS back into Tailwind's source memory or replacing the real Rolldown graph module. The
     * descriptive `style` value is stable; upstream currently treats the presence of the query key as the contract.
     */
    const sidecarId = `${rootId}?weapp-vite-sidecar=style`

    const result = await server.environments.client.pluginContainer.transform(source, sidecarId)

    return result.code
}
