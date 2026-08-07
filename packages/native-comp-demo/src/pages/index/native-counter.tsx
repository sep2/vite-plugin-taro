import { defineNativeComponent } from 'virtual:taro/native'

export const NativeCounter = defineNativeComponent(import('../../native/native-counter/counter.js'), {
    properties: {
        count: Number
    },
    events: {
        increment: {
            value: Number
        }
    }
})
