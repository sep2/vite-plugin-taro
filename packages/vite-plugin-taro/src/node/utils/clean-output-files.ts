import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'

/**
 * WeChat DevTools can retain stale file contents when output directories are deleted and recreated.
 * Preserve every directory so its watcher stays attached, retain caller-owned project files, and unlink the rest.
 */
export function cleanOutputFiles(directory: string, preservedRelativePaths: readonly string[]): void {
    mkdirSync(directory, { recursive: true })
    const preservedFiles = new Set(preservedRelativePaths.map((file) => path.resolve(directory, file)))

    for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
        const filePath = path.resolve(entry.parentPath, entry.name)
        if (!entry.isDirectory() && !preservedFiles.has(filePath)) {
            unlinkSync(filePath)
        }
    }
}
