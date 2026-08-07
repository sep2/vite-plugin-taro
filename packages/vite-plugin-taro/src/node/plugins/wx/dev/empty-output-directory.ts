import fs from 'node:fs/promises'
import path from 'node:path'

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
