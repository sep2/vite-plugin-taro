import { Button, Text, View } from 'virtual:taro/components'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import BenchmarkRow from '../../benchmark-row.tsx'
import { measureNativeUpdate } from '../../measure-native-update.ts'
import { queryNative } from '../../native.ts'
import type { UpdateMeasurement } from '../../update-measurement.ts'
import { type Action, initialState, reduceWorkload, type State, scenarios } from '../../workload.ts'

interface Pending {
    readonly start: number
    readonly resolve: (value: UpdateMeasurement) => void
    readonly reject: (error: Error) => void
}

/** Controls and automation share immutable transitions and the same native revision/layout query boundary. */
export default function Index() {
    const [state, setState] = useState(initialState)
    // Refs serialize external requests and retain the committed snapshot until native layout verification completes.
    const committed = useRef<State>(initialState)
    const pending = useRef<Pending | null>(null)

    const run = useCallback((action: Action, rowId: number | undefined): Promise<UpdateMeasurement> => {
        if (pending.current) {
            throw new Error('Benchmark actions must run sequentially.')
        }
        return new Promise((resolve, reject) => {
            pending.current = { start: wx.getPerformance().now(), resolve, reject }
            setState(reduceWorkload(committed.current, action, rowId))
        })
    }, [])

    const inspect = useCallback(async () => {
        const rows = await queryNative('>>> .benchmark-row', true)
        const expected = committed.current
        if (rows.length !== expected.rows.length) {
            throw new Error(`Native row count: ${rows.length}; expected ${expected.rows.length}`)
        }
        for (const [index, field] of rows.entries()) {
            const row = expected.rows[index]!
            if (field.id !== `row-${row.id}` || field.height <= 0) {
                throw new Error(`Native row mismatch at ${index}: ${JSON.stringify(field)}`)
            }
        }
        const selected = await queryNative('>>> .benchmark-row.selected', true)
        if (
            selected.length !== (expected.selected === null ? 0 : 1) ||
            (expected.selected !== null && selected[0]?.id !== `row-${expected.selected}`)
        ) {
            throw new Error('Native selection mismatch.')
        }
        return { count: rows.length, selected: expected.selected, revision: expected.revision, verified: true }
    }, [])

    useLayoutEffect(() => {
        committed.current = state
        const request = pending.current
        if (!request) {
            return
        }
        const commit = wx.getPerformance().now()
        measureNativeUpdate(request.start, commit, state.revision).then(
            (measurement) => {
                pending.current = null
                request.resolve(measurement)
            },
            (error: Error) => {
                pending.current = null
                request.reject(error)
            }
        )
    }, [state])

    useLayoutEffect(() => {
        const api = {
            run,
            inspect,
            async sample(id: string, warmups: number, repetitions: number) {
                const scenario = scenarios.find((item) => item.id === id)
                if (!scenario) {
                    throw new Error(`Unknown scenario: ${id}`)
                }
                // This local accumulator retains each measured sample and its completed native verification.
                const observations: {
                    measurement: UpdateMeasurement
                    verification: Awaited<ReturnType<typeof inspect>>
                }[] = []
                for (const index of Array.from({ length: warmups + repetitions }, (_, i) => i)) {
                    for (const action of scenario.setup) {
                        await run(action, undefined)
                    }
                    const result = await run(scenario.action, undefined)
                    const verification = await inspect()
                    if (index >= warmups) {
                        observations.push({ measurement: result, verification })
                    }
                }
                return {
                    id,
                    samples: observations.map((item) => item.measurement.duration),
                    measurements: observations.map((item) => item.measurement),
                    verification: observations.at(-1)?.verification,
                    renderer: __BENCHMARK_RENDERER__
                }
            }
        }
        getApp().benchmark = api
        return () => {
            delete getApp().benchmark
        }
    }, [run, inspect])

    const selectRow = useCallback(
        (id: number) => {
            void run('select', id)
        },
        [run]
    )
    const removeRow = useCallback(
        (id: number) => {
            void run('remove', id)
        },
        [run]
    )

    const controls: readonly [Action, string][] = [
        ['run', 'Create 1,000 rows'],
        ['runlots', 'Create 10,000 rows'],
        ['replace', 'Replace 1,000 rows'],
        ['add', 'Append 1,000 rows'],
        ['update', 'Update every 10th row'],
        ['swaprows', 'Swap rows'],
        ['clear', 'Clear']
    ]

    return (
        <View className="benchmark">
            <Text className="eyebrow">VPT · WX · {__BENCHMARK_RENDERER__}</Text>
            <View className="title">Keyed renderer benchmark</View>
            <View className="controls">
                {controls.map(([action, label]) => (
                    <Button
                        key={action}
                        id={action}
                        onClick={() => {
                            void run(action, undefined)
                        }}
                    >
                        {label}
                    </Button>
                ))}
            </View>
            <View id={`benchmark-state-${state.revision}`} className="benchmark-state">
                {state.rows.length} rows · revision {state.revision}
            </View>
            <View className="table">
                {state.rows.map((row) => (
                    <BenchmarkRow
                        key={row.id}
                        row={row}
                        selected={state.selected === row.id}
                        onSelect={selectRow}
                        onRemove={removeRow}
                    />
                ))}
            </View>
        </View>
    )
}
