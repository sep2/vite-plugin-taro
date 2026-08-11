import { Text, View } from 'virtual:taro/components'
import type { CSSProperties } from 'react'
import { useNavigationBar } from './use-navigation-bar.ts'

interface NavigationBarProps {
    title: string
}

function px(value: number): string {
    return `${Math.round(value)}px`
}

export function NavigationBar({ title }: NavigationBarProps) {
    const { navBar, menuInfo } = useNavigationBar()
    const containerStyle: CSSProperties = { height: px(navBar.height) }
    const statusBarStyle: CSSProperties = { height: px(navBar.top) }
    const contentStyle: CSSProperties = { padding: `${px(navBar.py)} ${px(navBar.px)}` }
    const sideStyle: CSSProperties = { flexBasis: px(menuInfo.width), width: px(menuInfo.width) }

    return (
        <View className="flex w-full flex-col text-primary" style={containerStyle}>
            <View className="shrink-0" style={statusBarStyle} />
            <View className="flex w-full flex-1 flex-row items-center" style={contentStyle}>
                <View className="flex h-full shrink-0" style={sideStyle} />
                <View className="flex h-full min-w-0 flex-1 flex-row items-center justify-center gap-2 text-center">
                    <Text className="brand-serif text-xl font-semibold tracking-[0.12em]">{title}</Text>
                    <View className="h-1.5 w-1.5 rounded-full bg-coral" />
                </View>
                <View className="flex h-full shrink-0" style={sideStyle} />
            </View>
        </View>
    )
}
