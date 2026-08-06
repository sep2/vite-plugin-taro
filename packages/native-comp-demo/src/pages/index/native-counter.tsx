import { defineNativeComponent } from 'virtual:taro/native'

export const NativeCounter = defineNativeComponent(import('../../native/native-counter'), {
    properties: {
        count: Number
    },
    events: {
        increment: {
            value: Number
        }
    }
})
