import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { UpdatePublication } from './topology/types.ts'

export const hmrInfoFileName = 'hmr/info.js'
export const hmrUpdateFileName = 'hmr/update.js'

/** Immutable App-loaded control metadata for one complete physical build. */
export type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
    token: string
}>

/** Renders the synchronous CommonJS metadata module loaded by native app.js. */
export function renderHmrInfo(info: HmrInfo): string {
    return `module.exports = Object.freeze(${JSON.stringify(info)});\n`
}

/** Renders the valid inert update dependency installed at every complete-build boundary. */
export function renderInitialHmrUpdate(): string {
    return 'module.exports = undefined;\n'
}

/**
 * Renders one executable contiguous patch range.
 *
 * The HTTP channel never receives this source. DevTools compiles this physical module and reruns page-side code; the
 * App-owned runtime validates versions, executes each retained Rolldown patch, and only then advances its poll version.
 */
export function renderHmrUpdate(publication: UpdatePublication): string {
    const fromVersion = publication.patches[0]?.version - 1
    const targetVersion = publication.patches.at(-1)?.version
    if (!Number.isSafeInteger(fromVersion) || !Number.isSafeInteger(targetVersion)) {
        throw new Error('Cannot render an empty or non-contiguous HMR publication.')
    }

    for (let index = 0; index < publication.patches.length; index += 1) {
        if (publication.patches[index].version !== fromVersion + index + 1) {
            throw new Error('Cannot render a non-contiguous HMR publication.')
        }
    }

    const metadata = {
        buildId: publication.buildId,
        fromVersion,
        publicationId: publication.publicationId,
        targetVersion
    }
    const patchSource = publication.patches.map(({ patch }) => patch.code).join('\n')

    return `// publication ${publication.publicationId}\nconst __rolldown_runtime__ = global.__rolldown_runtime__;\nmodule.exports = __rolldown_runtime__.applyPublication(${JSON.stringify(metadata)}, () => {\n${indent(patchSource, 4)}\n});\n`
}

/** Atomically replaces one DevHost-owned physical project file. */
export async function writeHmrFile(outDir: string, fileName: string, source: string): Promise<void> {
    const filePath = path.join(outDir, fileName)
    const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    try {
        await fs.writeFile(temporaryPath, source)
        await fs.rename(temporaryPath, filePath)
    } finally {
        await fs.rm(temporaryPath, { force: true })
    }
}

function indent(value: string, spaces: number): string {
    const prefix = ' '.repeat(spaces)
    return value
        .split('\n')
        .map((line) => `${prefix}${line}`)
        .join('\n')
}
