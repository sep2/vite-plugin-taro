import { ScrollView, Text, View } from 'virtual:taro/components'
import { useTabPage } from '../../components/bottom-tabs/tab-page.ts'
import { NavigationBar } from '../../components/navigation-bar/navigation-bar.tsx'
import { tabPages } from '../../tab-pages.ts'

const steps = [
    {
        number: '01',
        title: 'Make it yours',
        description: 'Start with the home page. Change the copy, colors and components to match your idea.',
        file: 'src/pages/home/index.tsx'
    },
    {
        number: '02',
        title: 'Grow another page',
        description: 'Add a React page and register its path in the VPT pages array.',
        file: 'vite.config.ts'
    },
    {
        number: '03',
        title: 'Ship to every target',
        description: 'Build for WeChat, Alipay, TikTok or the web from the same source.',
        file: 'npm run build:wx'
    }
] as const

export default function ExplorePage() {
    useTabPage(tabPages[1].path)

    return (
        <View className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <NavigationBar title="Explore" />
            <ScrollView scrollY className="flex min-h-0 flex-1 flex-col">
                <View className="mx-auto flex w-full max-w-4xl flex-col px-5 pb-12 pt-10">
                    <Text className="text-xs font-bold tracking-widest text-primary-label">YOUR NEXT STEPS</Text>
                    <Text className="brand-serif mt-3 block text-5xl font-semibold text-heading">Room to grow.</Text>
                    <Text className="mt-4 block max-w-xl text-sm leading-7 text-muted">
                        This starter is a beginning, not a blueprint. Pick a path and make something of your own.
                    </Text>
                    <View className="mt-9 flex flex-col gap-4">
                        {steps.map((step) => (
                            <View
                                key={step.number}
                                className="flex flex-col rounded-3xl border border-outline bg-white/85 p-6 shadow-lg sm:flex-row sm:gap-6"
                            >
                                <Text className="brand-serif block text-3xl font-semibold text-primary-control">
                                    {step.number}
                                </Text>
                                <View className="mt-3 flex min-w-0 flex-1 flex-col sm:mt-0">
                                    <Text className="text-lg font-bold text-heading">{step.title}</Text>
                                    <Text className="mt-2 text-sm leading-6 text-muted">{step.description}</Text>
                                    <Text className="mt-4 self-start rounded-full bg-primary-surface px-4 py-2 text-xs font-bold text-primary">
                                        {step.file}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>
        </View>
    )
}
