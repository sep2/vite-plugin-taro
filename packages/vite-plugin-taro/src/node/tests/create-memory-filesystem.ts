import { create } from 'node:vfs'

// @types/node defines the filesystem API but does not yet include Node 26's mounting methods.
declare module 'node:vfs' {
    interface VirtualFileSystem {
        mount(): string
        unmount(): void
    }
}

/** Owns a writable memory tree and its node:fs mount for one fixture lifetime. */
export function createMemoryFilesystem() {
    const filesystem = create()
    const root = filesystem.mount()
    return {
        root,
        [Symbol.dispose]() {
            filesystem.unmount()
        }
    }
}
