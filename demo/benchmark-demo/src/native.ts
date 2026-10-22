export interface NativeField {
    readonly id: string
    readonly width: number
    readonly height: number
}

interface Query {
    select(selector: string): Query
    selectAll(selector: string): Query
    fields(
        options: { id: boolean; rect: boolean; size: boolean },
        callback: (value: NativeField | NativeField[]) => void
    ): Query
    exec(): void
}

export interface BenchmarkApp {
    benchmark?: {
        run(action: import('./workload.ts').Action, rowId: number | undefined): Promise<unknown>
        sample(id: string, warmups: number, repetitions: number): Promise<unknown>
        inspect(): Promise<unknown>
    }
}

declare global {
    const __BENCHMARK_RENDERER__: 'dom' | 'template'
    function getApp(): BenchmarkApp
    const wx: {
        getPerformance(): { now(): number }
        nextTick(callback: () => void): void
        createSelectorQuery(): Query
        getSystemInfoSync(): { SDKVersion: string; platform: string; model: string; system: string; version: string }
    }
}

/** Read native geometry for revision and row validation in both renderer builds. */
export function queryNative(selector: string, all: boolean): Promise<NativeField[]> {
    return new Promise((resolve) => {
        const query = wx.createSelectorQuery()
        const selection = all ? query.selectAll(selector) : query.select(selector)
        selection
            .fields({ id: true, rect: true, size: true }, (value) => {
                resolve(Array.isArray(value) ? value : value ? [value] : [])
            })
            .exec()
    })
}
