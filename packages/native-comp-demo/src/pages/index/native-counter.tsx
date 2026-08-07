import { defineNativeComponent, type NativeComponentEvent } from 'virtual:taro/native'

type NativeCounterProps = {
    count: number
    onIncrement?: (event: NativeComponentEvent<{ value: number }>) => void
}

export const NativeCounter = defineNativeComponent<NativeCounterProps>(
    () => import('../../native/native-counter/counter.js')
)
