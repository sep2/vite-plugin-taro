import fs from 'node:fs/promises'
import path from 'node:path'
import { once } from '../../../utils/once.ts'

/** Creates the one startup cleanup allowed before Rolldown begins tracking incremental output in memory. */
export function createInitialOutputDirectoryCleaner(directory: string): () => Promise<void> {
    // Later full builds suppress byte-identical emitted assets. Clearing again would delete those files behind Rolldown's
    // output cache, so the writer would correctly emit no bytes and leave the physical Mini Program incomplete.
    return once(() => emptyOutputDirectory(directory))
}

/** Empties an output directory without replacing the directory itself or deleting Git metadata. */
export async function emptyOutputDirectory(directory: string): Promise<void> {
    await fs.mkdir(directory, { recursive: true })
    const entries = await fs.readdir(directory)

    await Promise.all(
        entries
            .filter((entry) => entry !== '.git')
            .map((entry) => fs.rm(path.join(directory, entry), { force: true, recursive: true }))
    )
}
