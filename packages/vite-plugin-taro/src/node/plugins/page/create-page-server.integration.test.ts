import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import test, { type TestContext } from 'node:test'
import { DevEngine, type DevOptions, dev, viteImportGlobPlugin } from 'rolldown/experimental'
import type { VptPageOption } from '../../../options.ts'
import { createMemoryBuildProject } from '../../tests/create-memory-build-project.ts'
import { createTestProject } from '../../tests/create-test-project.ts'
import { publishSourceGeneration } from '../../tests/publish-source-generation.ts'
import { createPageServer } from './create-page-server.ts'

function createMemoryPageProject(
    t: TestContext,
    files: Readonly<Record<string, string>>,
    configure?: (options: DevOptions) => DevOptions
): string {
    const project = createMemoryBuildProject(files)
    t.after(() => project[Symbol.dispose]())
    const create = DevEngine.create.bind(DevEngine)
    // Node can discover VFS files directly; Rolldown needs the fixture plugin to resolve and load them.
    t.mock.method(DevEngine, 'create', (...[input, output, options]: Parameters<typeof create>) => {
        const watchless = { ...options, watch: { ...options?.watch, enabled: false } }
        return create(
            { ...input, plugins: [input.plugins, project.plugin] },
            output,
            configure?.(watchless) ?? watchless
        )
    })
    return project.root
}

// Tests driven by Rolldown's native watcher use on-disk fixtures.
test('updates the page manifest as files and declarations change', { timeout: 10_000 }, async (t) => {
    const root = await createTestProject('page-server-')
    const filename = path.join(root, 'src/home.tsx')
    const closed = t.mock.method(DevEngine.prototype, 'close')
    // Select the expected snapshot across watcher notifications for each file operation.
    let count = 0
    let output = Promise.withResolvers<readonly VptPageOption[]>()
    const server = await createPageServer({
        root,
        target: 'wx',
        publish(pages) {
            if (pages.length === count) {
                output.resolve(pages)
            }
        },
        onError: (error) => output.reject(error)
    })
    t.after(() => server.close())
    assert.deepEqual(await output.promise, [])

    count = 1
    output = Promise.withResolvers()
    const page = "import { defineVptPage } from 'virtual:vpt'; defineVptPage(() => ({}));"
    await mkdir(path.dirname(filename))
    await publishSourceGeneration(filename, page)
    assert.deepEqual(await output.promise, [{ path: 'home' }])

    for (const [source, pages] of [
        ['export default 0', []],
        [page, [{ path: 'home' }]]
    ] as const) {
        count = pages.length
        output = Promise.withResolvers()
        await publishSourceGeneration(filename, source)
        assert.deepEqual(await output.promise, pages)
    }

    count = 0
    output = Promise.withResolvers()
    await rm(filename)
    assert.deepEqual(await output.promise, [])
    await server.close()
    assert.equal(closed.mock.callCount(), 1)
})

test('publishes registered async page factories with route paths and target context', async (t) => {
    const page = (settings: string) => `
        import { defineVptPage } from 'virtual:vpt';
        import { title } from ${JSON.stringify(settings)};
        defineVptPage(async ({ target }) => {
            await new Promise(resolve => setImmediate(resolve));
            return { config: { target, title } };
        });
        export default () => 'UI_ONLY';
    `
    const root = createMemoryPageProject(t, {
        'src/home.tsx': page('./settings'),
        'src/nested/about.tsx': page('../settings'),
        'src/node_modules/ignored.tsx': page('../settings'),
        'src/settings.ts': `
            import { defineVptPage } from 'virtual:vpt';
            defineVptPage(() => { throw Error('Non-TSX declaration executed'); });
            export const title = 'Shared';
        `,
        'outside.tsx': page('./src/settings'),
        'src/component.tsx': 'throw Error("Unrelated TSX executed")',
        'src/types.tsx': "import type {} from 'virtual:vpt'; throw Error('Type-only')"
    })
    const output = Promise.withResolvers<readonly VptPageOption[]>()
    const server = await createPageServer({ root, target: 'wx', publish: output.resolve, onError: output.reject })
    await server.close()
    assert.deepEqual(await output.promise, [
        { path: 'home', config: { target: 'wx', title: 'Shared' } },
        { path: 'nested/about', config: { target: 'wx', title: 'Shared' } }
    ])
})

