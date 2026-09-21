import { defineNativeComponent, type NativeComponentEvent } from 'virtual:taro/native'

type TtNativeCounterProps = {
    count: number
    onIncrement?: (event: NativeComponentEvent<{ value: number }>) => void
}

export const TtNativeCounter = defineNativeComponent<TtNativeCounterProps>(
    () => import('../../native/tt/native-counter/counter.js')
)
