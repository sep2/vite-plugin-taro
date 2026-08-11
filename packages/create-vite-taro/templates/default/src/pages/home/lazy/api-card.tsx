import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'
import { BotanicalSprig } from '../../../components/botanical-sprig/botanical-sprig.tsx'

export default function ApiCard() {
    return (
        <View className="relative mt-8 flex flex-col overflow-hidden rounded-3xl bg-primary p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <BotanicalSprig placement="cta" />
            <View className="relative z-10 flex max-w-lg flex-col">
                <Text className="text-xs font-bold tracking-widest text-on-primary-accent">TARO API READY</Text>
                <Text className="brand-serif mt-2 block text-3xl font-semibold text-white">
                    Make this starter yours.
                </Text>
                <Text className="mt-3 block text-sm leading-6 text-on-primary-muted">
                    Add pages, connect your data and ship the same experience to WeChat and H5.
                </Text>
            </View>
            <Button
                className="relative z-10 mt-6 flex items-center justify-center self-start rounded-full bg-action px-6 py-3 text-sm font-bold text-action-foreground after:border-0 sm:mt-0"
                onClick={() => Taro.showToast({ title: 'Hello from VPT!' })}
            >
                Try a Taro toast →
            </Button>
        </View>
    )
}
