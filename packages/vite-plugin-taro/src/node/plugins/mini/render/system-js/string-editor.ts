/** One half-open source range; omitted ranges also own insertions at both boundaries. */
type SourceRange = Readonly<{ start: number; end: number }>

/** One half-open source range replaced atomically during rendering. */
type Replacement = SourceRange & Readonly<{ content: string }>

/** Append-only journals; prepend calls are reversed once when the edit plan is compiled. */
type Insertions = Readonly<{
    append: string[]
    prepend: string[]
}>

type Insertion = Readonly<{ start: number; content: string }>
type EditPlan = Readonly<{
    original: string
    replacements: readonly Replacement[]
    insertions: readonly Insertion[]
}>

/**
 * Collects range edits, then compiles one immutable, source-ordered plan for every rendered view.
 *
 * Final Mini Program development chunks do not request source maps. Hoisted functions and the remaining module body
 * are disjoint views of the same plan, rather than repeated scans/sorts followed by destructive function removals.
 *
 * For E edits and F hoisted functions, compilation costs O(E log E) plus insertion text assembly. Each view uses binary
 * searches followed by forward-only cursors over its edits. Rendering all functions and the remaining body costs
 * O(E + F log E + output characters); views never scan the complete insertion journal per replacement or function.
 * Storage is O(E + inserted text) plus rendered output, owned by this compilation only.
 */
export class StringEditor {
    readonly original: string
    // Only collection mutates these journals. compile() snapshots them so rendering needs no cache or invalidation state.
    readonly #insertions = new Map<number, Insertions>()
    readonly #replacements: Replacement[] = []

    constructor(original: string) {
        this.original = original
    }

    /** Records a replacement, including empty replacements for removed import declarations. */
    overwrite(start: number, end: number, content: string): void {
        this.#replacements.push({ content, end, start })
    }

    /** Records prepend order in O(1), avoiding unshift's repeated movement of earlier insertions. */
    prependLeft(position: number, content: string): void {
        this.#insertionAt(position).prepend.push(content)
    }

    appendLeft(position: number, content: string): void {
        this.#insertionAt(position).append.push(content)
    }

    /** Matches the subset of appendRight ordering used by the capsule compiler. */
    appendRight(position: number, content: string): void {
        this.#insertionAt(position).append.push(content)
    }

    /** Sorts once after semantic edits finish; all function/body views share this immutable snapshot. */
    compile() {
        const plan: EditPlan = {
            original: this.original,
            replacements: this.#replacements.toSorted(
                (left, right) => left.start - right.start || right.end - left.end
            ),
            insertions: [...this.#insertions]
                .sort(([left], [right]) => left - right)
                .map(([start, insertions]) => ({
                    start,
                    content: insertions.prepend.toReversed().join('') + insertions.append.join('')
                }))
        }
        return {
            /** Includes boundary insertions so relocated functions keep every edit they own. */
            render: (start: number, end: number): string => renderRange(plan, start, end, true, true),
            /** Ranges must be disjoint and in source order, as direct Program function declarations are. */
            renderOutside: (ranges: readonly SourceRange[]): string => renderOutside(plan, ranges)
        }
    }

    #insertionAt(position: number): Insertions {
        const existing = this.#insertions.get(position)
        if (existing) {
            return existing
        }
        // Each boundary owns mutable append-only lists until compile() assembles their final insertion order.
        const created = { append: [], prepend: [] }
        this.#insertions.set(position, created)
        return created
    }
}

/** Renders only the gaps between hoisted ranges, excluding their boundary insertions without deleting any edits. */
function renderOutside(plan: EditPlan, ranges: readonly SourceRange[]): string {
    // These local output pieces and the gap cursor advance once through source-ordered declarations.
    const output: string[] = []
    let start = 0
    let includeStart = true
    for (const range of ranges) {
        output.push(renderRange(plan, start, range.start, includeStart, false))
        start = range.end
        includeStart = false
    }
    output.push(renderRange(plan, start, plan.original.length, includeStart, true))
    return output.join('')
}

/** Binary searches once per journal, then merges only the edits within this view. */
function renderRange(plan: EditPlan, start: number, end: number, includeStart: boolean, includeEnd: boolean): string {
    // Both cursors advance monotonically; replaced source suppresses its interior insertions and nested replacements.
    let sourcePosition = start
    let insertionIndex = lowerBound(plan.insertions, start)
    const output: string[] = []
    const appendOriginal = (until: number, includeUntil: boolean): void => {
        while (insertionIndex < plan.insertions.length) {
            const insertion = plan.insertions[insertionIndex]
            if (insertion.start > until || (insertion.start === until && !includeUntil)) {
                break
            }
            insertionIndex++
            if (insertion.start < sourcePosition || (insertion.start === start && !includeStart)) {
                continue
            }
            output.push(plan.original.slice(sourcePosition, insertion.start), insertion.content)
            sourcePosition = insertion.start
        }
        output.push(plan.original.slice(sourcePosition, until))
        sourcePosition = until
    }

    // Start at this view's first possible replacement instead of filtering the complete module journal.
    for (let index = lowerBound(plan.replacements, start); index < plan.replacements.length; index++) {
        const replacement = plan.replacements[index]
        if (replacement.start >= end) {
            break
        }
        if (replacement.end > end || replacement.end <= sourcePosition) {
            continue
        }
        if (replacement.start < sourcePosition) {
            throw new Error(`Partially overlapping source edits at ${replacement.start}:${replacement.end}`)
        }
        appendOriginal(replacement.start, false)
        output.push(replacement.content)
        sourcePosition = replacement.end
    }
    appendOriginal(end, includeEnd)
    return output.join('')
}

/** First edit whose source start is at or after the requested boundary. */
function lowerBound(edits: readonly Readonly<{ start: number }>[], position: number): number {
    // This local half-open search window shrinks on every iteration, independent of the number of other rendered views.
    let low = 0
    let high = edits.length
    while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (edits[middle].start < position) {
            low = middle + 1
        } else {
            high = middle
        }
    }
    return low
}
