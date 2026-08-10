import type { Plugin, ViteDevServer } from 'vite'

type TailwindSidecarApi = Readonly<{
    getServer: () => ViteDevServer | undefined
    getTailwindRoots: () => ReadonlySet<string>
}>

/** Establishes the serve-only owner of Tailwind root regeneration. */
export function createTailwindSidecar(getTailwindRoots: () => ReadonlySet<string>): Plugin<TailwindSidecarApi> {
    // Vite provides the server once during serve configuration. The later regeneration hook will read this reference to run
    // synthetic root requests through the client environment's plugin container.
    let server: ViteDevServer | undefined

    return {
        name: 'vpt:wx-tailwind-sidecar',
        apply: 'serve',
        // Keep access to the live dependencies attached until the regeneration hook consumes them.
        api: {
            getServer: () => server,
            getTailwindRoots
        },
        configureServer(configuredServer) {
            server = configuredServer
        }
    }
}
