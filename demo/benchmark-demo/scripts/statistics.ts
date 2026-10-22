export interface Distribution {
    readonly count: number
    readonly median: number
    readonly p95: number
    readonly min: number
    readonly max: number
}

/** Nearest-rank p95 and the midpoint median; all raw samples are retained separately. */
export function summarize(samples: readonly number[]): Distribution {
    if (samples.length === 0 || samples.some((value) => !Number.isFinite(value) || value < 0)) {
        throw new Error('Samples must be finite, nonnegative milliseconds.')
    }
    const sorted = samples.toSorted((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return {
        count: sorted.length,
        median: sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!,
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
        min: sorted[0]!,
        max: sorted[sorted.length - 1]!
    }
}

export function geometricMean(values: readonly number[]): number {
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw new Error('Ratios must be finite and positive.')
    }
    return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length)
}
