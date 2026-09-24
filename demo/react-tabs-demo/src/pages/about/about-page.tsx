import { ScrollView, Text, View } from 'virtual:taro/components'
import { useTabPage } from '../../components/bottom-tabs/tab-page.ts'
import { NavigationBar } from '../../components/navigation-bar/navigation-bar.tsx'
import { tabPages } from '../../tab-pages.ts'

const platforms = ['WeChat', 'Alipay', 'TikTok', 'Web'] as const

export default function AboutPage() {
    useTabPage(tabPages[2].path)

    return (
        <View className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <NavigationBar title="About" />
            <ScrollView scrollY className="flex min-h-0 flex-1 flex-col">
                <View className="mx-auto flex w-full max-w-4xl flex-col px-5 pb-12 pt-10">
                    <Text className="text-xs font-bold tracking-widest text-primary-label">A LITTLE ABOUT VPT</Text>
                    <Text className="brand-serif mt-3 block text-5xl font-semibold text-heading">Made to travel.</Text>
                    <Text className="mt-4 block max-w-xl text-sm leading-7 text-muted">
                        VPT brings Vite, React and Taro together so your ideas can grow across mini programs and the
                        web.
                    </Text>

                    <View className="mt-9 rounded-3xl bg-primary p-7 text-white shadow-xl sm:p-9">
                        <Text className="brand-serif block text-3xl font-semibold text-white">
                            One project. Four places.
                        </Text>
                        <Text className="mt-3 block text-sm leading-6 text-on-primary-muted">
                            Share the interface and tailor the details to each platform as you go.
                        </Text>
                        <View className="mt-6 flex flex-row flex-wrap gap-2">
                            {platforms.map((platform) => (
                                <View key={platform} className="rounded-full border border-on-primary-accent px-4 py-2">
                                    <Text className="text-xs font-bold text-white">{platform}</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    <View className="mt-5 flex flex-col rounded-3xl border border-outline bg-white/85 p-7 shadow-lg">
                        <Text className="text-lg font-bold text-heading">Ready to start?</Text>
                        <Text className="mt-2 text-sm leading-6 text-muted">
                            Tap the Home tab to try the counter, lazy-loaded card and your first Taro API call.
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </View>
    )
}
