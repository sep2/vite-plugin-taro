import { createInterpreterHmrRuntime } from '../../mini/dev/modes/interpreter/interpreter-runtime.ts'
import { connectTbSocket } from './connect-tb-socket.ts'

// One App-global runtime owns the retained module graph across native Page evaluations.
Reflect.set(globalThis, '__rolldown_runtime__', createInterpreterHmrRuntime(connectTbSocket))
