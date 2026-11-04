import type { TestContext } from 'node:test'
import { create } from 'node:vfs'

// @types/node defines the filesystem API but does not yet include Node 26's mounting methods.
declare module 'node:vfs' {
    interface VirtualFileSystem {
        mount(): string
        unmount(): void
    }
}

/** Mounts an isolated in-memory fixture so production node:fs calls use the same tree. */
export function createMemoryTestProject(context: Pick<TestContext, 'after'>): string {
    // Each test owns its writable filesystem and releases the mount even when setup or assertions fail.
    const filesystem = create()
    const root = filesystem.mount()
    context.after(() => filesystem.unmount())
    return root
}
