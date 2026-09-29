import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Publishes one complete editor generation so Rolldown's real watcher sees a native filesystem event on every platform. */
export async function publishSourceGeneration(filePath: string, source: string): Promise<void> {
    const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.txt`)
    try {
        await writeFile(temporaryPath, source)
        await rename(temporaryPath, filePath)
    } finally {
        await rm(temporaryPath, { force: true })
    }
}
