import { Text, View } from 'virtual:taro/components'
import { memo, useCallback } from 'react'
import type { Row } from './workload.ts'

interface Props {
    readonly row: Row
    readonly selected: boolean
    readonly onSelect: (id: number) => void
    readonly onRemove: (id: number) => void
}

/** Stable row props preserve unchanged subtrees; handlers retain their identity across label and selection updates. */
function BenchmarkRow({ row, selected, onSelect, onRemove }: Props) {
    const select = useCallback(() => onSelect(row.id), [onSelect, row.id])
    const remove = useCallback(() => onRemove(row.id), [onRemove, row.id])

    return (
        <View id={`row-${row.id}`} className={`benchmark-row${selected ? ' selected' : ''}`}>
            <Text className="row-id">{row.id}</Text>
            <Text className="row-label" onClick={select}>
                {row.label}
            </Text>
            <Text className="row-remove" onClick={remove}>
                ×
            </Text>
        </View>
    )
}

export default memo(BenchmarkRow)
