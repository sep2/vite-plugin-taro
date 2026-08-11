// #ifdef wx
import { NativeCounter } from './native-counter.tsx'
// #endif

// #ifdef h5
import { WebCounter } from './web-counter.tsx'
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

    // #ifdef h5
    return <WebCounter {...props} />
    // #endif
}
