import type { PropsWithChildren } from 'react'
import Taro from 'vite-plugin-taro/taro'
import './app.css'

function App({ children }: PropsWithChildren) {
    Taro.useLaunch(() => {
        console.log('App Launch')
    })

    return children
}

export default App