test('skips bundle generation for unrelated files and isolated component edits', { timeout: 10_000 }, async (t) => {
    const root = await createTestProject('page-cost-')
    const src = path.join(root, 'src')
    const home = path.join(src, 'home.tsx')
    const event = `${root}:factory`
    const source = (component: string) => `
        import process from 'node:process';
        import { defineVptPage } from 'virtual:vpt';
        import { title } from './settings';
        defineVptPage(() => { process.emit(${JSON.stringify(event)}); return { config: { title } }; });
        export default function Home() { return ${JSON.stringify(component)}; }
    `
    await mkdir(src)
    await writeFile(home, source('before'))
    await writeFile(path.join(src, 'settings.ts'), 'export const title = "Home";')
    const factory = t.mock.fn()
    process.on(event, factory)
    t.after(() => {
        process.off(event, factory)
    })

    const generated = t.mock.method(DevEngine.prototype, 'ensureLatestBuildOutput')
    const create = DevEngine.create.bind(DevEngine)
    const notes = Promise.withResolvers<number>()
    // Observe the component save after the initial watcher events have settled.
    let component: ReturnType<typeof Promise.withResolvers<void>> | undefined
    t.mock.method(DevEngine, 'create', (...[input, output, options]: Parameters<typeof create>) =>
        create(input, output, {
            ...options,
            // Measure completed saves, not overlapping native filesystem notifications.
            watch: { ...options?.watch, usePolling: true, compareContentsForPolling: true },
            onHmrUpdates(result) {
                const before = generated.mock.callCount()
                options?.onHmrUpdates?.(result)
                if (!(result instanceof Error)) {
                    if (result.changedFiles.some((file) => path.basename(file) === 'notes.txt')) {
                        notes.resolve(generated.mock.callCount() - before)
                    }
                    const expected = component
                    if (expected && result.changedFiles.some((file) => path.basename(file) === 'home.tsx')) {
                        void Promise.all(generated.mock.calls.map(({ result }) => result)).then(
                            () => expected.resolve(),
                            expected.reject
                        )
                    }
                }
            }
        })
    )
    // Replace the publication waiter before changing a dependency.
    let snapshot = Promise.withResolvers<readonly VptPageOption[]>()
    const server = await createPageServer({
        root,
        target: 'wx',
        publish: (pages) => snapshot.resolve(pages),
        onError: (error) => snapshot.reject(error)
    })
    t.after(() => server.close())
    assert.deepEqual(await snapshot.promise, [{ path: 'home', config: { title: 'Home' } }])

    snapshot = Promise.withResolvers()
    await publishSourceGeneration(path.join(src, 'settings.ts'), 'export const title = "Updated";')
    assert.deepEqual(await snapshot.promise, [{ path: 'home', config: { title: 'Updated' } }])
    assert.equal(factory.mock.callCount(), 2)

    await writeFile(path.join(src, 'notes.txt'), 'not a dependency')
    assert.equal(await notes.promise, 0)
    const before = generated.mock.callCount()
    component = Promise.withResolvers()
    await publishSourceGeneration(home, source('after'))
    await component.promise
    assert.equal(generated.mock.callCount(), before)
    assert.equal(factory.mock.callCount(), 2)
})

test('rebuilds when page configuration uses a component body', { timeout: 10_000 }, async (t) => {
    const root = await createTestProject('page-component-dependency-')
    const src = path.join(root, 'src')
    await mkdir(src)
    const api = "import { defineVptPage } from 'virtual:vpt';"
    const local = path.join(src, 'local.tsx')
    const shared = path.join(src, 'shared.tsx')
    const localSource = (title: string) => `${api}
        defineVptPage(() => ({ config: { title: Local() } }));
        export default function Local() { return ${JSON.stringify(title)}; }
    `
    const sharedSource = (title: string) => `${api}
        defineVptPage(() => ({}));
        export default () => ${JSON.stringify(title)};
    `
    await writeFile(local, localSource('Local'))
    await writeFile(shared, sharedSource('Shared'))
    await writeFile(
        path.join(src, 'consumer.tsx'),
        `${api}
        import Shared from './shared';
        defineVptPage(() => ({ config: { title: Shared() } }));
    `
    )
    // The waiter follows semantic publications, not individual native watcher events.
    let next = Promise.withResolvers<readonly VptPageOption[]>()
    const server = await createPageServer({
        root,
        target: 'wx',
        publish: (pages) => next.resolve(pages),
        onError: (error) => next.reject(error)
    })
    t.after(() => server.close())
    const titles = (pages: readonly VptPageOption[]) => pages.map((page) => page.config?.title)
    assert.deepEqual(titles(await next.promise), ['Shared', 'Local', undefined])

    next = Promise.withResolvers()
    await publishSourceGeneration(local, localSource('Local update'))
    assert.deepEqual(titles(await next.promise), ['Shared', 'Local update', undefined])

    next = Promise.withResolvers()
    await publishSourceGeneration(shared, sharedSource('Shared update'))
    assert.deepEqual(titles(await next.promise), ['Shared update', 'Local update', undefined])
})

