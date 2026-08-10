/**
 * Creates an auxiliary style request without replacing the physical Rolldown graph module.
 *
 * `weapp-vite-sidecar` is an upstream protocol marker, not a cache-busting nonce. `weapp-tailwindcss` detects the query
 * key, strips the complete query when resolving the physical CSS pipeline file, and excludes this synthetic request from
 * transformed-source candidate collection. That lets the request use the latest candidate state without feeding generated
 * CSS back into Tailwind's source memory. The descriptive `style` value is stable; upstream treats the presence of the key
 * as the protocol contract.
 */
export function createTailwindSidecarId(rootId: string): string {
    return `${rootId}?weapp-vite-sidecar=style`
}

/**
 * Extracts Vite's final CSS payload from the development module without evaluating its browser HMR code.
 *
 * Remove this parser when either Vite exposes a supported plugin-container API that returns final CSS directly, or
 * `weapp-tailwindcss` exposes generated root CSS after candidate updates. Until then the sidecar receives Vite's JavaScript
 * style module, so this function isolates the version-specific `__vite__css` serialization contract.
 */
export function extractViteCss(moduleCode: string, rootId: string): string {
    const assignmentPrefix = 'const __vite__css = '
    const assignmentStart = moduleCode.indexOf(assignmentPrefix)
    if (assignmentStart < 0) {
        throw new Error(`Vite CSS transform for ${rootId} did not expose __vite__css`)
    }

    // Vite serializes the payload with JSON.stringify on one assignment line. Parse that literal so quotes, escapes, and
    // embedded CSS newlines are decoded by JSON rather than by a second, subtly different unescaping implementation.
    const valueStart = assignmentStart + assignmentPrefix.length
    const lineEnd = moduleCode.indexOf('\n', valueStart)
    const serializedCss = moduleCode.slice(valueStart, lineEnd < 0 ? moduleCode.length : lineEnd)
    const css: unknown = JSON.parse(serializedCss)
    if (typeof css !== 'string') {
        throw new Error(`Vite CSS transform for ${rootId} exposed a non-string __vite__css value`)
    }

    return css
}
