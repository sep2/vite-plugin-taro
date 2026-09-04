import { useLaunch } from 'virtual:taro/api'
import { View } from 'virtual:taro/components'
import type { PropsWithChildren } from 'react'
import './app.css'
import { Footer } from './components/footer/footer.tsx'

function App({ children }: PropsWithChildren) {
    useLaunch(() => {
        console.log('App launched')
    })

    return (
        <View className="app-shell flex h-screen flex-col overflow-hidden bg-canvas bg-canvas-botanical text-foreground">
            {children}
            <Footer />
        </View>
    )
}

export default App
