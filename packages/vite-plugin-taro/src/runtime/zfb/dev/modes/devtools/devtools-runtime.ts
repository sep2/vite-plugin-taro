import { createDevtoolsHmrRuntime } from '../../../../mini/dev/modes/devtools/devtools-runtime.ts'
import { connectMiniSocket } from '../../connect-mini-socket.ts'

// The App-global singleton survives Page shell re-evaluation and owns the retained module graph.
Reflect.set(__VPT_RUNTIME_GLOBAL__, '__rolldown_runtime__', createDevtoolsHmrRuntime(connectMiniSocket))
