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
            <ScrollView scrollY className="min-h-0 flex-1 bg-slate-50">
                <View className="relative overflow-hidden bg-slate-950 px-6 pb-20 pt-10">
                    <View className="absolute -right-16 top-8 h-48 w-48 rounded-full bg-blue-500 opacity-20" />
                    <View className="absolute -left-12 bottom-6 h-32 w-32 rounded-full bg-cyan-400 opacity-10" />

                    <View className="relative mx-auto w-full max-w-4xl">
                        <View className="mb-6 flex flex-row">
                            <View className="flex flex-row items-center rounded-full border border-slate-700 bg-slate-900 px-3 py-2">
                                <View className="mr-2 h-2 w-2 rounded-full bg-emerald-400" />
                                <Text className="text-xs font-semibold tracking-widest text-slate-300">
                                    VITE × TARO
                                </Text>
                            </View>
                        </View>

                        <Text className="block text-4xl font-bold leading-tight text-white">One codebase.</Text>
                        <Text className="block text-4xl font-bold leading-tight text-blue-400">Every screen.</Text>
                        <Text className="mt-5 block max-w-xl text-base leading-7 text-slate-300">
                            A modern React starter for building polished H5 and WeChat experiences without duplicating
                            work.
                        </Text>

                        <View className="mt-7 flex flex-row gap-3">
                            <View className="rounded-xl bg-white px-4 py-2">
                                <Text className="text-sm font-bold text-slate-950">WeChat Mini Program</Text>
                            </View>
                            <View className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2">
                                <Text className="text-sm font-bold text-white">H5</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View className="relative z-10 mx-5 -mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl md:mx-auto md:max-w-4xl">
                    <View className="flex flex-row items-start justify-between gap-4">
                        <View className="min-w-0 flex-1">
                            <Text className="block text-xs font-bold tracking-widest text-blue-600">LIVE DEMO</Text>
                            <Text className="mt-2 block text-xl font-bold text-slate-950">A tiny shared counter</Text>
                            <Text className="mt-1 block text-sm leading-6 text-slate-500">
                                Change the counter, then edit this page to see hot reload update both targets.
                            </Text>
                        </View>
                        <View className="rounded-2xl bg-blue-50 px-4 py-3">
                            <Text className="text-3xl font-bold text-blue-600">{count}</Text>
                        </View>
                    </View>

                    <View className="mt-6 flex flex-row gap-3">
                        <Button
                            className="m-0 flex h-12 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white p-0 text-sm font-semibold text-slate-700 after:border-0"
                            onClick={() => setCount((currentCount) => currentCount - 1)}
                        >
                            Decrease
                        </Button>
                        <Button
                            className="m-0 flex h-12 flex-1 items-center justify-center rounded-xl bg-blue-600 p-0 text-sm font-semibold text-white after:border-0"
                            onClick={() => setCount((currentCount) => currentCount + 1)}
                        >
                            Increase
                        </Button>
                    </View>
                    <Button
                        className="m-0 mt-3 flex h-10 w-full items-center justify-center rounded-xl bg-slate-100 p-0 text-sm font-semibold text-slate-600 after:border-0"
                        onClick={() => Taro.showToast({ title: 'Hello from Taro!' })}
                    >
                        Show toast
                    </Button>
                </View>

                <View className="mx-auto w-full max-w-4xl px-5 pb-10 pt-10">
                    <Text className="block text-xs font-bold tracking-widest text-blue-600">BUILT FOR MOMENTUM</Text>
                    <Text className="mt-2 block text-2xl font-bold text-slate-950">Everything you need to start.</Text>

                    <View className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
                        {features.map((feature, index) => (
                            <View
                                key={feature.number}
                                className={`flex flex-row gap-4 p-5 ${index < features.length - 1 ? 'border-b border-slate-200' : ''}`}
                            >
                                <View className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950">
                                    <Text className="text-xs font-bold text-white">{feature.number}</Text>
                                </View>
                                <View className="min-w-0 flex-1">
                                    <Text className="block text-base font-bold text-slate-950">{feature.title}</Text>
                                    <Text className="mt-1 block text-sm leading-6 text-slate-500">
                                        {feature.description}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    <View className="mt-6 rounded-3xl bg-blue-600 p-6">
                        <Text className="block text-2xl font-bold text-white">Make it yours.</Text>
                        <Text className="mt-2 block text-sm leading-6 text-blue-100">
                            Edit this page, add your routes, and ship your next idea everywhere.
                        </Text>
                        <View className="mt-5 self-start rounded-xl bg-white px-4 py-3">
                            <Text className="text-sm font-bold text-blue-600">Ready to build →</Text>
                        </View>
                    </View>

                    <Text className="mt-8 block text-center text-xs font-medium tracking-widest text-slate-400">
                        VITE 8 · REACT 19 · TARO
                    </Text>
                </View>
            </ScrollView>
        </View>
    )
}

export default IndexPage
