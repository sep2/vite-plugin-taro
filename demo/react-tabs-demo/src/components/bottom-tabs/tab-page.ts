import Taro, { useDidShow } from 'virtual:taro/api'

const tabPageShowEvent = 'vpt:tab-page-show'

// Page onShow can run before the shared App bar subscribes; retain the latest route for late subscribers.
let lastShownPath: string | undefined

export function useTabPage(path: string) {
    useDidShow(() => {
        lastShownPath = path
        Taro.eventCenter.trigger(tabPageShowEvent, path)
    })
}

export function onTabPageShow(callback: (path: string) => void): () => void {
    Taro.eventCenter.on(tabPageShowEvent, callback)
    if (lastShownPath) {
        callback(lastShownPath)
    }
    return () => {
        Taro.eventCenter.off(tabPageShowEvent, callback)
    }
}
