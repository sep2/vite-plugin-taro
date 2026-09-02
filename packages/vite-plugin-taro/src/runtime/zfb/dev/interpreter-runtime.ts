import { createInterpreterHmrRuntime } from '../../mini/dev/modes/interpreter/interpreter-runtime.ts'
import { connectZfbSocket } from './connect-zfb-socket.ts'

// The App-global singleton retains interpreted factories, the socket, module cache, and Refresh boundaries.
Reflect.set(__VPT_RUNTIME_GLOBAL__, '__rolldown_runtime__', createInterpreterHmrRuntime(connectZfbSocket))
