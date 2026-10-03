import Taro, { useRouter } from 'virtual:taro/api'
import { ShareElement, Text, View } from 'virtual:taro/components'
import { cards } from '../../cards.ts'
import RendererBadge from '../../renderer-badge.tsx'

export default function Detail() {
    const id = useRouter().params.id
    const card = cards.find((candidate) => candidate.id === id)

    if (!card) {
        return (
            <View className="page">
                <RendererBadge />
                <Text>Unknown tile: {id}</Text>
            </View>
        )
    }

    return (
        <View className="page detail">
            <RendererBadge />
            <View id="back" className="back" onClick={() => void Taro.navigateBack()}>
                <Text>← Back to the collection</Text>
            </View>
            <ShareElement mapkey={card.id} className="large-tile" rectTweenType="linear">
                <View className="tile-content" style={{ backgroundColor: card.color }}>
                    <Text className="tile-symbol">{card.symbol}</Text>
                </View>
            </ShareElement>
            <Text className="eyebrow">SAME KEY / NEW PLACE</Text>
            <Text className="heading">{card.title}</Text>
            <Text className="description">The same tile has a new home. Go back to watch it return.</Text>
            <Text className="footnote">Route query: id={id} · no selection store</Text>
        </View>
    )
}
