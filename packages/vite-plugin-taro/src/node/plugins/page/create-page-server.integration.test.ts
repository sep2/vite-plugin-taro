import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { DevEngine, dev, viteImportGlobPlugin } from 'rolldown/experimental'
import type { VptPageOption } from '../../../options.ts'
import { createTestProject } from '../../tests/create-test-project.ts'
import { publishSourceGeneration } from '../../tests/publish-source-generation.ts'
import { createPageServer } from './create-page-server.ts'

test('builds the empty virtual entry and closes its engine', async (t) => {
    const root = await createTestProject('page-server-')
    const closed = t.mock.method(DevEngine.prototype, 'close')
    const output = Promise.withResolvers<readonly VptPageOption[]>()
    const server = await createPageServer({ root, target: 'wx', publish: output.resolve, onError: output.reject })
    t.after(() => server.close())
    assert.deepEqual(await output.promise, [])
    await server.close()
    assert.equal(closed.mock.callCount(), 1)
})

test('publishes registered async page factories with route paths and target context', async (t) => {
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
        await writeFile(
            filename,
            `import { defineVptPage } from 'virtual:vpt';
            defineVptPage(async ({ target }) => {
                await new Promise(resolve => setImmediate(resolve));
                return { config: { target } };
            });
            export default () => 'UI_ONLY';`
        )
    }
    const output = Promise.withResolvers<readonly VptPageOption[]>()
    const server = await createPageServer({ root, target: 'wx', publish: output.resolve, onError: output.reject })
    t.after(() => server.close())
    assert.deepEqual(await output.promise, [
        { path: 'home', config: { target: 'wx' } },
        { path: 'nested/about', config: { target: 'wx' } }
    ])
})

test('preserves page registration through incremental tree-shaken glob imports', { timeout: 10_000 }, async (t) => {
    const root = await createTestProject('page-incremental-')
    const entry = path.join(root, 'entry.ts')
    const source = (title: string) => `
        import { defineVptPage } from 'virtual:vpt';
        defineVptPage(() => ({ title: '${title}' }));
        export default () => 'UI_ONLY';
    `
    await writeFile(
        entry,
        `
        import.meta.glob('./*.tsx', { eager: true });
        export { factories as default } from 'virtual:vpt';
    `
    )
    await writeFile(path.join(root, 'a.tsx'), source('A'))
    await writeFile(path.join(root, 'b.tsx'), source('B'))
    // Test-owned journals retain transformed IDs and each asynchronous evaluation.
    const transformed: string[] = []
    const snapshots: Promise<readonly { title: string }[]>[] = []
    const warmed = Promise.withResolvers<void>()
    const updated = Promise.withResolvers<void>()
    const observe = {
        name: 'test:page-registration',
        resolveId: (id: string) => (id === 'virtual:vpt' ? '\0virtual:vpt' : undefined),
        load: (id: string) =>
            id === '\0virtual:vpt'
                ? `
            // The fixture registry keeps declarations in evaluation order.
            export const factories = [];
            export function defineVptPage(factory) { factories.push(factory); }
        `
                : undefined,
        transform: (_: string, id: string) => void transformed.push(id)
    }
    const engine = await dev(
        {
            input: entry,
            treeshake: true,
            plugins: [viteImportGlobPlugin({ root }), observe]
        },
        { format: 'es' },
        {
            rebuildStrategy: 'never',
            watch: { skipWrite: true },
            onHmrUpdates: () => void engine.ensureLatestBuildOutput().catch(updated.reject),
            onOutput(result) {
                assert.ok(!(result instanceof Error))
                const chunk = result.output.find((file) => file.type === 'chunk' && file.isEntry)
                assert.ok(chunk?.type === 'chunk')
                assert.doesNotMatch(chunk.code, /UI_ONLY/)
                type Pages = { default: (() => { title: string })[] }
                const loaded: Promise<Pages> = import(`data:text/javascript,${encodeURIComponent(chunk.code)}`)
                snapshots.push(loaded.then((module) => module.default.map((factory) => factory())))
                if (chunk.code.includes('Warm')) {
                    warmed.resolve()
                }
                if (chunk.code.includes('Updated')) {
                    updated.resolve()
                }
            }
        }
    )
    t.after(() => engine.close())
    await engine.run()
    assert.deepEqual(await snapshots[0], [{ title: 'A' }, { title: 'B' }])
    // A watched save settles startup filesystem notifications before measuring incremental transforms.
    await publishSourceGeneration(path.join(root, 'a.tsx'), source('Warm'))
    await warmed.promise
    transformed.length = 0
    await publishSourceGeneration(path.join(root, 'a.tsx'), source('Updated'))
    await updated.promise
    assert.deepEqual(await snapshots.at(-1), [{ title: 'Updated' }, { title: 'B' }])
    assert.ok(
        transformed.every((id) => path.basename(id) !== 'b.tsx'),
        JSON.stringify(transformed)
    )
})
