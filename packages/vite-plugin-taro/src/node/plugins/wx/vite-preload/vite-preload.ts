const vitePreloadHelperId = '\0vite/preload-helper.js'
const vitePreloadHelperSource = 'export const __vitePreload = (load) => load()'

/** Returns the preload-helper replacement. */
export function overrideVitePreload(): string {
    return vitePreloadHelperSource
}

/** Tests whether an ID is Vite's preload helper. */
export function isVitePreload(id: string): boolean {
    return id === vitePreloadHelperId
}
