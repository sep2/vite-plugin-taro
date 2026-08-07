import { useLaunch } from 'virtual:taro/api'
import type { PropsWithChildren } from 'react'
import './app.css'

export default function App({ children }: PropsWithChildren) {
    useLaunch(() => {
        console.log('Towxml stream demo launched')
    })

    return children
}
