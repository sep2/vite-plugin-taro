import type { MiniHmrMode } from '../../hmr-mode.ts'

/** Selects complete-output replacement without installing a patch transport or native Page handoff. */
export function createRebuildHmrMode(runtimeFile: string): MiniHmrMode {
    return {
        rebuildStrategy: 'always',
        // Reuse the existing native module runtime without initializing its patch socket or Page handoff.
        runtimeFile,
        plugins: [],
        createEntryBanner: createRebuildEntryBanner
    } satisfies MiniHmrMode
}

/** Complete builds need no host-only metadata or patch dependency in native entries. */
function createRebuildEntryBanner(_pageFiles: ReadonlySet<string>) {
    return (_chunk: Readonly<{ name: string; fileName: string }>): string => ''
}
