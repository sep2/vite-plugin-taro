import Taro from 'virtual:taro/api'
import { Button, ScrollView, Text, View } from 'virtual:taro/components'
import { useState } from 'react'
import { NavigationBar } from '../../components/navigation-bar/navigation-bar.tsx'

const featureCards = [
    {
        number: '01',
        title: 'Vite-speed feedback',
        description: 'Save a React component and see the smallest possible update in WeChat DevTools or the browser.',
        tiltClass: 'rotate-[-0.35deg]'
    },
    {
        number: '02',
        title: 'One React tree',
        description: 'Share components, hooks and application state between WeChat Mini Program and H5.',
        tiltClass: 'translate-y-1 rotate-[0.25deg]'
    },
    {
        number: '03',
        title: 'Native when needed',
        description: 'Use familiar Taro components and APIs without stepping away from a modern frontend workflow.',
        tiltClass: 'rotate-[0.4deg]'
    }
] as const

interface BotanicalSprigProps {
    className: string
}

function BotanicalSprig({ className }: BotanicalSprigProps) {
    return (
        <View className={`botanical-sprig ${className}`} aria-hidden="true">
            <View className="botanical-stem" />
            <View className="botanical-leaf botanical-leaf-one" />
            <View className="botanical-leaf botanical-leaf-two" />
            <View className="botanical-leaf botanical-leaf-three" />
            <View className="botanical-leaf botanical-leaf-four" />
            <View className="botanical-flower">
                <View className="botanical-petal botanical-petal-one" />
                <View className="botanical-petal botanical-petal-two" />
                <View className="botanical-petal botanical-petal-three" />
                <View className="botanical-petal botanical-petal-four" />
                <View className="botanical-flower-center" />
            </View>
        </View>
    )
}

