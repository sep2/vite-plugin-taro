import { Text } from 'virtual:taro/components'
import { lazy, Suspense } from 'react'

const NativeCounterDemo = lazy(() => import('../../native-counter-demo.tsx'))

export default function Index() {
    return (
        <Suspense fallback={<Text className="text-sm text-slate-600">Loading native component...</Text>}>
            <NativeCounterDemo />
        </Suspense>
    )
}
