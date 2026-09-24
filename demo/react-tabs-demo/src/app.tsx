import { useLaunch } from 'virtual:taro/api'
import { View } from 'virtual:taro/components'
import type { PropsWithChildren } from 'react'
import './app.css'
import BottomTabs from './components/bottom-tabs/bottom-tabs.tsx'

function App({ children }: PropsWithChildren) {
    useLaunch(() => {
        console.log('App launched')
    })

    return (
        <View className="app-shell flex h-screen flex-col overflow-hidden bg-canvas bg-canvas-botanical pb-[calc(4rem+env(safe-area-inset-bottom))] text-foreground">
            {children}
            <BottomTabs />
        </View>
    )
}

export default App
