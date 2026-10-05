import assert from 'node:assert/strict'
import { readdir, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { packageRequire } from '../utils/packages.ts'
import { createTestProject } from './create-test-project.ts'
import { projectTempDir } from './project-temp-dir.ts'

test('isolates consumer fixtures in repository tmp without losing workspace dependency resolution', async () => {
    const first = await createTestProject('project-')
    const second = await createTestProject('project-')

    const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
    assert.equal(projectTempDir, await realpath(path.resolve(packageRoot, '../../tmp')))
    assert.notEqual(first, second)
    assert.equal(path.dirname(first), path.dirname(second))
    assert.equal(path.dirname(path.dirname(first)), projectTempDir)
    assert.deepEqual(await readdir(first), [])
    assert.deepEqual(await readdir(second), [])

    const dependencies = [
        'react',
        'react/jsx-runtime',
        'vite',
        '@vitejs/plugin-react',
        'vite-plugin-taro-runtime/runtime/mini'
    ]
    const require = createRequire(path.join(first, 'entry.js'))
    for (const dependency of dependencies) {
        assert.equal(require.resolve(dependency), packageRequire.resolve(dependency))
    }

    // ESM imports use the same fixture dependency layout as generated deps.js and Vite config modules.
    const entry = path.join(first, 'entry.mjs')
    await writeFile(entry, `export default ${JSON.stringify(dependencies)}.map(id => import.meta.resolve(id))`)
    const { default: resolved } = await import(pathToFileURL(entry).href)
    assert.deepEqual(
        resolved,
        dependencies.map((dependency) => pathToFileURL(packageRequire.resolve(dependency)).href)
    )
})
