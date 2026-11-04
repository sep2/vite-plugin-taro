import os from 'node:os'
import { create, type VirtualFileSystem } from 'node:vfs'
import { getVfsDevicePath } from './get-vfs-device-path.ts'

// @types/node defines the filesystem API but does not yet include Node 26's mounting methods.
declare module 'node:vfs' {
    interface VirtualFileSystem {
        mount(): string
        unmount(): void
    }
}

function mountMemoryFilesystem(filesystem: VirtualFileSystem): string {
    const devNull = os.devNull
    const devicePath = getVfsDevicePath(devNull, process.cwd())
    if (devicePath === devNull) {
        return filesystem.mount()
    }
    // Node caches its reserved VFS root on the first mount. Seed it with a spelling
    // that Vite preserves; the scoped OS property change never survives this synchronous call.
    Object.defineProperty(os, 'devNull', { value: devicePath })
    try {
        return filesystem.mount()
    } finally {
        Object.defineProperty(os, 'devNull', { value: devNull })
    }
}

/** Owns a writable memory tree and its node:fs mount for one fixture lifetime. */
export function createMemoryFilesystem() {
    const filesystem = create()
    const root = mountMemoryFilesystem(filesystem)
    return {
        root,
        [Symbol.dispose]() {
            filesystem.unmount()
        }
    }
}
