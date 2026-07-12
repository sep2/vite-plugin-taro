import Taro from 'virtual:taro/api'
import { Button, ScrollView, Text, View } from 'virtual:taro/components'
import { useState } from 'react'
import { NavigationBar } from '../../components/navigation-bar/navigation-bar.tsx'

const features = [
    {
        number: '01',
        title: 'Instant feedback',
        description: 'Enjoy a fast Vite-powered development loop on every target.'
    },
    {
        number: '02',
        title: 'One React UI',
        description: 'Share components and state between H5 and WeChat Mini Program.'
    },
    {
        number: '03',
        title: 'Native ready',
        description: 'Reach Taro APIs and components without giving up modern tooling.'
    }
]

function IndexPage() {
    const [count, setCount] = useState(0)

    return (
        <View className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-950">
            <NavigationBar title="Vite Taro App" />
            <ScrollView scrollY className="flex min-h-0 flex-1 flex-col bg-slate-50">
                <View className="relative flex flex-col items-center overflow-hidden bg-slate-950 px-6 pb-14 pt-10">
                    <View className="relative flex w-full flex-col gap-6">
                        <View className="flex flex-row">
                            <View className="flex flex-row items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2">
                                <Text className="text-xs leading-none text-emerald-400">●</Text>
                                <Text className="text-xs font-semibold tracking-widest text-slate-300">
                                    VITE × TARO
                                </Text>
                            </View>
                        </View>

                        <View className="flex flex-col">
                            <Text className="block text-4xl font-bold leading-tight text-white">One codebase.</Text>
                            <Text className="block text-4xl font-bold leading-tight text-blue-400">Every screen.</Text>
                        </View>

                        <Text className="block text-base leading-7 text-slate-300">
                            A modern React starter for building polished H5 and WeChat experiences without duplicating
                            work.
                        </Text>

                        <View className="flex flex-row gap-3">
                            <View className="flex items-center rounded-xl bg-white px-4 py-2">
                                <Text className="text-sm font-bold text-slate-950">WeChat Mini Program</Text>
                            </View>
                            <View className="flex items-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2">
                                <Text className="text-sm font-bold text-white">H5</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View className="flex flex-col items-center px-5 pt-6">
                    <View className="flex w-full flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
                        <View className="flex flex-row items-start justify-between gap-4">
                            <View className="flex min-w-0 flex-1 flex-col gap-2">
                                <Text className="block text-xs font-bold tracking-widest text-blue-600">LIVE DEMO</Text>
                                <Text className="block text-xl font-bold text-slate-950">A tiny shared counter</Text>
                                <Text className="block text-sm leading-6 text-slate-500">
                                    Change the counter, then edit this page to see hot reload update both targets.
                                </Text>
                            </View>
                            <View className="flex items-center justify-center rounded-2xl bg-blue-50 px-4 py-3">
                                <Text className="text-3xl font-bold text-blue-600">{count}</Text>
                            </View>
                        </View>

                        <View className="flex flex-col gap-3">
                            <View className="flex flex-row gap-3">
                                <View className="flex flex-1">
                                    <Button
                                        className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 after:border-0"
                                        onClick={() => setCount((currentCount) => currentCount - 1)}
                                    >
                                        Decrease
                                    </Button>
                                </View>
                                <View className="flex flex-1">
                                    <Button
                                        className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white after:border-0"
                                        onClick={() => setCount((currentCount) => currentCount + 1)}
                                    >
                                        Increase
                                    </Button>
                                </View>
                            </View>
                            <Button
                                className="flex w-full items-center justify-center rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-600 after:border-0"
                                onClick={() => Taro.showToast({ title: 'Hello from Taro!' })}
                            >
                                Show toast
                            </Button>
                        </View>
                    </View>
                </View>

                <View className="flex flex-col items-center px-5 pb-10 pt-10">
                    <View className="flex w-full flex-col gap-6">
                        <View className="flex flex-col gap-2">
                            <Text className="block text-xs font-bold tracking-widest text-blue-600">
                                BUILT FOR MOMENTUM
                            </Text>
                            <Text className="block text-2xl font-bold text-slate-950">
                                Everything you need to start.
                            </Text>
                        </View>

                        <View className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white">
                            {features.map((feature, index) => (
                                <View
                                    key={feature.number}
                                    className={`flex flex-row gap-4 p-5 ${index < features.length - 1 ? 'border-b border-slate-200' : ''}`}
                                >
                                    <View className="flex shrink-0 items-center justify-center rounded-xl bg-slate-950 px-3 py-3">
                                        <Text className="text-xs font-bold text-white">{feature.number}</Text>
                                    </View>
                                    <View className="flex min-w-0 flex-1 flex-col gap-1">
                                        <Text className="block text-base font-bold text-slate-950">
                                            {feature.title}
                                        </Text>
                                        <Text className="block text-sm leading-6 text-slate-500">
                                            {feature.description}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>

                        <View className="flex flex-col gap-5 rounded-3xl bg-blue-600 p-6">
                            <View className="flex flex-col gap-2">
                                <Text className="block text-2xl font-bold text-white">Make it yours.</Text>
                                <Text className="block text-sm leading-6 text-blue-100">
                                    Edit this page, add your routes, and ship your next idea everywhere.
                                </Text>
                            </View>
                            <View className="flex self-start rounded-xl bg-white px-4 py-3">
                                <Text className="text-sm font-bold text-blue-600">Ready to build →</Text>
                            </View>
                        </View>

                        <View className="flex flex-col px-2 pt-2">
                            <Text className="block text-center text-xs font-medium tracking-widest text-slate-400">
                                VITE 8 · REACT 19 · TARO
                            </Text>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    )
}

export default IndexPage
