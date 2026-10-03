import Taro from 'virtual:taro/api'
import { ShareElement, Text, View } from 'virtual:taro/components'
import { useState } from 'react'
import { cards } from '../../cards.ts'
import RendererBadge from '../../renderer-badge.tsx'

export default function Gallery() {
    // This page-local counter makes retained React state observable after each native push/pop transition.
    const [visits, setVisits] = useState(0)

    return (
        <View className="page gallery">
            <RendererBadge />
            <Text className="eyebrow">SKYLINE / SHARED ELEMENTS</Text>
            <Text className="heading">A little leap.</Text>
            <Text className="description">Tap a tile. Watch it grow into the next page.</Text>
            <View className="cards">
                {cards.map((card) => (
                    <View
                        key={card.id}
                        id={`open-${card.id}`}
                        className="card"
                        onClick={() => {
                            setVisits((count) => count + 1)
                            void Taro.navigateTo({ url: `/pages/detail/detail?id=${card.id}` })
                        }}
                    >
                        <ShareElement mapkey={card.id} className="small-tile" rectTweenType="linear">
                            <View className="tile-content" style={{ backgroundColor: card.color }}>
                                <Text className="tile-symbol">{card.symbol}</Text>
                            </View>
                        </ShareElement>
                        <View className="card-label">
                            <Text className="card-title">{card.title}</Text>
                            <Text className="card-hint">Open shared-element detail →</Text>
                        </View>
                    </View>
                ))}
            </View>
            <Text id="visits" className="footnote">
                Opened {visits} times · list state survives navigation
            </Text>
        </View>
    )
}
