import {
    type InterpreterServerMessage,
    interpreterServerEvent
} from '../../../../../../runtime/wx/dev/modes/interpreter/interpreter-protocol.ts'
import { runtimeControlEvent } from '../../../../../../runtime/wx/dev/wx-hmr-protocol.ts'
import { resolveRuntimeFile } from '../../../../../utils/packages.ts'
import { appShellFileName } from '../../../module/module.ts'
import { hmrInfoFileName } from '../../hmr-files.ts'
import type { WxHmrAction, WxHmrMode } from '../../hmr-mode.ts'
import type { PatchPublication } from '../../hmr-protocol.ts'

const interpreterRuntimeFile = resolveRuntimeFile('wx/dev/modes/interpreter/interpreter-runtime')

/** Creates the pure interpreter adapter whose events are dispatched by the shared development host. */
export function createInterpreterHmrMode(): WxHmrMode {
    return {
        runtimeFile: interpreterRuntimeFile,
        plugins: [],
        createEntryBanner: createInterpreterEntryBanner,
        reset: () => undefined,
        publish: toSourceEvent,
        replay: replayJournal
    }
}

/** Returns the current journal suffix for an initial subscription without retaining another snapshot. */
function replayJournal(publication: PatchPublication | undefined, buildId: string): WxHmrAction | undefined {
    if (!publication) {
        return undefined
    }
    if (publication.buildId !== buildId) {
        return {
            kind: 'event',
            event: runtimeControlEvent,
            data: { kind: 'close', reason: 'build replaced' }
        }
    }
    if (publication.patches.length === 0) {
        return undefined
    }
    return toSourceEvent(publication)
}

function toSourceEvent(publication: PatchPublication): WxHmrAction {
    const message: InterpreterServerMessage = {
        kind: 'patches',
        buildId: publication.buildId,
        patches: publication.patches
    }
    return { kind: 'event', event: interpreterServerEvent, data: message }
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
