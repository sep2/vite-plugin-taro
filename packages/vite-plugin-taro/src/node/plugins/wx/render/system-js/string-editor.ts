/** One half-open source range replaced atomically during rendering. */
type Replacement = Readonly<{
    content: string
    end: number
    start: number
}>

/** Ordered zero-width edits attached to one source boundary. */
type Insertions = Readonly<{
    append: string[]
    prepend: string[]
}>

/**
 * Records non-overlapping range edits and renders them in one source-order pass.
 *
 * Final WX development chunks do not request source maps. RolldownMagicString's repeated relocation of hundreds of hoisted
 * functions is considerably more expensive than the semantic analysis itself, so this editor keeps the same range operations
 * while avoiding a mutable chunk graph when no mappings can be observed.
 */
export class StringEditor {
    readonly original: string
    // These journals are the editor's intentionally mutable transaction; rendering reads but never changes them.
    readonly #insertions = new Map<number, Insertions>()
    readonly #replacements: Replacement[] = []

    constructor(original: string) {
        this.original = original
    }

    /** Records a half-open replacement; semantic passes guarantee ranges are nested or disjoint. */
    overwrite(start: number, end: number, content: string): void {
        this.#replacements.push({ content, end, start })
    }

    /** Removes a range and discards insertions that were owned only by that removed source. */
    remove(start: number, end: number): void {
        this.overwrite(start, end, '')
        // Removed ranges own their boundary insertions; hoisted function text has already rendered those edits separately.
        for (const position of this.#insertions.keys()) {
            if (position >= start && position <= end) this.#insertions.delete(position)
        }
    }

    /** Inserts before prior insertions at a boundary, matching MagicString's prependLeft ordering. */
    prependLeft(position: number, content: string): void {
        const insertions = this.#insertionAt(position)
        insertions.prepend.unshift(content)
    }

    /** Inserts after prior insertions at the left side of a boundary. */
    appendLeft(position: number, content: string): void {
        const insertions = this.#insertionAt(position)
        insertions.append.push(content)
    }

    /** Matches the subset of appendRight ordering used by the capsule compiler. */
    appendRight(position: number, content: string): void {
        const insertions = this.#insertionAt(position)
        insertions.append.push(content)
    }

    /** Materializes one source slice without mutating its edit journal, allowing functions to be rendered before relocation. */
    render(start: number, end: number): string {
        const replacements = this.#replacements
            .filter((replacement) => replacement.start >= start && replacement.end <= end)
            .sort((left, right) => left.start - right.start || right.end - left.end)
        // The cursor advances monotonically; outer removals dominate nested edits when hoisted function ranges are removed.
        let sourcePosition = start
        let output = ''

        for (const replacement of replacements) {
            if (replacement.end <= sourcePosition) continue
            if (replacement.start < sourcePosition) {
                throw new Error(`Partially overlapping source edits at ${replacement.start}:${replacement.end}`)
            }
            output += this.#renderOriginal(sourcePosition, replacement.start, false)
            output += replacement.content
            sourcePosition = replacement.end
        }

        output += this.#renderOriginal(sourcePosition, end, true)
        return output
    }

    #insertionAt(position: number): { append: string[]; prepend: string[] } {
        const existing = this.#insertions.get(position)
        if (existing) return existing
        // Each position owns mutable ordered lists because prependLeft reverses calls while appendRight preserves them.
        const created = { append: [], prepend: [] }
        this.#insertions.set(position, created)
        return created
    }

    #renderOriginal(start: number, end: number, includeEnd: boolean): string {
        const positions = [...this.#insertions.keys()]
            .filter((position) => position >= start && (position < end || (includeEnd && position === end)))
            .sort((left, right) => left - right)
        // Segment rendering appends immutable source slices around the small ordered insertion set.
        let sourcePosition = start
        let output = ''
        for (const position of positions) {
            output += this.original.slice(sourcePosition, position)
            output += this.#renderInsertions(position)
            sourcePosition = position
        }
        output += this.original.slice(sourcePosition, end)
        return output
    }

    #renderInsertions(position: number): string {
        // Callers enumerate this map's keys, so the matching insertion journal is guaranteed to exist.
        const insertions = this.#insertions.get(position) as Insertions
        return `${insertions.prepend.join('')}${insertions.append.join('')}`
    }
}
