import { normalizeModuleId } from '../../../utils/modules.ts'
import type { createResolver } from '../resolve/resolver.ts'

type MiniEntries = ReturnType<typeof createResolver>['entries']

/** Projection needs captured CSS and candidates, not the retained compiler or its invalidation state. */
type StyleSource = Readonly<{
    css: string | undefined
    tailwind: Readonly<{ classSet: ReadonlySet<string> }> | undefined
}>

/** Read only current import edges while retaining the caller's graph context. */
type ModuleGraph = Readonly<{
    getModuleInfo: (id: string) => Readonly<{
        importedIds: readonly string[]
        dynamicallyImportedIds: readonly string[]
    }> | null
}>

/** A physical stylesheet that survived both graph reachability and App ownership filtering. */
type ProjectedStyle = Readonly<{
    css: string
    classSet: ReadonlySet<string> | undefined
}>

/**
 * Projects App-owned CSS and each Page's remaining CSS in dependency-first order. Shared Page styles remain in every
 * consuming Page rather than becoming global. One union of all surviving candidates gives every JavaScript artifact
 * the same class identities as the separately emitted stylesheets, without a second graph traversal.
 *
 * Each root has its own visited set: cycles terminate without one Page suppressing another Page's styles or cascade order.
 * Work is O(sum(Vᵢ + Eᵢ + Bᵢ + Cᵢ)) over each root's reachable modules, edges, projected CSS bytes and candidates; shared
 * subgraphs are revisited per root. All projection state is transaction-local, so graph removals need no retained cache.
 */
export function projectMiniStyles(
    entries: MiniEntries,
    styleByModuleId: ReadonlyMap<string, StyleSource>,
    context: ModuleGraph
) {
    const appEntries = projectEntry(entries.appEntries, new Set<string>(), styleByModuleId, context)
    const appStyleIds = new Set(appEntries.styles.keys())
    const pageEntries = entries.pageEntries.map((entry) => projectEntry(entry, appStyleIds, styleByModuleId, context))

    // This transaction-local union keeps shared JavaScript consistent with every App/Page stylesheet.
    const classSet = new Set(appEntries.classSet)
    for (const page of pageEntries) {
        for (const candidate of page.classSet) {
            classSet.add(candidate)
        }
    }

    return { appEntries, pageEntries, classSet }
}

/** Traverses one capsule without pruning dependency edges of an excluded App-owned stylesheet. */
function projectEntry(
    entry: MiniEntries['appEntries'],
    appStyleIds: ReadonlySet<string>,
    styleByModuleId: ReadonlyMap<string, StyleSource>,
    context: ModuleGraph
) {
    // This root-local set terminates cycles and deduplicates exact module identities, including route/query variants.
    const visitedModuleIds = new Set<string>()
    // This root-local map deduplicates physical styles and retains their dependency-first cascade order.
    const styles = new Map<string, ProjectedStyle>()

    const visit = (moduleId: string): void => {
        if (visitedModuleIds.has(moduleId)) {
            return
        }
        visitedModuleIds.add(moduleId)

        const moduleInfo = context.getModuleInfo(moduleId)
        if (!moduleInfo) {
            return
        }
        moduleInfo.importedIds.forEach(visit)
        moduleInfo.dynamicallyImportedIds.forEach(visit)

        const styleId = normalizeModuleId(moduleId)
        const style = styleByModuleId.get(styleId)
        if (style?.css === undefined || appStyleIds.has(styleId) || styles.has(styleId)) {
            return
        }
        styles.set(styleId, { css: style.css, classSet: style.tailwind?.classSet })
    }

    visit(entry.capsuleId)
    return { ...entry, ...summarizeStyles(styles) }
}

/** Joins an ordered physical-style selection with precisely its surviving Tailwind candidates. */
function summarizeStyles(styles: ReadonlyMap<string, ProjectedStyle>) {
    // These local accumulators materialize one stylesheet and its matching candidate union without sorting the cascade.
    const css: string[] = []
    const classSet = new Set<string>()
    for (const style of styles.values()) {
        css.push(style.css)
        style.classSet?.forEach((candidate) => {
            classSet.add(candidate)
        })
    }
    return { styles, css: css.join('\n'), classSet }
}
