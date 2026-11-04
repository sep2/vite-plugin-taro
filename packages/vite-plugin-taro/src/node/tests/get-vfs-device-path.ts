import path from 'node:path'

/** Uses the drive-qualified spelling of the Windows null device so module-path normalization preserves it. */
export function getVfsDevicePath(devicePath: string, cwd: string): string {
    return devicePath === '\\\\.\\nul' ? path.win32.resolve(cwd, '\\nul') : devicePath
}
