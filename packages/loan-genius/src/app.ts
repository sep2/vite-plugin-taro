import Taro from 'virtual:taro'
import type { PropsWithChildren } from 'react'
import './app.css'

function App({ children }: PropsWithChildren) {
    Taro.useLaunch(() => {
        console.log('App Launch')
    })

    return children
}

export default App
