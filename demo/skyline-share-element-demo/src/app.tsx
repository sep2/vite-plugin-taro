import { View } from 'virtual:taro/components'
import type { PropsWithChildren } from 'react'
import './app.css'

export default function App({ children }: PropsWithChildren) {
    return <View className="app">{children}</View>
}
