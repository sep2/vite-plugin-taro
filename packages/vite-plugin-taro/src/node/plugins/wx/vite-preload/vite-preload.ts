const vitePreloadHelperId = '\0vite/preload-helper.js'
const vitePreloadHelperSource = 'export const __vitePreload = (load) => load()'

/** Returns the preload-helper replacement. */
export function overrideVitePreload(id: string): string | undefined {
    if (id === vitePreloadHelperId) {
        return vitePreloadHelperSource
    }
}

/** Tests whether an ID is Vite's preload helper. */
export function isVitePreload(id: string): boolean {
    return id === vitePreloadHelperId
}
