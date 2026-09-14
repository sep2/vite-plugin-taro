import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'

/** Publish a whole source generation without exposing writeFile's truncate/write interval to Vite. */
export async function writeFixtureSource(file: string, source: string): Promise<void> {
    const temporaryFile = `${file}.${randomUUID()}.tmp`
    try {
        await writeFile(temporaryFile, source)
        await rename(temporaryFile, file)
    } finally {
        await rm(temporaryFile, { force: true })
    }
}
