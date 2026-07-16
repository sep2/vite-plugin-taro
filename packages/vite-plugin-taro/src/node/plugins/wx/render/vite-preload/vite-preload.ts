const vitePreloadHelperId = '\0vite/preload-helper.js'
const wxPreloadHelperSource = 'export const __vitePreload = (load) => load()'

/** Returns the WX preload-helper replacement. */
export function overrideVitePreload(id: string): string | undefined {
    if (id === vitePreloadHelperId) {
        return wxPreloadHelperSource
    }
}

/** Tests whether an ID is Vite's preload helper. */
export function isVitePreload(id: string): boolean {
    return id === vitePreloadHelperId
}
