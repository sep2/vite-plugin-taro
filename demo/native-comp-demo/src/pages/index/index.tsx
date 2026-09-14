import Taro from 'virtual:taro/api'
import { Button, CustomWrapper, Text, View } from 'virtual:taro/components'
import { lazy, Suspense, useContext } from 'react'
import { AppContext } from '../../app-context.ts'

const NativeCounterDemo = lazy(() => import('./native-counter-demo.tsx'))

export default function Index() {
    const appContext = useContext(AppContext)

    return (
        <View className="flex flex-col gap-4">
            <CustomWrapper id="page-context-custom-wrapper">
                <View className="flex flex-col gap-4">
                    <Text id="page-app-context" className="text-sm text-slate-700">
                        {`Page context: ${appContext.wrapCount}; effect: ${String(appContext.effectReady)}`}
                    </Text>
                    <Button
                        id="page-increment-app-wrap"
                        className="rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-700"
                        onClick={appContext.incrementWrap}
                    >
                        Increment App through Context
                    </Button>
                    <Button
                        id="page-increment-app-shell-only"
                        className="rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-700"
                        onClick={appContext.incrementShell}
                    >
                        Increment only App hosts
                    </Button>
                    <Button
                        id="navigate-mirror-page"
                        className="rounded-lg border border-slate-500 px-3 py-2 text-sm text-slate-700"
                        onClick={() => Taro.navigateTo({ url: '/pages/mirror/index' })}
                    >
                        Open retained mirror Page
                    </Button>
                </View>
            </CustomWrapper>
            <CustomWrapper id="page-native-section-custom-wrapper">
                <View className="flex flex-col gap-4">
                    <CustomWrapper id="page-native-demo-custom-wrapper">
                        <Suspense
                            fallback={<Text className="text-sm text-slate-600">Loading native component...</Text>}
                        >
                            <NativeCounterDemo />
                        </Suspense>
                    </CustomWrapper>
                </View>
            </CustomWrapper>
        </View>
    )
}
