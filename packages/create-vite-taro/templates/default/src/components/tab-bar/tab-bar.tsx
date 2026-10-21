import Taro from 'virtual:taro/api'
import { Button, Image, Text, View } from 'virtual:taro/components'
import { tabPages } from '../../tab-pages.ts'
import { tabIcons } from './tab-icons.ts'

interface TabBarProps {
    activePath: (typeof tabPages)[number]['path']
}

export function TabBar({ activePath }: TabBarProps) {
    return (
        <View className="flex h-[calc(4rem+env(safe-area-inset-bottom))] w-full shrink-0 flex-row border-t border-divider bg-surface-subtle pb-[env(safe-area-inset-bottom)]">
            {tabPages.map(({ path, label, icon }) => {
                const selected = activePath === path
                return (
                    <Button
                        key={path}
                        id={`tab-${icon}`}
                        aria-current={selected ? 'page' : 'false'}
                        className={`m-0 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-none border-none bg-transparent p-0 text-xs after:content-none ${selected ? 'text-primary font-bold' : 'text-muted font-light'}`}
                        onClick={() => {
                            if (selected) {
                                return
                            }
                            void Taro.switchTab({ url: `/${path}` })
                        }}
                    >
                        <Image
                            src={tabIcons[icon]}
                            mode="aspectFit"
                            className={`h-6 w-6 ${selected ? 'opacity-100' : 'opacity-50'}`}
                        />
                        <Text>{label}</Text>
                    </Button>
                )
            })}
        </View>
    )
}
