import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { HmrInfo } from './hmr-protocol.ts'

export const hmrInfoFileName = 'hmr/info.js'

/**
 * Renders immutable CommonJS metadata because App startup must initialize the runtime synchronously before any entry capsule.
 * Freezing also prevents application code from accidentally changing the build identity or socket endpoint for the App heap.
 */
export function renderHmrInfo(info: HmrInfo): string {
    return `module.exports = Object.freeze(${JSON.stringify(info)});\n`
}

/**
 * Renders the native App style entry for one complete development build.
 *
 * Imported global CSS can change while the entry remains byte-identical. DevTools may then reuse an older persistent compile
 * cache after it restarts. Tying this inert comment to the build identity invalidates that cache once per complete build,
 * while incremental style updates continue changing only the imported file and therefore preserve the App heap.
 */
export function renderDevelopmentAppStyle(globalStyleFileName: string, buildId: string): string {
    return `@import "./${globalStyleFileName}";\n/* vpt-build:${buildId} */\n`
}

/**
 * Atomically publishes one physical development file so DevTools can observe only complete generations.
 *
 * Writing directly to the watched JavaScript path exposes truncate and partial-write states as separate filesystem events. A
 * sibling temporary file plus same-filesystem rename makes the destination replacement atomic while remaining reusable for
 * metadata and styles; the `.txt` suffix keeps DevTools from compiling the temporary source as another Mini Program module.
 */
export async function writeDevelopmentFile(outDir: string, fileName: string, source: string): Promise<void> {
    const filePath = path.join(outDir, fileName)
    const directory = path.dirname(filePath)

    await fs.mkdir(directory, { recursive: true })

    const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.txt`)

    try {
        // DevTools ignores the temporary .txt file; keeping it beside the destination guarantees a same-filesystem rename.
        await fs.writeFile(temporaryPath, source)
        await fs.rename(temporaryPath, filePath)
    } finally {
        // rename removes the source path on success; force cleanup covers interrupted writes and failed replacements.
        await fs.rm(temporaryPath, { force: true })
    }
}
