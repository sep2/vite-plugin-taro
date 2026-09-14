import { defineNativeComponent, type NativeComponentEvent } from 'virtual:taro/native'
import type { AnswerMessage } from './chat-model.ts'

type TowxmlProps = {
    towxmlId: string
    initialMarkdown: string
    markdownChunk: AnswerMessage['markdownChunk']
    speed: number
    openTyper: boolean
    theme: string
    streamFinished: boolean
    stopRequested: boolean
    scrollTop: number
    trackScroll: boolean
    onFinish?: (event: NativeComponentEvent<{ message: string }>) => void
    onHistoryMessageFinish?: (event: NativeComponentEvent<{ message: string }>) => void
    onReady?: (event: NativeComponentEvent<{ towxmlId: string }>) => void
}

const Towxml = defineNativeComponent<TowxmlProps>(() => import('../../native/towxml-adapter/towxml-adapter.js'))

type TowxmlMessageProps = {
    readonly answer: AnswerMessage
    readonly scrollTop: number
    readonly trackScroll: boolean
    readonly onReady: (answerId: string) => void
    readonly onFinish: () => void
}

export default function TowxmlMessage({ answer, scrollTop, trackScroll, onReady, onFinish }: TowxmlMessageProps) {
    return (
        <Towxml
            towxmlId={answer.id}
            initialMarkdown={answer.initialMarkdown}
            markdownChunk={answer.markdownChunk}
            speed={6}
            openTyper={answer.openTyper}
            theme="light"
            streamFinished={answer.streamFinished}
            stopRequested={answer.stopRequested}
            scrollTop={scrollTop}
            trackScroll={trackScroll}
            onReady={(event) => {
                onReady(event.detail.towxmlId)
            }}
            onFinish={() => {
                if (answer.openTyper) onFinish()
            }}
        />
    )
}
