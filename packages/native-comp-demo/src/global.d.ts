import type { PropsWithChildren } from 'react'

type NativeCounterProps = PropsWithChildren<{
    count: number
    onIncrement?: (event: { detail: { value: number } }) => void
}>

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'native-counter': NativeCounterProps
        }
    }
}
