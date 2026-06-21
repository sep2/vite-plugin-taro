import Taro from 'virtual:taro/api'
import { Button, Text, View } from 'virtual:taro/components'

function IndexPage() {
    return (
        <View className="min-h-screen bg-slate-50 px-6 py-12">
            <View className="rounded-3xl bg-white p-6 shadow-sm">
                <Text className="block text-2xl font-semibold text-slate-950">Vite + Taro</Text>
                <Text className="mt-3 block text-base leading-7 text-slate-600">
                    Build H5 and WeChat Mini Program targets from one React/Taro codebase.
                </Text>
                <Button
                    className="mt-6 rounded-xl bg-blue-600 px-4 py-2 text-white"
                    onClick={() => {
                        Taro.showToast({ title: 'Hello Taro' })
                    }}
                >
                    Show toast
                </Button>
            </View>
        </View>
    )
}

export default IndexPage
