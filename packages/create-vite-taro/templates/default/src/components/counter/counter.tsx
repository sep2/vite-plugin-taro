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

export function Counter(props: CounterProps) {
    // #ifdef wx
    return <NativeCounter {...props} />
    // #endif

    // #ifndef wx
    return <SharedCounter {...props} />
    // #endif
}
