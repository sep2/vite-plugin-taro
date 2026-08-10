import { isCSSRequest } from 'vite'

const nonRuntimeStyleQueries = ['direct', 'inline', 'inline-css', 'raw', 'style-attr', 'transform-only', 'url'] as const

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

/** Selects imported style modules whose Vite development output owns a runtime CSS payload. */
export function isGlobalStyleRequest(id: string): boolean {
    if (!isCSSRequest(id)) {
        return false
    }

    const queryStart = id.indexOf('?')
    if (queryStart < 0) {
        return true
    }

    const fragmentStart = id.indexOf('#', queryStart)
    const query = id.slice(queryStart + 1, fragmentStart < 0 ? undefined : fragmentStart)
    const parameters = new URLSearchParams(query)

    return (
        !parameters.has('weapp-vite-sidecar') && nonRuntimeStyleQueries.every((parameter) => !parameters.has(parameter))
    )
}

/** Collects cached styles in deterministic dependency-evaluation order across all application entries. */
export function collectOrderedStyleIds(
    entryIds: readonly string[],
    getModuleInfo: (
        moduleId: string
    ) => Readonly<{ importedIds: readonly string[]; dynamicallyImportedIds: readonly string[] }> | null,
    toStyleId: (moduleId: string) => string | undefined
): string[] {
    // These local sets make graph traversal O(modules + edges) and collapse both module cycles and shared style ownership.
    const visitedModuleIds = new Set<string>()
    const visitedStyleIds = new Set<string>()
    const styleIds: string[] = []

    const visit = (moduleId: string): void => {
        if (visitedModuleIds.has(moduleId)) {
            return
        }
        visitedModuleIds.add(moduleId)

        const moduleInfo = getModuleInfo(moduleId)
        if (!moduleInfo) {
            return
        }

        moduleInfo.importedIds.forEach(visit)
        moduleInfo.dynamicallyImportedIds.forEach(visit)

        const styleId = toStyleId(moduleId)
        if (styleId && !visitedStyleIds.has(styleId)) {
            visitedStyleIds.add(styleId)
            styleIds.push(styleId)
        }
    }

    entryIds.forEach(visit)
    return styleIds
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
