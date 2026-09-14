import Taro from 'virtual:taro/api'
import { useEffect, useReducer, useRef } from 'react'
import type { AnswerMessage, ChatState, QuestionMessage } from './chat-model.ts'

const sampleMarkdownUrl =
    'https://raw.githubusercontent.com/sep2/vite-plugin-taro/refs/heads/main/docs/src/content/docs/references/hmr-implementation.md'
const streamIntervalMilliseconds = 15
const streamChunkCodePoints = 24
const firstScrollTop = 1_000_000
const secondScrollTop = firstScrollTop + 1

const introductionMarkdown = `## React outside, Towxml inside

This interface is rendered with **React** and **Tailwind CSS**. Markdown answers are delegated to the copied native Towxml component.

1. Paste a public Markdown URL below.
2. Tap **Send** to fetch it.
3. Watch Towxml render the response as a stream.

> A sample URL is already filled in for a quick test.`

const initialState: ChatState = {
    input: sampleMarkdownUrl,
    transcript: [
        {
            id: 'welcome-answer',
            kind: 'answer',
            initialMarkdown: introductionMarkdown,
            markdownChunk: { sequence: 0, value: '' },
            openTyper: false,
            streamFinished: true,
            stopRequested: false
        }
    ],
    activeAnswer: null,
    status: 'idle',
    autoScroll: true,
    scrollTop: firstScrollTop,
    viewportScrollTop: 0
}

type ChatAction =
    | { readonly type: 'inputChanged'; readonly input: string }
    | { readonly type: 'questionSubmitted'; readonly question: QuestionMessage }
    | { readonly type: 'answerStarted'; readonly answer: AnswerMessage }
    | { readonly type: 'markdownChunkSent'; readonly sequence: number; readonly value: string }
    | { readonly type: 'streamFinished' }
    | { readonly type: 'stopRequested' }
    | { readonly type: 'answerFinished' }
    | { readonly type: 'autoScrollPaused' }
    | { readonly type: 'autoScrollResumed' }
    | { readonly type: 'viewportScrolled'; readonly scrollTop: number }

type StreamRuntime = {
    readonly answerId: string
    readonly source: string
    timer: ReturnType<typeof setInterval> | null
    offset: number
    sequence: number
}

function nextScrollTop(scrollTop: number): number {
    return scrollTop === firstScrollTop ? secondScrollTop : firstScrollTop
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
    switch (action.type) {
        case 'inputChanged':
            return { ...state, input: action.input }
        case 'questionSubmitted':
            return {
                ...state,
                input: '',
                transcript: [...state.transcript, action.question],
                status: 'requesting',
                scrollTop: state.autoScroll ? nextScrollTop(state.scrollTop) : state.scrollTop
            }
        case 'answerStarted':
            return {
                ...state,
                activeAnswer: action.answer,
                status: 'typing',
                scrollTop: state.autoScroll ? nextScrollTop(state.scrollTop) : state.scrollTop
            }
        case 'markdownChunkSent':
            if (!state.activeAnswer) return state
            return {
                ...state,
                activeAnswer: {
                    ...state.activeAnswer,
                    markdownChunk: {
                        sequence: action.sequence,
                        value: action.value
                    }
                },
                scrollTop: state.autoScroll ? nextScrollTop(state.scrollTop) : state.scrollTop
            }
        case 'streamFinished':
            if (!state.activeAnswer) return state
            return {
                ...state,
                activeAnswer: { ...state.activeAnswer, streamFinished: true }
            }
        case 'stopRequested':
            if (!state.activeAnswer) return state
            return {
                ...state,
                activeAnswer: {
                    ...state.activeAnswer,
                    streamFinished: true,
                    stopRequested: true
                }
            }
        case 'answerFinished':
            if (!state.activeAnswer) return { ...state, status: 'idle' }
            return {
                ...state,
                transcript: [...state.transcript, state.activeAnswer],
                activeAnswer: null,
                status: 'idle',
                scrollTop: state.autoScroll ? nextScrollTop(state.scrollTop) : state.scrollTop
            }
        case 'autoScrollPaused':
            return state.status === 'typing' ? { ...state, autoScroll: false } : state
        case 'autoScrollResumed':
            return {
                ...state,
                autoScroll: true,
                scrollTop: nextScrollTop(state.scrollTop)
            }
        case 'viewportScrolled':
            return { ...state, viewportScrollTop: action.scrollTop }
    }
}

