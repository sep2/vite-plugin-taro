import { createDevtoolsHmrRuntime } from '../../mini/dev/modes/devtools/devtools-runtime.ts'
import { connectWxSocket } from './connect-wx-socket.ts'

// Rolldown reads this singleton as a free identifier, so install it on the language global. It survives Page shell
// re-evaluation and owns the retained module graph.
Reflect.set(globalThis, '__rolldown_runtime__', createDevtoolsHmrRuntime(connectWxSocket))
