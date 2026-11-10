import { createDevtoolsHmrRuntime } from '../../mini/dev/modes/devtools/devtools-runtime.ts'
import { connectXhsSocket } from './connect-xhs-socket.ts'

// The singleton retains the module graph while native Page shells deliver compiled patch factories.
Reflect.set(globalThis, '__rolldown_runtime__', createDevtoolsHmrRuntime(connectXhsSocket))
