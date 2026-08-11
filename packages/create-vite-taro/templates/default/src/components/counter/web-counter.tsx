import { Button, Text, View } from 'virtual:taro/components'
import type { CounterProps } from './counter.tsx'

export function WebCounter({ count, onDecrement, onIncrement }: CounterProps) {
    return (
        <View className="flex flex-col rounded-2xl bg-[#edf5e8] p-4">
            <Text className="text-center text-xs font-bold tracking-widest text-[#315f44]">SHARED COUNTER</Text>
            <View className="mt-3 flex h-14 w-full flex-row overflow-hidden rounded-full border border-[#1e663d]/15 bg-white">
                <View className="flex h-full w-14 shrink-0">
                    <Button
                        aria-label="Decrease counter"
                        className="m-0 flex h-full w-full items-center justify-center rounded-l-full rounded-r-none bg-white p-0 text-lg font-bold leading-none text-[#315f44] after:border-0"
                        onClick={onDecrement}
                    >
                        <Text>−</Text>
                    </Button>
                </View>
                <View className="flex min-w-0 flex-1 items-center justify-center border-x border-[#1e663d]/10 bg-[#f8fbf4]">
                    <Text className="brand-serif text-3xl font-semibold text-[#197342]">{count}</Text>
                </View>
                <View className="flex h-full w-14 shrink-0">
                    <Button
                        aria-label="Increase counter"
                        className="m-0 flex h-full w-full items-center justify-center rounded-l-none rounded-r-full bg-[#197342] p-0 text-lg font-bold leading-none text-white after:border-0"
                        onClick={onIncrement}
                    >
                        <Text>+</Text>
                    </Button>
                </View>
            </View>
        </View>
    )
}
