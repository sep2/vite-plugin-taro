import fs from 'node:fs/promises'
import path from 'node:path'
import type { WxOutputFile } from './bundle-output.ts'

export async function writeWxOutputFiles(outDir: string, output: WxOutputFile[]): Promise<void> {
    await Promise.all(
        output.map((item) => {
            const source = item.type === 'chunk' ? item.code : item.source
            return writeWxOutputFile(outDir, item.fileName, source)
        })
    )
}

export async function writeWxOutputFile(outDir: string, fileName: string, source: string | Uint8Array): Promise<void> {
    const file = path.join(outDir, fileName)
    await fs.mkdir(path.dirname(file), { recursive: true })
    const temporaryFile = `${file}.tmp`
    await fs.writeFile(temporaryFile, source)
    await fs.rename(temporaryFile, file)
}

export async function syncWxPublicDirectory(publicDir: string, outDir: string): Promise<void> {
    if (!publicDir) return
    try {
        await fs.cp(publicDir, outDir, { recursive: true, force: true })
    } catch (error) {
        if (!isMissingFileError(error)) throw error
    }
}

export async function syncWxPublicFile(publicDir: string, outDir: string, file: string): Promise<void> {
    const destination = path.join(outDir, path.relative(publicDir, file))
    try {
        const stat = await fs.stat(file)
        if (stat.isDirectory()) return
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.copyFile(file, destination)
    } catch (error) {
        if (!isMissingFileError(error)) throw error
        await fs.rm(destination, { recursive: true, force: true })
    }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
