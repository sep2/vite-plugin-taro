import { Text, View } from 'virtual:taro/components'
import { hmrMarker } from './hmr-marker.ts'

type DeepMarkerProps = Readonly<{
    counter: number
    mountToken: string
}>

export default function DeepMarker({ counter, mountToken }: DeepMarkerProps) {
    return (
        <View className="deep-marker-card">
            <Text id="hmr-marker" className="deep-marker-title">
                marker:{hmrMarker}
            </Text>
            <Text id="state-value" className="deep-marker-state">
                counter:{counter}
            </Text>
            <Text id="mount-token" className="deep-marker-token">
                mount:{mountToken}
            </Text>
        </View>
    )
}
