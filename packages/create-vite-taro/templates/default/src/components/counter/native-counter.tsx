import { defineNativeComponent } from 'virtual:taro/native'

type NativeCounterProps = {
    count: number
    onDecrement: () => void
    onIncrement: () => void
}

export const NativeCounter = defineNativeComponent<NativeCounterProps>(() => import('./native-counter/counter.js'))
