import { Button, Text, View } from 'virtual:taro/components'
import { defineNativeComponent } from 'virtual:taro/native'
import { useState } from 'react'

const NativeCounter = defineNativeComponent('./native/native-counter', {
    properties: {
        count: Number
    },
    events: {
        increment: {
            value: Number
        }
    }
})

export default function NativeCounterDemo() {
    const [count, setCount] = useState(0)

    return (
        <View className="flex min-h-screen flex-col gap-5 bg-slate-50 p-6 text-slate-950">
            <View className="flex flex-col gap-2">
                <Text className="text-2xl font-bold">Native component demo</Text>
                <Text className="text-sm text-slate-600">React state: {count}</Text>
            </View>

            <NativeCounter
                count={count}
                onIncrement={(event) => {
                    setCount(event.detail.value)
                }}
            />

            <Button
                className="rounded-lg bg-emerald-600 px-4 py-2 text-white"
                onClick={() => {
                    setCount((currentCount) => currentCount + 10)
                }}
            >
                Add 10 from React
            </Button>
        </View>
    )
}
