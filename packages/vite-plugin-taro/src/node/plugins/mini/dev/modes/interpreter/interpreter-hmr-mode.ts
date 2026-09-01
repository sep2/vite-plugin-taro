import { interpreterServerEvent } from '../../../../../../runtime/wx/dev/modes/interpreter/interpreter-protocol.ts'
import { resolveRuntimeFile } from '../../../../../utils/packages.ts'
import { appShellFileName } from '../../../module/module.ts'
import { hmrInfoFileName } from '../../hmr-files.ts'
import type { MiniHmrMode } from '../../hmr-mode.ts'
import type { PatchPublication } from '../../hmr-protocol.ts'

const interpreterRuntimeFile = resolveRuntimeFile('wx/dev/modes/interpreter/interpreter-runtime')

/** Creates the pure interpreter adapter whose events are dispatched by the shared development host. */
export function createInterpreterHmrMode(): MiniHmrMode {
    return {
        runtimeFile: interpreterRuntimeFile,
        plugins: [],
        createEntryBanner: createInterpreterEntryBanner,
        reset: () => undefined,
        publish: (publication: PatchPublication) => ({
            kind: 'event',
            event: interpreterServerEvent,
            data: {
                kind: 'patches',
                buildId: publication.buildId,
                patches: publication.patches
            }
        })
    }
}

/** Interpreter runtime starts from App only; Pages have no patch edge or lifecycle handoff. */
function createInterpreterEntryBanner() {
    return (chunk: Readonly<{ name: string; fileName: string }>): string => {
        if (chunk.name === appShellFileName) {
            return `__rolldown_runtime__.initialize(require('./${hmrInfoFileName}'));\n`
        }
        return ''
    }
}
