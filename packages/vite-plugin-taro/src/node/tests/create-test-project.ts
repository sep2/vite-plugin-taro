import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { after } from 'node:test'
import { projectTempDir } from './project-temp-dir.ts'

// Each test process owns one disposable workspace; normal teardown removes it even if a fixture fails during setup.
const workspace = await mkdtemp(path.join(projectTempDir, 'vpt-test-workspace-'))
after(() => rm(workspace, { recursive: true, force: true }))

/** Creates a consumer fixture below the plugin so Node resolves its existing dependencies without extra links. */
export function createTestProject(prefix: string): Promise<string> {
    return mkdtemp(path.join(workspace, prefix))
}
