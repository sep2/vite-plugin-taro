import { Button, Input, Text, View } from 'virtual:taro/components'
import type { ChatStatus } from './chat-model.ts'

type ChatComposerProps = {
    readonly input: string
    readonly status: ChatStatus
    readonly onInputChange: (input: string) => void
    readonly onSend: () => void
    readonly onStop: () => void
}

export default function ChatComposer({ input, status, onInputChange, onSend, onStop }: ChatComposerProps) {
    const isTyping = status === 'typing'
    const isRequesting = status === 'requesting'
    const buttonClassName = isTyping
        ? 'm-0 flex h-12 w-20 shrink-0 items-center justify-center rounded-xl bg-rose-500 p-0 text-sm font-semibold text-white'
        : 'm-0 flex h-12 w-20 shrink-0 items-center justify-center rounded-xl bg-indigo-600 p-0 text-sm font-semibold text-white disabled:bg-slate-300'

    return (
        <View className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3 pb-4 shadow-[0_-8px_30px_rgba(15,23,42,0.06)]">
            <View className="flex items-center gap-3">
                <Input
                    className="h-12 min-w-0 flex-1 rounded-xl bg-slate-100 px-4 text-[28rpx] text-slate-900"
                    value={input}
                    disabled={status !== 'idle'}
                    cursorSpacing={24}
                    confirmType="send"
                    placeholder="Enter a public Markdown URL"
                    onInput={(event) => {
                        onInputChange(event.detail.value)
                    }}
                    onConfirm={() => {
                        if (status === 'idle') onSend()
                    }}
                />
                <Button
                    className={buttonClassName}
                    disabled={isRequesting}
                    onClick={() => {
                        if (isTyping) onStop()
                        else onSend()
                    }}
                >
                    {isTyping ? 'Stop' : isRequesting ? 'Loading' : 'Send'}
                </Button>
            </View>
            <Text className="mt-2 block text-[22rpx] text-slate-400">
                The URL is fetched by wx.request, then fed to Towxml in small ordered chunks.
            </Text>
        </View>
    )
}
