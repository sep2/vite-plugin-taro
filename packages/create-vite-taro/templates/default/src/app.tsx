import { useLaunch } from 'virtual:taro/api'
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
        <>
            <Footer />
            {children}
        </>
    )
}

export default App
