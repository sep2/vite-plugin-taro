import { createInterpreterHmrRuntime } from '../../mini/dev/modes/interpreter/interpreter-runtime.ts'
import { connectZfbSocket } from './connect-zfb-socket.ts'

// Rolldown reads this singleton as a free identifier, so install it on the language global. It retains interpreted factories,
// the socket, module cache, and Refresh boundaries.
Reflect.set(globalThis, '__rolldown_runtime__', createInterpreterHmrRuntime(connectZfbSocket))
