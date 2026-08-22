import { useLaunch } from 'virtual:taro/api'
import { View } from 'virtual:taro/components'
import type { PropsWithChildren } from 'react'
import './app.css'
import { Footer } from './components/footer/footer.tsx'
import { initNavigationBar } from './components/navigation-bar/use-navigation-bar.ts'

function App({ children }: PropsWithChildren) {
    useLaunch(() => {
        console.log('App launched')
        initNavigationBar()
    })

    return (
        <View className="app-shell flex h-screen flex-col overflow-hidden bg-canvas bg-canvas-botanical text-foreground">
            {/* H5 requires the routed Page to remain the final child; flex order still places Footer below it. */}
            <Footer />
            <>{children}</>
        </View>
    )
}

export default App
