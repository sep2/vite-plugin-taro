import type { Plugin } from 'vite'

type TailwindSidecarApi = Readonly<{
    getTailwindRoots: () => ReadonlySet<string>
}>

/** Establishes the serve-only owner of Tailwind root regeneration. */
export function createTailwindSidecar(getTailwindRoots: () => ReadonlySet<string>): Plugin<TailwindSidecarApi> {
    return {
        name: 'vpt:wx-tailwind-sidecar',
        apply: 'serve',
        // Keep access to the live read-only registry attached until the regeneration hook consumes it.
        api: { getTailwindRoots }
    }
}
