import { createDevtoolsHmrRuntime } from '../../mini/dev/modes/devtools/devtools-runtime.ts'
import { connectZfbSocket } from './connect-zfb-socket.ts'

// The App-global singleton survives Page shell re-evaluation and owns the retained module graph.
Reflect.set(global, '__rolldown_runtime__', createDevtoolsHmrRuntime(connectZfbSocket))
