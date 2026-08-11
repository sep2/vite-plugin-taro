import { Button, Text, View } from 'virtual:taro/components'
import type { CounterProps } from './counter.tsx'

export function WebCounter({ count, onDecrement, onIncrement }: CounterProps) {
    return (
        <View className="flex flex-col rounded-2xl bg-surface-muted p-4">
            <Text className="text-center text-xs font-bold tracking-widest text-foreground">SHARED COUNTER</Text>
            <View className="mt-3 flex h-14 w-full flex-row overflow-hidden rounded-full border border-outline bg-white">
                <View className="flex h-full w-14 shrink-0">
                    <Button
                        aria-label="Decrease counter"
                        className="m-0 flex h-full w-full items-center justify-center rounded-l-full rounded-r-none bg-white p-0 text-lg font-bold leading-none text-foreground after:border-0"
                        onClick={onDecrement}
                    >
                        <Text>−</Text>
                    </Button>
                </View>
                <View className="flex min-w-0 flex-1 items-center justify-center border-x border-divider bg-surface-subtle">
                    <Text className="brand-serif text-3xl font-semibold text-primary-control">{count}</Text>
                </View>
                <View className="flex h-full w-14 shrink-0">
                    <Button
                        aria-label="Increase counter"
                        className="m-0 flex h-full w-full items-center justify-center rounded-l-none rounded-r-full bg-primary-control p-0 text-lg font-bold leading-none text-white after:border-0"
                        onClick={onIncrement}
                    >
                        <Text>+</Text>
                    </Button>
                </View>
            </View>
        </View>
    )
}
