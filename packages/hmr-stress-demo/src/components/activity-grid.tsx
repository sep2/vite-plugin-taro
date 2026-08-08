import { Text, View } from 'virtual:taro/components'
import { useState } from 'react'

type MetricCellProps = Readonly<{
    index: number
    seed: number
}>

function MetricCell({ index, seed }: MetricCellProps) {
    // The grid adds another independent bank of stateful siblings beside the recursive tree.
    const [value, setValue] = useState((index * 17 + seed) % 101)

    return (
        <View
            className="metric-cell"
            onClick={() => {
                setValue((current) => (current + 13) % 101)
            }}
        >
            <Text className="metric-cell-index">{index}</Text>
            <Text className="metric-cell-value">{value}</Text>
        </View>
    )
}

type Metric = Readonly<{
    id: string
    index: number
}>

function createMetrics(size: number): readonly Metric[] {
    return Array.from({ length: size }, (_, index) => ({
        id: `metric-${index}`,
        index
    }))
}

type ActivityGridProps = Readonly<{
    seed: number
    size: number
}>

export default function ActivityGrid({ seed, size }: ActivityGridProps) {
    const metrics = createMetrics(size)

    return (
        <View id="activity-grid" className="activity-grid">
            {metrics.map((metric) => (
                <MetricCell key={metric.id} index={metric.index} seed={seed} />
            ))}
        </View>
    )
}