test('reuses unaffected page results across local edits and shared dependency edits', {
    timeout: 10_000
}, async (t) => {
    const root = await createTestProject('page-incremental-results-')
    const src = path.join(root, 'src')
    const event = `${root}:factory`
    const page = (name: string, imports: string, title: string) => `
        import process from 'node:process';
        import { defineVptPage } from 'virtual:vpt';
        ${imports}
        defineVptPage(async () => {
            process.emit(${JSON.stringify(event)}, ${JSON.stringify(name)});
            return { config: { title: ${title} } };
        });
    `
    await mkdir(src)
    await Promise.all([
        writeFile(path.join(src, 'a.tsx'), page('a', 'import { title } from "./shared";', 'title')),
        writeFile(path.join(src, 'b.tsx'), page('b', '', '(await import("./shared")).title')),
        writeFile(path.join(src, 'c.tsx'), page('c', '', '"C"')),
        writeFile(path.join(src, 'shared.ts'), 'export { title } from "./settings";'),
        writeFile(path.join(src, 'settings.ts'), 'export const title = "First";')
    ])
    const evaluated = t.mock.fn()
    process.on(event, evaluated)
    t.after(() => {
        process.off(event, evaluated)
    })
    // Each waiter receives the first changed snapshot for the next edit.
    let next = Promise.withResolvers<readonly VptPageOption[]>()
    const server = await createPageServer({
        root,
        target: 'wx',
        publish: (pages) => next.resolve(pages),
        onError: (error) => next.reject(error)
    })
    t.after(() => server.close())
    const titles = (pages: readonly VptPageOption[]) => pages.map(({ config }) => config?.title)
    const calls = () => evaluated.mock.calls.map(({ arguments: [name] }) => name)
    assert.deepEqual(titles(await next.promise), ['First', 'First', 'C'])
    assert.deepEqual(calls(), ['a', 'b', 'c'])

    next = Promise.withResolvers()
    await writeFile(path.join(src, 'a.tsx'), page('a', 'import { title } from "./shared";', 'title + " A"'))
    assert.deepEqual(titles(await next.promise), ['First A', 'First', 'C'])
    assert.deepEqual(calls(), ['a', 'b', 'c', 'a'])

    next = Promise.withResolvers()
    await writeFile(path.join(src, 'settings.ts'), 'export const title = "Second";')
    assert.deepEqual(titles(await next.promise), ['Second A', 'Second', 'C'])
    assert.deepEqual(calls(), ['a', 'b', 'c', 'a', 'a', 'b'])
})

test('rejects invalid initial configuration and closes its engine', async (t) => {
    const source = "import { defineVptPage } from 'virtual:vpt'; defineVptPage(() => ({ entry: true }));"
    const root = createMemoryPageProject(t, { 'src/a.tsx': source, 'src/b.tsx': source })
    const close = t.mock.method(DevEngine.prototype, 'close')
    await assert.rejects(
        createPageServer({
            root,
            target: 'wx',
            publish: () => assert.fail('Invalid configuration published'),
            onError: assert.ifError
        }),
        /Only one page may set entry/
    )
    assert.equal(close.mock.callCount(), 1)
})

