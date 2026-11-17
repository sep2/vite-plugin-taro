import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { DevEnvironment, isRunnableDevEnvironment } from 'vite'
import { createTestProject } from '../../tests/create-test-project.ts'
import { createPageServer } from './create-page-server.ts'

test('loads the virtual entry and closes the SSR runner and watcher', async (t) => {
    const root = await createTestProject('page-server-')
    const initialized = t.mock.method(DevEnvironment.prototype, 'init')
    const server = await createPageServer({ root })
    t.after(() => server.close())
    const initialization = initialized.mock.calls.find(
        (call) => call.this instanceof DevEnvironment && call.this.name === 'ssr'
    )
    const environment: unknown = initialization?.this
    const watcher = initialization?.arguments[0]?.watcher
    assert.ok(environment instanceof DevEnvironment && isRunnableDevEnvironment(environment))
    assert.ok(watcher)
    const runner = environment.runner
    const entry = await runner.import<{ default: unknown }>('virtual:ps/entry')
    assert.deepEqual(entry.default, {})
    await server.close()
    assert.equal(runner.isClosed(), true)
    assert.deepEqual(watcher.getWatched(), {})
})

test('discovers source TSX files as lazy loaders', async (t) => {
    const root = await createTestProject('page-glob-')
    for (const file of [
        'src/home.tsx',
        'src/nested/about.tsx',
        'src/node_modules/ignored.tsx',
        'src/settings.ts',
        'outside.tsx'
    ]) {
        const filename = path.join(root, file)
        await mkdir(path.dirname(filename), { recursive: true })
        await writeFile(filename, "throw new Error('Discovered module executed'); export default () => <div />;")
    }
    const initialized = t.mock.method(DevEnvironment.prototype, 'init')
    const server = await createPageServer({ root })
    t.after(() => server.close())
    const environment: unknown = initialized.mock.calls.find(
        (call) => call.this instanceof DevEnvironment && call.this.name === 'ssr'
    )?.this
    assert.ok(environment instanceof DevEnvironment && isRunnableDevEnvironment(environment))
    const entry = await environment.runner.import<{ default: Record<string, () => Promise<unknown>> }>(
        'virtual:ps/entry'
    )
    assert.deepEqual(Object.keys(entry.default).sort(), ['/src/home.tsx', '/src/nested/about.tsx'])
    assert.ok(Object.values(entry.default).every((loader) => typeof loader === 'function'))
})
