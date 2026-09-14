import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'
import { useContext } from 'react'
import { AppContext } from '../../app-context.ts'

export default function Index() {
    const appContext = useContext(AppContext)

    return (
        <View className="flex flex-col gap-4 rounded-xl bg-white p-5">
            <Text id="mirror-app-context" className="text-sm text-slate-700">
                {`Mirror context: ${appContext.wrapCount}; effect: ${String(appContext.effectReady)}`}
            </Text>
            <Button
                id="mirror-increment-app-wrap"
                className="rounded-lg border border-blue-500 px-3 py-2 text-sm text-blue-700"
                onClick={appContext.incrementWrap}
            >
                Increment singleton App
            </Button>
            <Button
                id="navigate-back-to-index"
                className="rounded-lg border border-slate-500 px-3 py-2 text-sm text-slate-700"
                onClick={() => Taro.navigateBack()}
            >
                Back to retained Page
            </Button>
        </View>
    )
}
