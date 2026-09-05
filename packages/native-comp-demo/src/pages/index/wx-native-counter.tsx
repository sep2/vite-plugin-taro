import { defineNativeComponent, type NativeComponentEvent } from 'virtual:taro/native'

type WxNativeCounterProps = {
    count: number
    onIncrement?: (event: NativeComponentEvent<{ value: number }>) => void
}

export const WxNativeCounter = defineNativeComponent<WxNativeCounterProps>(
    () => import('../../native/wx/native-counter/counter.js')
)
