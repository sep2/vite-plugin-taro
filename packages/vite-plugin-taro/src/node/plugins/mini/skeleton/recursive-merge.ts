type MergeRecord = Record<string, unknown>

/**
 * Recursively merges sources into the retained target used by Taro's template generator.
 *
 * The target and its existing nested records are intentionally mutated because Taro retains their references. Matching arrays
 * are concatenated, matching records are merged recursively, and all other source values replace their target values.
 */
export function recursiveMerge<T extends MergeRecord>(
    target: T,
    ...sources: ReadonlyArray<MergeRecord | undefined>
): T {
    for (const source of sources) {
        if (source !== undefined) {
            mergeRecord(target, source)
        }
    }
    return target
}

function mergeRecord(target: MergeRecord, source: MergeRecord): void {
    for (const key in source) {
        const sourceValue = source[key]
        const targetValue = target[key]
        if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
            target[key] = targetValue.concat(sourceValue)
            continue
        }
        if (isMergeRecord(targetValue) && isMergeRecord(sourceValue)) {
            mergeRecord(targetValue, sourceValue)
            continue
        }
        target[key] = cloneMergeValue(sourceValue)
    }
}

function cloneMergeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        // The clone and loop cursor are intentionally local mutable state used to avoid callback and iterator allocations.
        const clone = new Array<unknown>(value.length)
        for (let index = 0; index < value.length; index += 1) {
            clone[index] = cloneMergeValue(value[index])
        }
        return clone
    }
    if (isMergeRecord(value)) {
        // The fresh record is populated in place so source records never become mutable target state.
        const clone: MergeRecord = {}
        mergeRecord(clone, value)
        return clone
    }
    return value
}

function isMergeRecord(value: unknown): value is MergeRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
