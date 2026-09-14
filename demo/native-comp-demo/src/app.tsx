import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'
import { type PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react'
import { AppContext } from './app-context.ts'
import './app.css'
import { NativeCounter } from './pages/index/native-counter.tsx'

function App({ children }: PropsWithChildren) {
    // This singleton App state must survive Page lifecycles and accepted App HMR updates.
    const [wrapCount, setWrapCount] = useState(0)
    // This state changes App hosts without changing the Context value consumed by Pages.
    const [shellCount, setShellCount] = useState(0)
    // This effect-owned state proves that visible App hosts receive post-mount updates.
    const [effectReady, setEffectReady] = useState(false)

    Taro.useLaunch(() => {
        console.log('[native-comp-demo] launched')
    })

    useEffect(() => {
        console.log('[native-comp-demo] App effect mounted')
        setEffectReady(true)

        return () => {
            console.log('[native-comp-demo] App effect cleaned up')
        }
    }, [])

    const incrementShell = useCallback(() => {
        setShellCount((count) => count + 1)
    }, [])
    const incrementWrap = useCallback(() => {
        setWrapCount((count) => count + 1)
    }, [])
    const contextValue = useMemo(
        () => ({
            effectReady: effectReady,
            incrementShell: incrementShell,
            incrementWrap: incrementWrap,
            wrapCount: wrapCount
        }),
        [effectReady, incrementShell, incrementWrap, wrapCount]
    )

    return (
        <AppContext.Provider value={contextValue}>
            <View className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-slate-50 p-4">
                <View className="rounded-xl bg-slate-900 p-4 text-white">
                    <Text id="app-wrap-state" className="block text-sm font-semibold">
                        {`App wrap: ${wrapCount}; shell: ${shellCount}; effect: ${String(effectReady)}`}
                    </Text>
                    <Button
                        id="app-wrap-increment"
                        className="mt-3 rounded-lg bg-blue-500 px-3 py-2 text-sm text-white"
                        onClick={incrementWrap}
                    >
                        Increment App wrap
                    </Button>
                    <Button
                        id="app-shell-only-increment"
                        className="mt-3 rounded-lg border border-blue-300 px-3 py-2 text-sm text-white"
                        onClick={incrementShell}
                    >
                        Increment App hosts only
                    </Button>
                </View>
                <NativeCounter
                    count={shellCount}
                    onIncrement={(event) => {
                        setShellCount(event.detail.value)
                    }}
                />
                <AppDepth depth={16}>{children}</AppDepth>
            </View>
        </AppContext.Provider>
    )
}

/** Keeps the permanent fixture beyond Taro's depth-15 recursive native component boundary. */
function AppDepth({ children, depth }: PropsWithChildren<{ depth: number }>) {
    if (depth === 0) return children
    return (
        <View className="app-depth-wrap">
            <AppDepth depth={depth - 1}>{children}</AppDepth>
        </View>
    )
}

export default App
