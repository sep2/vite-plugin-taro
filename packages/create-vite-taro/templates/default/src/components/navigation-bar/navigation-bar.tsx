import { View } from 'virtual:taro/components'
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
        <View className="flex w-full flex-col bg-slate-950 text-white" style={containerStyle}>
            <View className="shrink-0" style={statusBarStyle} />
            <View className="flex w-full flex-1 flex-row items-center" style={contentStyle}>
                <View className="flex h-full shrink-0" style={sideStyle} />
                <View className="flex h-full min-w-0 flex-1 flex-row items-center justify-center text-center text-base font-medium">
                    {title}
                </View>
                <View className="flex h-full shrink-0" style={sideStyle} />
            </View>
        </View>
    )
}
