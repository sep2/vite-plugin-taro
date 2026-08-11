import { ScrollView, Text, View } from 'virtual:taro/components'
import { lazy, Suspense, useState } from 'react'
import { Counter } from '../../components/counter/counter.tsx'
import { BotanicalSprig } from '../../components/botanical-sprig/botanical-sprig.tsx'
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

const ApiCard = lazy(() => import('./lazy/api-card.tsx'))

function HomePage() {
    // This local state intentionally demonstrates that VPT preserves React state during hot updates.
    const [count, setCount] = useState(0)

    return (
        <View className="flex h-screen flex-col overflow-hidden bg-canvas bg-canvas-botanical text-foreground">
            <NavigationBar title="VPT" />
            <ScrollView scrollY className="flex min-h-0 flex-1 flex-col">
                <View className="relative flex shrink-0 flex-col items-center overflow-hidden px-5 pb-8 pt-6">
                    <BotanicalSprig placement="top" />
                    <BotanicalSprig placement="side" />

                    <View className="relative z-10 flex w-full max-w-4xl flex-col items-center text-center">
                        <Text className="brand-serif mt-7 block text-[7rem] font-semibold leading-none tracking-[-0.08em] text-primary sm:text-[9rem]">
                            VPT
                        </Text>
                        <Text className="mt-5 block max-w-2xl text-2xl font-bold leading-tight text-heading sm:text-3xl">
                            Build naturally. Ship everywhere.
                        </Text>
                        <Text className="mt-4 block max-w-xl text-sm leading-7 text-muted sm:text-base">
                            A botanical little starter for building polished WeChat Mini Programs and Web apps with one
                            modern React codebase.
                        </Text>

                        <View className="mt-7 flex flex-row flex-wrap items-center justify-center gap-3">
                            <View className="rounded-full border border-outline bg-white/75 px-4 py-2">
                                <Text className="text-sm font-bold text-primary">Vite 8</Text>
                            </View>
                            <Text className="text-coral">✿</Text>
                            <View className="rounded-full border border-outline bg-white/75 px-4 py-2">
                                <Text className="text-sm font-bold text-primary">React 19</Text>
                            </View>
                            <Text className="text-coral">✿</Text>
                            <View className="rounded-full border border-outline bg-white/75 px-4 py-2">
                                <Text className="text-sm font-bold text-primary">Tailwind 4</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View className="mx-6 mb-8 shrink-0 sm:mx-auto sm:w-64">
                    <Counter
                        count={count}
                        onDecrement={() => {
                            setCount((currentCount) => currentCount - 1)
                        }}
                        onIncrement={() => {
                            setCount((currentCount) => currentCount + 1)
                        }}
                    />
                </View>

                <View className="relative z-10 flex shrink-0 flex-col items-center px-5">
                    <View className="flex w-full max-w-4xl flex-col gap-5 overflow-hidden rounded-3xl border border-outline bg-white/85 p-6 shadow-xl sm:flex-row sm:items-center sm:p-8">
                        <View className="flex min-w-0 flex-1 flex-col">
                            <Text className="brand-serif mt-2 block text-3xl font-semibold text-heading">
                                Edit. Save. Stay in flow.
                            </Text>
                            <Text className="mt-3 block text-sm leading-6 text-muted">
                                Change this counter, then edit src/pages/home/index.tsx. Your state stays exactly where
                                you left it.
                            </Text>
                        </View>
                    </View>
                </View>

                <View className="flex shrink-0 flex-col items-center px-5 pb-12 pt-14">
                    <View className="flex w-full max-w-4xl flex-col">
                        <View className="flex flex-col items-center text-center">
                            <Text className="text-xs font-bold tracking-widest text-primary-label">
                                A SMALL START, A MODERN FOUNDATION
                            </Text>
                            <Text className="brand-serif mt-3 block text-4xl font-semibold text-heading">
                                Everything is ready to grow.
                            </Text>
                            <Text className="mt-3 block max-w-xl text-sm leading-7 text-muted">
                                Keep the pieces you need, replace the rest, and let VPT handle the cross-platform build.
                            </Text>
                        </View>

                        <View className="mt-8 flex flex-row flex-wrap items-start gap-4">
                            {featureCards.map((feature) => (
                                <View
                                    key={feature.number}
                                    className={`flex min-w-64 flex-1 flex-col rounded-3xl border border-outline bg-white/80 p-6 shadow-lg ${feature.tiltClass}`}
                                >
                                    <View className="flex flex-row items-center gap-4">
                                        <View className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-surface">
                                            <Text className="brand-serif block text-base font-bold leading-none text-primary-control">
                                                {feature.number}
                                            </Text>
                                        </View>
                                        <Text className="block min-w-0 flex-1 text-lg font-bold text-heading">
                                            {feature.title}
                                        </Text>
                                    </View>
                                    <Text className="mt-4 block text-sm leading-6 text-muted">
                                        {feature.description}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <Suspense fallback={<View className="mt-8 min-h-48 rounded-3xl bg-primary" />}>
                            <ApiCard />
                        </Suspense>

                        <View className="flex flex-col items-center px-2 pb-2 pt-9">
                            <Text className="text-center text-xs font-bold tracking-widest text-quiet">
                                VPT · OPEN SOURCE · MIT
                            </Text>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    )
}

export default HomePage
