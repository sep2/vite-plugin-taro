export type QuestionMessage = {
    readonly id: string
    readonly kind: 'question'
    readonly content: string
}

export type MarkdownChunk = {
    readonly sequence: number
    readonly value: string
}

export type AnswerMessage = {
    readonly id: string
    readonly kind: 'answer'
    readonly initialMarkdown: string
    readonly markdownChunk: MarkdownChunk
    readonly openTyper: boolean
    readonly streamFinished: boolean
    readonly stopRequested: boolean
}

export type ChatMessage = QuestionMessage | AnswerMessage

export type ChatStatus = 'idle' | 'requesting' | 'typing'

export type ChatState = {
    readonly input: string
    readonly transcript: readonly ChatMessage[]
    readonly activeAnswer: AnswerMessage | null
    readonly status: ChatStatus
    readonly autoScroll: boolean
    readonly scrollTop: number
    readonly viewportScrollTop: number
}
