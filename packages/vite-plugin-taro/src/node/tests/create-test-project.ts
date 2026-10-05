import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { after } from 'node:test'
import { packageRequire } from '../utils/packages.ts'
import { projectTempDir } from './project-temp-dir.ts'

// Each test process owns one disposable workspace; normal teardown removes it even if a fixture fails during setup.
const workspace = await realpath(await mkdtemp(path.join(projectTempDir, 'vpt-test-workspace-')))
after(() => rm(workspace, { recursive: true, force: true }))

// Keep dependencies above fixture inventories and mock packages. A directory symlink, unlike a Windows junction,
// preserves pnpm's relative package links. Windows requires Developer Mode (enabled in CI) or symlink privileges.
const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
await symlink(path.join(packageRoot, 'node_modules'), path.join(workspace, 'node_modules'), 'dir')

/** Creates an isolated consumer project under the repository-root tmp/ directory, outside node_modules. */
export function createTestProject(prefix: string): Promise<string> {
    return mkdtemp(path.join(workspace, prefix))
}
