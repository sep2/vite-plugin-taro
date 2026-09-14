import { Text, View } from 'virtual:taro/components'
import { useState } from 'react'

type StatefulLeafProps = Readonly<{
    nodeId: string
    score: number
    selected: boolean
    onSelect: (nodeId: string) => void
}>

export default function StatefulLeaf({ nodeId, score, selected, onSelect }: StatefulLeafProps) {
    // Every leaf owns independent Hook state so Refresh must preserve hundreds of state cells.
    const [pulse, setPulse] = useState(score % 7)

    return (
        <View
            className={selected ? 'stateful-leaf stateful-leaf-selected' : 'stateful-leaf'}
            onClick={() => {
                setPulse((value) => value + 1)
                onSelect(nodeId)
            }}
        >
            <Text className="stateful-leaf-label">{nodeId}</Text>
            <Text className="stateful-leaf-value">p{pulse}</Text>
        </View>
    )
}
