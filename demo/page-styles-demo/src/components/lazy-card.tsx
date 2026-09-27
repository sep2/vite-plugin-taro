import { Text, View } from 'virtual:taro/components'
import StateCounter from './state-counter.tsx'
import './lazy-card.css'

export default function LazyCard() {
    return (
        <View id="red-lazy-card" className="lazy-card">
            <Text>Lazy CSS: this orange card belongs only to Red.</Text>
            <StateCounter id="red-lazy-counter" label="Lazy counter" />
        </View>
    )
}