function createMessageId(kind: 'question' | 'answer'): string {
    return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function serializeMarkdown(data: unknown): string {
    if (typeof data === 'string') return data
    return `\`\`\`json\n${JSON.stringify(data, null, 2) ?? String(data)}\n\`\`\``
}

function describeRequestFailure(url: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return `## Request failed\n\nTowxml could not load:\n\n\`${url.replaceAll('`', '\\`')}\`\n\n> ${message}`
}

async function requestMarkdown(url: string): Promise<string> {
    const response = await Taro.request({
        url,
        dataType: 'text'
    })
    return serializeMarkdown(response.data)
}

export function useStreamChat() {
    // Reducer state keeps all user-visible chat transitions atomic while streamed chunks arrive asynchronously.
    const [state, dispatch] = useReducer(chatReducer, initialState)
    // This mutable runtime owns the one active feeder timer so stop and unmount can cancel it without rerendering.
    const streamRuntimeRef = useRef<StreamRuntime | null>(null)
    // This mutable lifecycle flag prevents an outstanding network request from updating an unmounted page.
    const isMountedRef = useRef(true)

    function clearStreamTimer(): void {
        const runtime = streamRuntimeRef.current
        if (!runtime) return
        if (runtime.timer) clearInterval(runtime.timer)
        streamRuntimeRef.current = null
    }

    function sendNextChunk(runtime: StreamRuntime): void {
        if (runtime.offset >= runtime.source.length) {
            if (runtime.timer) clearInterval(runtime.timer)
            streamRuntimeRef.current = null
            if (isMountedRef.current) dispatch({ type: 'streamFinished' })
            return
        }

        let end = runtime.offset
        let codePointCount = 0
        while (end < runtime.source.length && codePointCount < streamChunkCodePoints) {
            const codePoint = runtime.source.codePointAt(end)
            if (codePoint === undefined) break
            end += String.fromCodePoint(codePoint).length
            codePointCount += 1
        }

        const value = runtime.source.slice(runtime.offset, end)
        runtime.offset = end
        runtime.sequence += 1
        dispatch({ type: 'markdownChunkSent', sequence: runtime.sequence, value })
    }

    function startStream(answerId: string): void {
        const runtime = streamRuntimeRef.current
        if (!runtime || runtime.answerId !== answerId || runtime.timer) return

        runtime.timer = setInterval(() => {
            sendNextChunk(runtime)
        }, streamIntervalMilliseconds)
        sendNextChunk(runtime)
    }

    async function sendQuestion(): Promise<void> {
        const url = state.input.trim()
        if (!url || state.status !== 'idle') return

        dispatch({
            type: 'questionSubmitted',
            question: {
                id: createMessageId('question'),
                kind: 'question',
                content: url
            }
        })

        let markdown: string
        try {
            markdown = await requestMarkdown(url)
        } catch (error) {
            markdown = describeRequestFailure(url, error)
        }
        if (!isMountedRef.current) return

        const answerId = createMessageId('answer')
        dispatch({
            type: 'answerStarted',
            answer: {
                id: answerId,
                kind: 'answer',
                initialMarkdown: '',
                markdownChunk: { sequence: 0, value: '' },
                openTyper: true,
                streamFinished: false,
                stopRequested: false
            }
        })
        // The source stays in JavaScript memory; React sends only bounded chunks after the native adapter reports ready.
        streamRuntimeRef.current = {
            answerId,
            source: markdown,
            timer: null,
            offset: 0,
            sequence: 0
        }
    }

    function stopTyping(): void {
        if (state.status !== 'typing') return
        clearStreamTimer()
        dispatch({ type: 'stopRequested' })
    }

    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
            const runtime = streamRuntimeRef.current
            if (runtime?.timer) clearInterval(runtime.timer)
            streamRuntimeRef.current = null
        }
    }, [])

    return {
        state,
        setInput(input: string) {
            dispatch({ type: 'inputChanged', input })
        },
        sendQuestion,
        stopTyping,
        startAnswerStream(answerId: string) {
            startStream(answerId)
        },
        finishAnswer() {
            clearStreamTimer()
            dispatch({ type: 'answerFinished' })
        },
        pauseAutoScroll() {
            dispatch({ type: 'autoScrollPaused' })
        },
        resumeAutoScroll() {
            dispatch({ type: 'autoScrollResumed' })
        },
        trackViewportScroll(scrollTop: number) {
            dispatch({ type: 'viewportScrolled', scrollTop })
        }
    }
}
