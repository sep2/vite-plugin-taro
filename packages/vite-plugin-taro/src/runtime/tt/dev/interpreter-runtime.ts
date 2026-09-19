import { createInterpreterHmrRuntime } from '../../mini/dev/modes/interpreter/interpreter-runtime.ts'
import { connectTtSocket } from './connect-tt-socket.ts'

// One retained runtime owns the socket, interpreted factories, module cache, and Refresh boundaries.
Reflect.set(globalThis, '__rolldown_runtime__', createInterpreterHmrRuntime(connectTtSocket))
