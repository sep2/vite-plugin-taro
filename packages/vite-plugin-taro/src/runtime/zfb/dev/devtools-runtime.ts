import { createDevtoolsHmrRuntime } from '../../mini/dev/modes/devtools/devtools-runtime.ts'
import { connectZfbSocket } from './connect-zfb-socket.ts'

// Rolldown reads this singleton as a free identifier, so install it on the language global. It survives Page shell
// re-evaluation and owns the retained module graph.
Reflect.set(globalThis, '__rolldown_runtime__', createDevtoolsHmrRuntime(connectZfbSocket))
