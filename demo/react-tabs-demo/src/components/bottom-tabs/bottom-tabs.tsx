import Taro from 'virtual:taro/api'
import { Button, Image, Text, View } from 'virtual:taro/components'
import { useEffect, useState } from 'react'
import { tabPages } from '../../tab-pages.ts'
import { tabIcons } from './tab-icons.ts'
import { onTabPageShow } from './tab-page.ts'

function currentPagePath(): string | undefined {
    return Taro.getCurrentPages?.().at(-1)?.route?.replace(/^\//, '')
}

export default function BottomTabs() {
    // The App bar stays mounted across tab routes; page onShow catches route changes after navigation.
    const [activePath, setActivePath] = useState(() => currentPagePath() ?? tabPages[0].path)

    useEffect(() => {
        const path = currentPagePath()
        if (path) {
            setActivePath(path)
        }
        // Page onShow is authoritative even when it precedes the App bar's first effect.
        return onTabPageShow(setActivePath)
    }, [])

    // #ifdef h5
    useEffect(() => {
        const syncPath = () => setActivePath(window.location.hash.slice(2).split('?')[0] || tabPages[0].path)
        window.addEventListener('hashchange', syncPath)
        window.addEventListener('popstate', syncPath)
        syncPath()
        return () => {
            window.removeEventListener('hashchange', syncPath)
            window.removeEventListener('popstate', syncPath)
        }
    }, [])
    // #endif

    return (
        <View className="tw-root pointer-events-auto absolute bottom-0 left-0 right-0 flex h-[calc(4rem+env(safe-area-inset-bottom))] w-full flex-row border-t border-divider bg-surface-subtle pb-[env(safe-area-inset-bottom)]">
            {tabPages.map(({ path, label, icon }) => {
                const selected = activePath === path
                return (
                    <Button
                        key={path}
                        id={`tab-${icon}`}
                        aria-current={selected ? 'page' : 'false'}
                        className={`m-0 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-none border-none bg-transparent p-0 text-xs font-bold after:content-none ${selected ? 'text-primary' : 'text-muted'}`}
                        onClick={() => {
                            if (currentPagePath() === path) {
                                return
                            }
                            void Taro.switchTab({ url: `/${path}` })
                        }}
                    >
                        <Image
                            src={tabIcons[icon]}
                            mode="aspectFit"
                            className={`h-6 w-6 ${selected ? 'opacity-100' : 'opacity-50'}`}
                        />
                        <Text>{label}</Text>
                    </Button>
                )
            })}
        </View>
    )
}
