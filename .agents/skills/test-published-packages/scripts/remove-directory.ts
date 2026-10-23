import { rmSync } from 'node:fs'

export function removeDirectory(path: string): void {
    // Windows DevTools releases watched directories asynchronously after closing its project window.
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
