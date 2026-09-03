import { createDevtoolsHmrRuntime } from '../../mini/dev/modes/devtools/devtools-runtime.ts'
import { connectWxSocket } from './connect-wx-socket.ts'

// The App-global singleton survives Page shell re-evaluation and owns the retained module graph.
Reflect.set(global, '__rolldown_runtime__', createDevtoolsHmrRuntime(connectWxSocket))
