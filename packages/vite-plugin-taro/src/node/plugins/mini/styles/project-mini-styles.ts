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
 * Projects native CSS according to build.cssCodeSplit. Split output preserves each Page's dependency-first cascade;
 * combined output traverses App then configured Pages once, deduplicating shared CSS in the global stylesheet.
 * Page companions stay empty in combined output. Both policies share one union of surviving Tailwind candidates.
 *
 * Split work is O(sum(Vᵢ + Eᵢ + Bᵢ + Cᵢ)) across roots. Combined work is O(V + E + B + C + P), where P is the Page count.
 * All visited/style collections are transaction-local, so cycles terminate and graph removals need no retained cache.
 */
export function projectMiniStyles(
    entries: MiniEntries,
    styleByModuleId: ReadonlyMap<string, StyleSource>,
    context: ModuleGraph,
    cssCodeSplit: boolean
) {
    const appRoots = cssCodeSplit
        ? [entries.appEntries.capsuleId]
        : [entries.appEntries.capsuleId, ...entries.pageEntries.map((entry) => entry.capsuleId)]
    const appEntries = {
        ...entries.appEntries,
        ...projectStyles(appRoots, new Set<string>(), styleByModuleId, context)
    }
    const appStyleIds = new Set(appEntries.styles.keys())
    const pageEntries = entries.pageEntries.map((entry) => ({
        ...entry,
        ...projectStyles(cssCodeSplit ? [entry.capsuleId] : [], appStyleIds, styleByModuleId, context)
    }))

    // This transaction-local union keeps shared JavaScript consistent with every App/Page stylesheet.
    const classSet = new Set(appEntries.classSet)
    for (const page of pageEntries) {
        for (const candidate of page.classSet) {
            classSet.add(candidate)
        }
    }

    return { appEntries, pageEntries, classSet }
}

/** Traverses an ordered set of capsules without pruning dependency edges of excluded App-owned stylesheets. */
function projectStyles(
    roots: readonly string[],
    appStyleIds: ReadonlySet<string>,
    styleByModuleId: ReadonlyMap<string, StyleSource>,
    context: ModuleGraph
) {
    // This projection-local set terminates cycles and deduplicates exact module identities, including route/query variants.
    const visitedModuleIds = new Set<string>()
    // This projection-local map deduplicates physical styles and retains their dependency-first cascade order.
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

    roots.forEach(visit)
    return summarizeStyles(styles)
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
