import { Text, View } from 'virtual:taro/components'

export function Footer() {
    return (
        <View className="order-last mt-auto flex h-10 shrink-0 flex-row items-center justify-center border-t border-divider bg-surface-subtle/95 px-5">
            <Text className="text-center text-xs font-bold tracking-widest text-quiet">
                VPT · OPEN SOURCE · MIT
            </Text>
        </View>
    )
}
