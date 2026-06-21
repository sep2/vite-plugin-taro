import { useLaunch } from 'virtual:taro/api'
import type { PropsWithChildren } from 'react'
import './app.css'
import { initNavigationBar } from './components/navigation-bar/use-navigation-bar.ts'

function App({ children }: PropsWithChildren) {
    useLaunch(() => {
        console.log('App launched')
        initNavigationBar()
    })

    return children
}

export default App
