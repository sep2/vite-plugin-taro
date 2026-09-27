import { Text, View } from 'virtual:taro/components'

export default function RecursiveProbe({ depth, id }: { depth: number; id: string }) {
    if (depth === 0) {
        return (
            <View id={id} className="collision-card">
                <Text>Deep native component: this card must match the page color.</Text>
            </View>
        )
    }

    return (
        <View>
            <RecursiveProbe depth={depth - 1} id={id} />
        </View>
    )
}
