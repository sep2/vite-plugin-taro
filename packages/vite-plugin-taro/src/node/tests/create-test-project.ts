import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after } from 'node:test'
import { packageRequire } from '../utils/packages.ts'

// Each test process owns one disposable workspace; normal teardown removes it even if a fixture fails during setup.
const workspace = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-test-workspace-')))
after(() => rm(workspace, { recursive: true, force: true }))

// Resolve real dependencies from the parent without putting node_modules inside fixture file inventories or mock packages.
// A junction also works on Windows without requiring permission to create directory symlinks.
const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
await symlink(path.join(packageRoot, 'node_modules'), path.join(workspace, 'node_modules'), 'junction')

/** Creates an isolated consumer project outside the repository and node_modules, preserving application transforms. */
export function createTestProject(prefix: string): Promise<string> {
    return mkdtemp(path.join(workspace, prefix))
}
