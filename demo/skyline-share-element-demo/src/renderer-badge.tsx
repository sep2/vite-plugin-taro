import Taro, { useReady } from 'virtual:taro/api'
import { Text } from 'virtual:taro/components'
import { useState } from 'react'

export default function RendererBadge() {
    // Read the actual native engine after initial rendering; configuration alone cannot detect a WebView fallback on a phone.
    const [renderer, setRenderer] = useState('checking')
    useReady(() => {
        // Taro's public PageInstance type omits this native WX field, so narrow it at the platform boundary.
        const page = Taro.getCurrentInstance().page
        const nativeRenderer: unknown = page && Reflect.get(page, 'renderer')
        setRenderer(nativeRenderer === 'skyline' || nativeRenderer === 'webview' ? nativeRenderer : 'unknown')
    })

    return (
        <Text
            id="renderer-badge"
            className={`renderer-badge ${renderer === 'skyline' ? 'renderer-badge-skyline' : ''}`}
        >
            Renderer: {renderer}
        </Text>
    )
}
