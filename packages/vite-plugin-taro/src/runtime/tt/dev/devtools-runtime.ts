import { createDevtoolsHmrRuntime } from '../../mini/dev/modes/devtools/devtools-runtime.ts'
import { connectTtSocket } from './connect-tt-socket.ts'

// The language-global singleton retains Rolldown's module graph across native Page shell execution.
Reflect.set(globalThis, '__rolldown_runtime__', createDevtoolsHmrRuntime(connectTtSocket))
