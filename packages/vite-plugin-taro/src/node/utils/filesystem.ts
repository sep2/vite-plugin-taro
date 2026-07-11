/** Node-only filesystem helpers shared by build targets and development services. */
import fs from 'node:fs/promises'
import path from 'node:path'

export type FileSource = string | Uint8Array
export type FileWrite = { file: string; source: FileSource }

/** Writes through a sibling temporary file so observers never read partial contents. */
export async function writeFileAtomically(file: string, source: FileSource): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const temporaryFile = `${file}.tmp`
    await fs.writeFile(temporaryFile, source)
    await fs.rename(temporaryFile, file)
}

export async function writeFilesAtomically(files: FileWrite[]): Promise<void> {
    await Promise.all(files.map(({ file, source }) => writeFileAtomically(file, source)))
}

/** Copies a directory when present and treats a missing optional source as empty. */
export async function copyDirectoryIfExists(source: string, destination: string): Promise<void> {
    if (!source) return
    try {
        await fs.cp(source, destination, { recursive: true, force: true })
    } catch (error) {
        if (!isMissingFileError(error)) throw error
    }
}

/** Mirrors one optional file: copy existing files, ignore directories, and remove a missing source's destination. */
export async function copyFileOrRemove(source: string, destination: string): Promise<void> {
    try {
        const stat = await fs.stat(source)
        if (stat.isDirectory()) return
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.copyFile(source, destination)
    } catch (error) {
        if (!isMissingFileError(error)) throw error
        await fs.rm(destination, { recursive: true, force: true })
    }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
