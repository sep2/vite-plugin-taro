import { Button, ScrollView, Text, View } from 'virtual:taro/components'
import ChatBody from './chat-body.tsx'
import ChatComposer from './chat-composer.tsx'
import { useStreamChat } from './use-stream-chat.ts'

export default function ChatPage() {
    const chat = useStreamChat()
    const messages = chat.state.activeAnswer
        ? [...chat.state.transcript, chat.state.activeAnswer]
        : chat.state.transcript

    return (
        <View className="relative flex h-screen flex-col overflow-hidden bg-slate-100 text-slate-950">
            <View className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
                <View className="flex items-center justify-between gap-4">
                    <View className="min-w-0">
                        <Text className="block text-lg font-bold text-slate-950">Towxml Stream Lab</Text>
                        <Text className="mt-1 block text-[24rpx] text-slate-500">
                            React shell · native Markdown renderer
                        </Text>
                    </View>
                    <View className="shrink-0 rounded-full bg-emerald-50 px-3 py-1">
                        <Text className="text-[22rpx] font-semibold text-emerald-700">WX native</Text>
                    </View>
                </View>
            </View>

            <ScrollView
                scrollY
                scrollWithAnimation
                className="min-h-0 flex-1"
                scrollTop={chat.state.scrollTop}
                onTouchStart={chat.pauseAutoScroll}
                onScroll={(event) => {
                    chat.trackViewportScroll(event.detail.scrollTop)
                }}
            >
                <ChatBody
                    messages={messages}
                    requesting={chat.state.status === 'requesting'}
                    viewportScrollTop={chat.state.viewportScrollTop}
                    onAnswerReady={chat.startAnswerStream}
                    onAnswerFinish={chat.finishAnswer}
                />
                <View className="h-px" />
            </ScrollView>

            {!chat.state.autoScroll && chat.state.status === 'typing' ? (
                <Button
                    className="absolute right-5 bottom-28 z-10 m-0 flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 p-0 text-lg text-white shadow-lg"
                    onClick={chat.resumeAutoScroll}
                >
                    ↓
                </Button>
            ) : null}

            <ChatComposer
                input={chat.state.input}
                status={chat.state.status}
                onInputChange={chat.setInput}
                onSend={() => {
                    void chat.sendQuestion()
                }}
                onStop={chat.stopTyping}
            />
        </View>
    )
}