function IndexPage() {
    // This local state intentionally demonstrates that VPT preserves React state during hot updates.
    const [count, setCount] = useState(0)

    return (
        <View className="starter-canvas flex h-screen flex-col overflow-hidden text-[#315f44]">
            <NavigationBar title="VPT" />
            <ScrollView scrollY className="flex min-h-0 flex-1 flex-col">
                <View className="relative flex shrink-0 flex-col items-center overflow-hidden px-5 pb-12 pt-10">
                    <BotanicalSprig className="botanical-sprig-top" />
                    <BotanicalSprig className="botanical-sprig-side" />

                    <View className="relative z-10 flex w-full max-w-4xl flex-col items-center text-center">
                        <View className="flex flex-row items-center gap-2 rounded-full border border-[#1e663d]/15 bg-white/70 px-4 py-2">
                            <View className="h-2 w-2 rounded-full bg-[#63bd74]" />
                            <Text className="text-xs font-bold tracking-widest text-[#207344]">
                                VITE × REACT × TARO
                            </Text>
                        </View>

                        <Text className="brand-serif mt-7 block text-[7rem] font-semibold leading-none tracking-[-0.08em] text-[#17673d] sm:text-[9rem]">
                            VPT
                        </Text>
                        <Text className="mt-5 block max-w-2xl text-2xl font-bold leading-tight text-[#174f32] sm:text-3xl">
                            Build naturally. Ship everywhere.
                        </Text>
                        <Text className="mt-4 block max-w-xl text-sm leading-7 text-[#64786a] sm:text-base">
                            A botanical little starter for building polished WeChat Mini Programs and Web apps with one
                            modern React codebase.
                        </Text>

                        <View className="mt-7 flex flex-row flex-wrap items-center justify-center gap-3">
                            <View className="rounded-full border border-[#1e663d]/15 bg-white/75 px-4 py-2">
                                <Text className="text-sm font-bold text-[#17673d]">Vite 8</Text>
                            </View>
                            <Text className="text-[#e98a72]">✿</Text>
                            <View className="rounded-full border border-[#1e663d]/15 bg-white/75 px-4 py-2">
                                <Text className="text-sm font-bold text-[#17673d]">React 19</Text>
                            </View>
                            <Text className="text-[#e98a72]">✿</Text>
                            <View className="rounded-full border border-[#1e663d]/15 bg-white/75 px-4 py-2">
                                <Text className="text-sm font-bold text-[#17673d]">Tailwind 4</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View className="relative z-10 flex shrink-0 flex-col items-center px-5">
                    <View className="flex w-full max-w-4xl flex-col gap-5 overflow-hidden rounded-3xl border border-[#1e663d]/15 bg-white/85 p-6 shadow-xl sm:flex-row sm:items-center sm:p-8">
                        <View className="flex min-w-0 flex-1 flex-col">
                            <Text className="text-xs font-bold tracking-widest text-[#e17f68]">
                                STATE-PRESERVING HMR
                            </Text>
                            <Text className="brand-serif mt-2 block text-3xl font-semibold text-[#174f32]">
                                Edit. Save. Stay in flow.
                            </Text>
                            <Text className="mt-3 block text-sm leading-6 text-[#64786a]">
                                Change this counter, then edit src/pages/index/index.tsx. Your state stays exactly where
                                you left it.
                            </Text>
                        </View>

                        <View className="flex shrink-0 flex-col rounded-2xl bg-[#edf5e8] p-4 sm:w-64">
                            <Text className="text-center text-xs font-bold tracking-widest text-[#315f44]">
                                SHARED COUNTER
                            </Text>
                            <View className="mt-3 flex h-14 w-full flex-row overflow-hidden rounded-xl border border-[#1e663d]/15 bg-white">
                                <View className="flex h-full w-14 shrink-0">
                                    <Button
                                        className="m-0 flex h-full w-full items-center justify-center rounded-none bg-white p-0 text-lg font-bold leading-none text-[#315f44] after:border-0"
                                        onClick={() => setCount((currentCount) => currentCount - 1)}
                                    >
                                        <Text>−</Text>
                                    </Button>
                                </View>
                                <View className="flex min-w-0 flex-1 items-center justify-center border-x border-[#1e663d]/10 bg-[#f8fbf4]">
                                    <Text className="brand-serif text-3xl font-semibold text-[#197342]">{count}</Text>
                                </View>
                                <View className="flex h-full w-14 shrink-0">
                                    <Button
                                        className="m-0 flex h-full w-full items-center justify-center rounded-none bg-[#197342] p-0 text-lg font-bold leading-none text-white after:border-0"
                                        onClick={() => setCount((currentCount) => currentCount + 1)}
                                    >
                                        <Text>+</Text>
                                    </Button>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                <View className="flex shrink-0 flex-col items-center px-5 pb-12 pt-14">
                    <View className="flex w-full max-w-4xl flex-col">
                        <View className="flex flex-col items-center text-center">
                            <Text className="text-xs font-bold tracking-widest text-[#207344]">
                                A SMALL START, A MODERN FOUNDATION
                            </Text>
                            <Text className="brand-serif mt-3 block text-4xl font-semibold text-[#174f32]">
                                Everything is ready to grow.
                            </Text>
                            <Text className="mt-3 block max-w-xl text-sm leading-7 text-[#64786a]">
                                Keep the pieces you need, replace the rest, and let VPT handle the cross-platform build.
                            </Text>
                        </View>

                        <View className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
                            {featureCards.map((feature) => (
                                <View
                                    key={feature.number}
                                    className={`flex min-h-52 flex-col rounded-3xl border border-[#1e663d]/15 bg-white/80 p-6 shadow-lg ${feature.tiltClass}`}
                                >
                                    <View className="brand-serif flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e3f4df] text-base font-bold text-[#197342]">
                                        {feature.number}
                                    </View>
                                    <Text className="mt-5 block text-lg font-bold text-[#174f32]">{feature.title}</Text>
                                    <Text className="mt-3 block text-sm leading-6 text-[#64786a]">
                                        {feature.description}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <View className="relative mt-8 flex flex-col overflow-hidden rounded-3xl bg-[#17673d] p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-9">
                            <BotanicalSprig className="botanical-sprig-cta" />
                            <View className="relative z-10 flex max-w-lg flex-col">
                                <Text className="text-xs font-bold tracking-widest text-[#a9e2b4]">TARO API READY</Text>
                                <Text className="brand-serif mt-2 block text-3xl font-semibold text-white">
                                    Make this starter yours.
                                </Text>
                                <Text className="mt-3 block text-sm leading-6 text-[#d5ead9]">
                                    Add pages, connect your data and ship the same experience to WeChat and H5.
                                </Text>
                            </View>
                            <Button
                                className="relative z-10 mt-6 flex items-center justify-center self-start rounded-full bg-[#78dc91] px-6 py-3 text-sm font-bold text-[#0d2b18] after:border-0 sm:mt-0"
                                onClick={() => Taro.showToast({ title: 'Hello from VPT!' })}
                            >
                                Try a Taro toast →
                            </Button>
                        </View>

                        <View className="flex flex-col items-center px-2 pb-2 pt-9">
                            <Text className="text-center text-xs font-bold tracking-widest text-[#819185]">
                                VPT · OPEN SOURCE · MIT
                            </Text>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    )
}

export default IndexPage
