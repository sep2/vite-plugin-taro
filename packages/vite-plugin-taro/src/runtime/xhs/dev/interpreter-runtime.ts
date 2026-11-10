import { createInterpreterHmrRuntime } from '../../mini/dev/modes/interpreter/interpreter-runtime.ts'
import { connectXhsSocket } from './connect-xhs-socket.ts'

// One App-lifetime runtime owns interpreted factories, module state, and Refresh boundaries.
Reflect.set(globalThis, '__rolldown_runtime__', createInterpreterHmrRuntime(connectXhsSocket))
