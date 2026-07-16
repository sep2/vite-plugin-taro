const vitePreloadHelperId = '\0vite/preload-helper.js'
const wxPreloadHelperSource = 'export const __vitePreload = (load) => load()'

/** Replaces Vite's browser preload runtime while preserving the wrapped dynamic import and its result. */
export function loadWxPreloadHelper(id: string): string | undefined {
    if (id === vitePreloadHelperId) return wxPreloadHelperSource
}
