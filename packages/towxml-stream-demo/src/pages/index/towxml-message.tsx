import { defineNativeComponent } from 'virtual:taro/native'
import type { AnswerMessage } from './chat-model.ts'

const Towxml = defineNativeComponent(import('../../native/towxml-adapter'), {
    properties: {
        towxmlId: String,
        initialMarkdown: String,
        markdownChunk: {
            sequence: Number,
            value: String
        },
        speed: Number,
        openTyper: Boolean,
        theme: String,
        streamFinished: Boolean,
        stopRequested: Boolean,
        scrollTop: Number,
        trackScroll: Boolean
    },
    events: {
        finish: {
            message: String
        },
        historyMessageFinish: {
            message: String
        },
        ready: {
            towxmlId: String
        }
    }
})

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