test('validates snapshots and recovers from errors without publishing unchanged configuration', {
    timeout: 10_000
}, async (t) => {
    const root = await createTestProject('page-recovery-')
    const src = path.join(root, 'src')
    const home = path.join(src, 'home.tsx')
    const evaluated = `${root}:evaluated`
    const source = (body: string) => `
        import process from 'node:process';
        import { defineVptPage } from 'virtual:vpt';
        defineVptPage(() => { process.emit(${JSON.stringify(evaluated)}); ${body} });
    `
    await mkdir(src)
    await writeFile(home, source('return { entry: true };'))
    await writeFile(path.join(src, 'about.tsx'), source('return {};'))
    const publish = t.mock.fn()
    // Each failed generation must report its own error without disturbing the accepted snapshot.
    let failed = Promise.withResolvers<unknown>()
    const updated = Promise.withResolvers<readonly VptPageOption[]>()
    const server = await createPageServer({
        root,
        target: 'wx',
        publish(pages) {
            publish(pages)
            if (pages[0]?.prerender) {
                updated.resolve(pages)
            }
        },
        onError: (error) => failed.resolve(error)
    })
    t.after(() => server.close())
    assert.deepEqual(publish.mock.calls[0]?.arguments[0], [{ path: 'home', entry: true }, { path: 'about' }])

    await publishSourceGeneration(home, `${source('return {};')} const = 0;`)
    assert.match(String(await failed.promise), /Expected|Unexpected/)
    assert.equal(publish.mock.callCount(), 1)

    failed = Promise.withResolvers()
    await publishSourceGeneration(home, source('throw Error("broken factory");'))
    assert.match(String(await failed.promise), /broken factory/)
    const unchanged = Promise.withResolvers<void>()
    process.once(evaluated, unchanged.resolve)
    t.after(() => {
        process.off(evaluated, unchanged.resolve)
    })
    await writeFile(home, source('return { entry: Boolean(1) };'))
    await unchanged.promise

    await writeFile(home, source('return { entry: true, prerender: true };'))
    assert.deepEqual(await updated.promise, [{ path: 'home', entry: true, prerender: true }, { path: 'about' }])
    assert.equal(publish.mock.callCount(), 2)
})

test('reports failed output and reuses factories when the compiler replays the same chunks', async (t) => {
    const event = 'page-server:replayed-factory'
    const evaluated = t.mock.fn()
    process.on(event, evaluated)
    t.after(() => {
        process.off(event, evaluated)
    })
    const observed = Promise.withResolvers<{
        replay: () => void | Promise<void>
        fail: (error: Error) => void | Promise<void>
    }>()
    const root = createMemoryPageProject(
        t,
        {
            'src/home.tsx': `
                import process from 'node:process';
                import { defineVptPage } from 'virtual:vpt';
                defineVptPage(() => { process.emit(${JSON.stringify(event)}); return {}; });
            `
        },
        (options) => {
            const onOutput = options.onOutput!
            return {
                ...options,
                onOutput(result) {
                    observed.resolve({ replay: () => onOutput(result), fail: onOutput })
                    return onOutput(result)
                }
            }
        }
    )
    const publish = t.mock.fn()
    const onError = t.mock.fn()
    const server = await createPageServer({ root, target: 'wx', publish, onError })
    t.after(() => server.close())
    assert.deepEqual(publish.mock.calls[0]?.arguments[0], [{ path: 'home' }])

    const { fail, replay } = await observed.promise
    const error = new Error('Output generation failed')
    await fail(error)
    await replay()
    // Let any unexpected asynchronous factory evaluation and publication finish.
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(onError.mock.callCount(), 1)
    assert.equal(onError.mock.calls[0]?.arguments[0], error)
    assert.equal(evaluated.mock.callCount(), 1)
    assert.equal(publish.mock.callCount(), 1)
})

test('publishes the latest program without waiting for a superseded factory', { timeout: 10_000 }, async (t) => {
    const root = await createTestProject('page-latest-')
    const filename = path.join(root, 'src/home.tsx')
    const prefix = "import { defineVptPage } from 'virtual:vpt';"
    await mkdir(path.dirname(filename))
    await writeFile(filename, `${prefix} defineVptPage(() => ({}));`)
    const started = `${root}:started`
    const released = `${root}:released`
    const finished = `${root}:finished`
    const slow = Promise.withResolvers<void>()
    const done = Promise.withResolvers<void>()
    process.once(started, slow.resolve)
    process.once(finished, done.resolve)
    t.after(() => {
        process.emit(released)
        process.off(started, slow.resolve)
        process.off(finished, done.resolve)
    })
    const publish = t.mock.fn()
    const latest = Promise.withResolvers<readonly VptPageOption[]>()
    const server = await createPageServer({
        root,
        target: 'wx',
        publish(pages) {
            publish(pages)
            if (pages[0]?.prerender) {
                latest.resolve(pages)
            }
        },
        onError: latest.reject
    })
    t.after(() => server.close())
    await writeFile(
        filename,
        `
        ${prefix}
        import process from 'node:process';
        defineVptPage(async () => {
            const release = new Promise(resolve => process.once(${JSON.stringify(released)}, resolve));
            process.emit(${JSON.stringify(started)});
            await release;
            process.emit(${JSON.stringify(finished)});
            return { entry: true };
        });
    `
    )
    await slow.promise
    await writeFile(filename, `${prefix} defineVptPage(() => ({ prerender: true }));`)
    assert.deepEqual(await latest.promise, [{ path: 'home', prerender: true }])
    process.emit(released)
    await done.promise
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(publish.mock.callCount(), 2)
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
