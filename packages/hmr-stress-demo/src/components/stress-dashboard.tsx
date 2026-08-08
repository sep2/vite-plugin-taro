import { ScrollView, Text, View } from 'virtual:taro/components'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import ActivityGrid from './activity-grid.tsx'
import DashboardControls from './dashboard-controls.tsx'
import DeepChain from './deep-chain.tsx'
import DeepMarker from './deep-marker.tsx'
import { createStressTree } from './tree-model.ts'
import TreeNode from './tree-node.tsx'

type StressDashboardProps = Readonly<{
    navigation: ReactNode
    title: string
}>

export default function StressDashboard({ navigation, title }: StressDashboardProps) {
    const tree = useMemo(() => createStressTree(5, 3), [])
    // User-editable state proves that the root Fiber was retained across Page replacement.
    const [input, setInput] = useState('seed-000')
    // A visible monotonic state cell makes accidental remounts easy to detect.
    const [counter, setCounter] = useState(0)
    // Selection crosses every recursive TreeNode prop boundary and changes one deep leaf.
    const [selectedNodeId, setSelectedNodeId] = useState('0.0.0.0.0.0')
    // This changes layout classes across the complete native projection without changing its topology.
    const [dense, setDense] = useState(true)
    // The token is initialized exactly once per mount; any changed value proves state loss.
    const [mountToken] = useState(() => `${title}-${Date.now()}`)

    return (
        <View id="stress-dashboard" className={dense ? 'stress-dashboard stress-dashboard-dense' : 'stress-dashboard'}>
            <View className="stress-header">
                <View>
                    <Text className="stress-title">{title}</Text>
                    <Text className="stress-subtitle">364 recursive nodes · 243 stateful leaves · 96 grid cells</Text>
                </View>
                {navigation}
            </View>

            <DashboardControls
                counter={counter}
                dense={dense}
                input={input}
                onCounterChange={() => {
                    setCounter((value) => value + 1)
                }}
                onDenseChange={() => {
                    setDense((value) => !value)
                }}
                onInputChange={setInput}
            />

            <ScrollView scrollY className="stress-scroll">
                <View className="stress-section">
                    <Text className="stress-section-title">24-level marker chain</Text>
                    <DeepChain remainingDepth={24}>
                        <DeepMarker counter={counter} mountToken={mountToken} />
                    </DeepChain>
                </View>

                <View className="stress-section">
                    <Text className="stress-section-title">Recursive component graph</Text>
                    <TreeNode level={0} node={tree} selectedNodeId={selectedNodeId} onSelect={setSelectedNodeId} />
                </View>

                <View className="stress-section">
                    <Text className="stress-section-title">Stateful sibling grid</Text>
                    <ActivityGrid seed={counter} size={96} />
                </View>
            </ScrollView>
        </View>
    )
}
