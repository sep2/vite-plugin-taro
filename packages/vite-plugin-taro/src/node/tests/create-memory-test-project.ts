import type { TestContext } from 'node:test'
import { createMemoryFilesystem } from './create-memory-filesystem.ts'

/** Mounts an isolated in-memory fixture so production node:fs calls use the same tree. */
export function createMemoryTestProject(context: Pick<TestContext, 'after'>): string {
    const fixture = createMemoryFilesystem()
    context.after(() => fixture[Symbol.dispose]())
    return fixture.root
}
