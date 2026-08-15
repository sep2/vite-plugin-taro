import { isCSSRequest } from 'vite'
import { normalizeModuleId } from '../../../utils/modules.ts'

const nonRuntimeStyleQueries = ['direct', 'inline', 'inline-css', 'raw', 'style-attr', 'transform-only', 'url'] as const

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

    return nonRuntimeStyleQueries.every((parameter) => !parameters.has(parameter))
}

/**
 * Creates the ordered style plan for one completed HMR transaction.
 *
 * `entryIds` carries semantic cascade ownership from the WX resolver: the App capsule first, followed by Page capsules in
 * configured route order. Each entry is traversed depth-first. Static imports retain source order and precede dynamic imports;
 * dynamic branches are included because WX cannot inject lazy CSS at browser runtime. A style follows its dependencies,
 * matching evaluation order.
 *
 * Graph IDs may contain queries while `hasStyle` reads physical IDs. Normalization lets aliases share one captured style.
 * JavaScript and non-runtime CSS requests remain traversal nodes but do not enter the plan. All mutable traversal state is
 * transaction-local, so import additions and removals need no invalidation bookkeeping. Complexity is O(modules + edges),
 * with O(modules + styles) temporary memory.
 */
export function createGraphStylePlan(
    entryIds: readonly string[],
    getModuleInfo: (
        moduleId: string
    ) => Readonly<{ importedIds: readonly string[]; dynamicallyImportedIds: readonly string[] }> | null,
    hasStyle: (styleId: string) => boolean
): readonly string[] {
    // These local collections collapse cycles, shared modules, and aliases without retaining derived topology between batches.
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

        const styleId = normalizeModuleId(moduleId)
        if (hasStyle(styleId) && !visitedStyleIds.has(styleId)) {
            visitedStyleIds.add(styleId)
            styleIds.push(styleId)
        }
    }

    entryIds.forEach(visit)
    return styleIds
}

/** Renders one immutable graph style plan. */
export function composeGraphStyleCss(styleIds: readonly string[], getStyleCss: (styleId: string) => string): string {
    return styleIds.map(getStyleCss).join('\n')
}

/**
 * Extracts Vite's final CSS payload from the development module without evaluating its browser HMR code.
 *
 * Remove this parser when Vite exposes a supported plugin-container API that returns final CSS directly. Until then the
 * transformed development request is a JavaScript style module, so this function isolates Vite's `__vite__css` contract.
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
