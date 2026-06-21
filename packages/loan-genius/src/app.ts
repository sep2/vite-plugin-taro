import type { PropsWithChildren } from 'react'
import Taro from 'virtual:taro/api'
import './app.css'

function App({ children }: PropsWithChildren) {
    Taro.useLaunch(() => {
        console.log('App Launch')
    })

    return children
}

export default App
