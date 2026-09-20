import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

/** Publish a whole source generation without exposing writeFile's truncate/write interval to Vite. */
export async function writeFixtureSource(file: string, source: string): Promise<void> {
    const temporaryFile = `${file}.${randomUUID()}.tmp`
    try {
        await writeFile(temporaryFile, source)
        await publishSource(temporaryFile, file)
    } finally {
        await rm(temporaryFile, { force: true })
    }
}

async function publishSource(temporaryFile: string, file: string): Promise<void> {
    const deadline = Date.now() + 1_000
    // Windows readers can briefly deny replacement. Retry the atomic rename, never truncate the live source.
    for (;;) {
        try {
            await rename(temporaryFile, file)
            return
        } catch (error) {
            if (
                process.platform !== 'win32' ||
                !(error instanceof Error) ||
                !('code' in error) ||
                (error.code !== 'EPERM' && error.code !== 'EBUSY') ||
                Date.now() >= deadline
            ) {
                throw error
            }
            await delay(1)
        }
    }
}
