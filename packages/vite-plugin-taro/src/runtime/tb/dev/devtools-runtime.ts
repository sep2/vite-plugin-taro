import { createDevtoolsHmrRuntime } from '../../mini/dev/modes/devtools/devtools-runtime.ts'
import { connectTbSocket } from './connect-tb-socket.ts'

// One App-global runtime owns the retained module graph across native Page evaluations.
Reflect.set(globalThis, '__rolldown_runtime__', createDevtoolsHmrRuntime(connectTbSocket))
