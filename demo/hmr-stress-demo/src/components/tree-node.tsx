import { Text, View } from 'virtual:taro/components'
import StatefulLeaf from './stateful-leaf.tsx'
import type { StressNode } from './tree-model.ts'

type TreeNodeProps = Readonly<{
    level: number
    node: StressNode
    selectedNodeId: string
    onSelect: (nodeId: string) => void
}>

export default function TreeNode({ level, node, selectedNodeId, onSelect }: TreeNodeProps) {
    const isLeaf = node.children.length === 0

    return (
        <View id={level === 0 ? 'stress-tree-root' : undefined} className="tree-node">
            <View className="tree-node-header">
                <Text className="tree-node-path">{node.id}</Text>
                <Text className="tree-node-score">s{node.score}</Text>
            </View>
            {isLeaf ? (
                <StatefulLeaf
                    nodeId={node.id}
                    score={node.score}
                    selected={selectedNodeId === node.id}
                    onSelect={onSelect}
                />
            ) : (
                <View className="tree-node-children">
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.id}
                            level={level + 1}
                            node={child}
                            selectedNodeId={selectedNodeId}
                            onSelect={onSelect}
                        />
                    ))}
                </View>
            )}
        </View>
    )
}
