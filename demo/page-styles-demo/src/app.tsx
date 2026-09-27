import { Text, View } from 'virtual:taro/components'
import type { PropsWithChildren } from 'react'
import StateCounter from './components/state-counter.tsx'
import './app.css'

export default function App({ children }: PropsWithChildren) {
    return (
        <View className="app-shell">
            <View id="app-banner" className="app-banner">
                <Text>App-owned styles: this banner stays green on every page.</Text>
                <StateCounter id="app-counter" label="App counter" />
            </View>
            {children}
        </View>
    )
}
