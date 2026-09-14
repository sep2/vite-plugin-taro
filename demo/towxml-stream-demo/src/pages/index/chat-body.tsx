import { Text, View } from 'virtual:taro/components'
import { lazy, Suspense } from 'react'
import type { ChatMessage } from './chat-model.ts'

const TowxmlMessage = lazy(() => import('./towxml-message.tsx'))

type ChatBodyProps = {
    readonly messages: readonly ChatMessage[]
    readonly requesting: boolean
    readonly viewportScrollTop: number
    readonly onAnswerReady: (answerId: string) => void
    readonly onAnswerFinish: () => void
}

function NativeAnswerFallback() {
    return (
        <View className="flex min-h-24 items-center justify-center py-6">
            <Text className="text-sm text-slate-400">Loading native Towxml…</Text>
        </View>
    )
}

export default function ChatBody({
    messages,
    requesting,
    viewportScrollTop,
    onAnswerReady,
    onAnswerFinish
}: ChatBodyProps) {
    const scrollCoordinatorId = messages.find((message) => message.kind === 'answer')?.id

    return (
        <View className="flex flex-col px-4 py-5">
            {messages.map((message) => {
                if (message.kind === 'question') {
                    return (
                        <View key={message.id} className="mb-4 flex w-full justify-end">
                            <View className="max-w-[86%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-3 shadow-sm">
                                <Text className="break-all text-[28rpx] leading-6 text-white">{message.content}</Text>
                            </View>
                        </View>
                    )
                }

                return (
                    <View key={message.id} className="mb-4 flex w-full justify-start">
                        <View className="w-[94%] overflow-hidden rounded-2xl rounded-bl-md bg-white px-4 pb-5 shadow-sm">
                            <View className="flex items-center justify-between border-b border-slate-100 py-3">
                                <Text className="text-[22rpx] font-semibold tracking-wide text-emerald-600 uppercase">
                                    Native Towxml
                                </Text>
                                {message.openTyper && !message.streamFinished ? (
                                    <Text className="text-[22rpx] text-slate-400">Receiving stream…</Text>
                                ) : null}
                            </View>
                            <Suspense fallback={<NativeAnswerFallback />}>
                                <TowxmlMessage
                                    answer={message}
                                    scrollTop={viewportScrollTop}
                                    trackScroll={message.id === scrollCoordinatorId}
                                    onReady={onAnswerReady}
                                    onFinish={onAnswerFinish}
                                />
                            </Suspense>
                        </View>
                    </View>
                )
            })}

            {requesting ? (
                <View className="mb-4 flex w-full justify-start">
                    <View className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white px-4 py-4 shadow-sm">
                        <View className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                        <Text className="text-sm text-slate-500">Fetching Markdown…</Text>
                    </View>
                </View>
            ) : null}
        </View>
    )
}
