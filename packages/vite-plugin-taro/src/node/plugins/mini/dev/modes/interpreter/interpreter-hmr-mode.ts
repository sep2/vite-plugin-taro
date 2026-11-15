import path from 'node:path'
import { interpreterServerEvent } from '../../../../../../runtime/mini/dev/modes/interpreter/interpreter-protocol.ts'
import { isMiniAppShell } from '../../../module/module.ts'
import { hmrInfoFileName } from '../../hmr-files.ts'
import type { MiniHmrMode } from '../../hmr-mode.ts'
import type { PatchPublication } from '../../hmr-protocol.ts'

/** Creates the pure interpreter adapter whose events are dispatched by the shared development host. */
export function createInterpreterHmrMode(runtimeFile: string): MiniHmrMode {
    return {
        rebuildStrategy: 'on-failure',
        runtimeFile,
        plugins: [],
        entryBanner(chunk) {
            if (isMiniAppShell(chunk.facadeModuleId)) {
                const infoPath = path.posix.relative(path.posix.dirname(chunk.fileName), hmrInfoFileName)
                return `__rolldown_runtime__.initialize(require('./${infoPath}'));\n`
            }
            return ''
        },
        publish: (publication: PatchPublication) => ({
            kind: 'event',
            event: interpreterServerEvent,
            data: {
                kind: 'patches',
                buildId: publication.buildId,
                patches: publication.patches
            }
        })
    } satisfies MiniHmrMode
}
