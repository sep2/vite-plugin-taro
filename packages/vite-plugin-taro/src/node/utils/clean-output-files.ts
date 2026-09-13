import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'

/**
 * WeChat DevTools can retain stale file contents when output directories are deleted and recreated.
 * Preserve every directory so its watcher stays attached, but unlink every file to invalidate cached contents.
 */
export function cleanOutputFiles(directory: string): void {
    mkdirSync(directory, { recursive: true })

    for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
        const filePath = path.resolve(entry.parentPath, entry.name)
        if (!entry.isDirectory()) {
            unlinkSync(filePath)
        }
    }
}
