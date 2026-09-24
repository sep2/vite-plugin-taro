// #ifdef wx
import { NativeCounter } from './native-counter.tsx'
// #endif

// #ifndef wx
import { SharedCounter } from './shared-counter.tsx'
// #endif

export interface CounterProps {
    count: number
    onDecrement: () => void
    onIncrement: () => void
}

// Conditional compilation leaves exactly one target component in this tuple.
export const [Counter] = [
    // #ifdef wx
    NativeCounter,
    // #endif

    // #ifndef wx
    SharedCounter
    // #endif
]
