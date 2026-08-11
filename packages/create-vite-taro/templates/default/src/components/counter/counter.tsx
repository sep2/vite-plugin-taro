import type { ComponentType } from 'react'
import type { CounterProps } from './counter-props.ts'

// #ifdef wx
import { NativeCounter } from './native-counter.tsx'
// #endif

// #ifdef h5
import { WebCounter } from './web-counter.tsx'

// #endif

// The conditional compiler retains exactly one assignment, so this binding selects one target without bundling the other.
let CounterImplementation: ComponentType<CounterProps>

// #ifdef wx
CounterImplementation = NativeCounter
// #endif

// #ifdef h5
CounterImplementation = WebCounter
// #endif

export function Counter(props: CounterProps) {
    return <CounterImplementation {...props} />
}
