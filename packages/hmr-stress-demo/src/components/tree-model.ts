export type StressNode = Readonly<{
    children: readonly StressNode[]
    id: string
    score: number
}>

/** Builds (breadth^(depth + 1) - 1) / (breadth - 1) immutable nodes in O(nodes) time and memory. */
export function createStressTree(depth: number, breadth: number): StressNode {
    function createNode(remainingDepth: number, path: string): StressNode {
        const children =
            remainingDepth === 0
                ? []
                : Array.from({ length: breadth }, (_, index) => createNode(remainingDepth - 1, `${path}.${index}`))

        return {
            children,
            id: path,
            score: path.split('.').reduce((sum, segment) => sum + Number(segment), remainingDepth)
        }
    }

    return createNode(depth, '0')
}
