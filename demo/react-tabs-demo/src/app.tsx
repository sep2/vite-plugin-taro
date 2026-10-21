import { useLaunch } from 'virtual:taro/api'
import type { PropsWithChildren } from 'react'
import './app.css'

function App({ children }: PropsWithChildren) {
    useLaunch(() => {
        console.log('App launched')
    })

    return children
}

export default App
