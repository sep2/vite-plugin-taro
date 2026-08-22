import { Text, View } from 'virtual:taro/components'

export function Footer() {
    return (
        <View className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-row items-center justify-center border-t border-divider bg-surface-subtle/95 px-5 py-3">
            <Text className="text-center text-xs font-bold tracking-widest text-quiet">
                VPT · OPEN SOURCE · MIT
            </Text>
        </View>
    )
}
