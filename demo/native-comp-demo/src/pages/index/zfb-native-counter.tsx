import { defineNativeComponent, type NativeComponentEvent } from 'virtual:taro/native'

type ZfbNativeCounterProps = {
    count: number
    onIncrement?: (event: NativeComponentEvent<{ value: number }>) => void
}

export const ZfbNativeCounter = defineNativeComponent<ZfbNativeCounterProps>(
    () => import('../../native/zfb/native-counter/counter.js')
)
