import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { walk } from 'oxc-walker'
import type { OutputChunk } from 'rolldown'
import { parseSync } from 'rolldown/utils'
import { build, createServer, normalizePath, type Plugin } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { interpreterServerEvent } from '../../../../runtime/mini/dev/modes/interpreter/interpreter-protocol.ts'
import { packageRequire } from '../../../utils/packages.ts'
import vpt from '../../../vpt.ts'

type MiniTarget = 'wx' | 'zfb'
type Mode = 'production' | 'devtools' | 'interpreter' | 'rebuild'

const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
const coreJsRoot = `${normalizePath(path.dirname(packageRequire.resolve('core-js/package.json')))}/`
const optionalPolyfills = ['web.url', 'es.array.at']

/** Compiles a real disposable consumer through the public Vite build/server APIs. */
async function compileFixture(
    target: MiniTarget,
    mode: Mode,
    polyfills: readonly string[]
): Promise<readonly OutputChunk[]> {
    const root = await mkdtemp(path.join(packageRoot, '.vpt-polyfills-test-'))
    const pagePath = path.join(root, 'src/pages/home/index.tsx')
    // This completion cell captures exactly one initial output graph; the server is closed before returning it.
    const output = Promise.withResolvers<readonly OutputChunk[]>()
    const capture: Plugin = {
        name: 'test:polyfill-output',
        generateBundle: {
            order: 'post',
            handler(_options, bundle) {
                const chunks = Object.values(bundle).filter((item): item is OutputChunk => item.type === 'chunk')
                const hasPolyfills = polyfills.length > 0
                const polyfillChunks = chunks.filter((chunk) =>
                    chunk.moduleIds.some((id) => normalizePath(id).startsWith(coreJsRoot))
                )
                assert.deepEqual(
                    polyfillChunks.map((chunk) => chunk.fileName),
                    hasPolyfills ? ['common/polyfills.js'] : [],
                    'core-js modules must stay in one dedicated polyfills file'
                )
                const polyfillEntry = chunks.find((chunk) => chunk.fileName === 'common/polyfills.js')
                assert.ok(polyfillEntry?.isEntry)
                assert.ok(
                    !polyfillEntry.imports.includes('common/vendor.js'),
                    'pre-bootstrap polyfills must not depend on the framework capsule'
                )
                // Alipay rejects import() at compile time, even inside an unused React Refresh export that Node can parse.
                for (const chunk of chunks) {
                    const parsed = parseSync(chunk.fileName, chunk.code)
                    assert.deepEqual(parsed.errors, [])
                    walk(parsed.program, {
                        enter(node) {
                            assert.notEqual(
                                node.type,
                                'ImportExpression',
                                `${target} ${mode}: raw import() in ${chunk.fileName}`
                            )
                        }
                    })
                }
                output.resolve(chunks)
            }
        }
    }
    const options: VptOptions = {
        target,
        app: 'src/app.tsx',
        pages: [{ path: 'pages/home/index' }],
        appJson: {},
        projectConfigJson: {},
        polyfills,
        ...(mode === 'production' ? {} : { hmr: { mode } })
    }
    // Each fixture selects its React environment explicitly; Vite otherwise retains NODE_ENV from an earlier build in this process.
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = mode === 'production' ? 'production' : 'development'
    try {
        await mkdir(path.dirname(pagePath), { recursive: true })
        await writeFile(
            path.join(root, 'src/probe.ts'),
            `
                import { document as taroDocument } from 'vite-plugin-taro-runtime/runtime/mini'
                const url = new URL('child', 'https://example.com/dir/page')
                const params = new URLSearchParams('a=1&b=2&a=3')
                export const probe = {
                    href: url.href,
                    params: params.toString(),
                    entries: [...params.entries()],
                    at: typeof [].at === 'function' ? [1, 2].at(-1) : null,
                    hostURL: URL === globalThis.URL,
                    hostParams: URLSearchParams === globalThis.URLSearchParams,
                    document: document === taroDocument,
                    local: ((URL) => URL)('local'),
                    structuredClone: typeof structuredClone
                }
            `
        )
        await writeFile(
            path.join(root, 'src/app.tsx'),
            `
                import { probe } from './probe'
                globalThis.polyfillProbe = probe
                globalThis.readPerformanceNow = () => performance.now()
                export default function App({ children }) { return children }
            `
        )
        await writeFile(pagePath, 'export default function Home() { return null }')
        const config = {
            root,
            configFile: false as const,
            logLevel: 'silent' as const,
            plugins: [vpt(options), capture],
            build: { write: false, minify: false as const, sourcemap: mode === 'production' },
            server: { host: '127.0.0.1', port: 0 }
        }
        if (mode === 'production') {
            const result = await build(config)
            assert.ok(!Array.isArray(result) && 'output' in result)
            // Rolldown serializes final maps as assets and clears OutputChunk.map after generateBundle.
            const bootstrapMap = result.output.find((item) => item.fileName === 'common/bootstrap.js.map')
            assert.ok(bootstrapMap?.type === 'asset')
            const sourceMap: { mappings: string; sources: string[] } = JSON.parse(String(bootstrapMap.source))
            assert.ok(sourceMap.mappings.length > 0)
            assert.ok(sourceMap.sources.some((source) => source.endsWith('/mini/amphibious/bootstrap.ts')))
            if (polyfills.length > 0) {
                const polyfillsMap = result.output.find((item) => item.fileName === 'common/polyfills.js.map')
                assert.ok(polyfillsMap?.type === 'asset')
                const map: { mappings: string; sources: string[] } = JSON.parse(String(polyfillsMap.source))
                assert.ok(map.mappings.length > 0)
                assert.ok(map.sources.length > 0)
            }
            return result.output.filter((item): item is OutputChunk => item.type === 'chunk')
        } else {
            const server = await createServer(config)
            try {
                await server.listen()
            } finally {
                await server.close()
            }
        }
        return await output.promise
    } finally {
        if (previousNodeEnv === undefined) {
            delete process.env.NODE_ENV
        } else {
            process.env.NODE_ENV = previousNodeEnv
        }
        await rm(root, { recursive: true, force: true })
    }
}

/** Evaluates emitted native files in a separate AppService-like realm with no browser DOM or dynamic code generation. */
function createAppHeap(chunks: readonly OutputChunk[], nativeURLs: boolean, target: MiniTarget) {
    // Add the host-published HMR files, which deliberately live outside Rolldown's chunk graph, to this fixture's source table.
    const sources = new Map(chunks.map((chunk) => [chunk.fileName, chunk.code]))
    sources.set('hmr/info.js', 'module.exports = { buildId: "test", endpoint: "ws://localhost/test" };')
    sources.set('hmr/patches.js', 'module.exports = undefined;')
    // Native CommonJS caching preserves one bootstrap execution across App, Page, and component entry points.
    const cache = new Map<string, { exports: unknown }>()
    // These native socket callbacks are assigned only by the emitted HMR runtime and driven explicitly by each test.
    let onMessage: ((event: { data: string } | { message: string }) => void) | undefined
    // This append-only journal records acknowledgements emitted through the fake native socket.
    const reports: string[] = []
    const socket = {
        onOpen(listener: () => void) {
            listener()
        },
        onClose() {},
        onError() {},
        onMessage(listener: (event: { data: string } | { message: string }) => void) {
            onMessage = listener
        },
        send({ data }: { data: string }) {
            reports.push(data)
        },
        close() {}
    }
    const host = { connectSocket: () => socket }
    const context = createContext(
        {
            console,
            setTimeout,
            clearTimeout,
            wx: host,
            my: host,
            App() {},
            Page() {},
            Component() {},
            getCurrentPages: () => [],
            ...(nativeURLs ? { URL, URLSearchParams } : {})
        },
        { codeGeneration: { strings: false, wasm: false } }
    )
    // Only this isolated realm loses the optional prototype method; Node and other App heaps retain their native built-ins.
    runInContext('globalThis.global = globalThis; delete Array.prototype.at;', context)

    function evaluate(fileName: string): unknown {
        const existing = cache.get(fileName)
        if (existing) {
            return existing.exports
        }
        const source = sources.get(fileName)
        assert.ok(source !== undefined, `Missing native file: ${fileName}`)
        // Insert the mutable exports cell before traversing requires to reproduce CommonJS cycles.
        const module: { exports: unknown } = { exports: {} }
        cache.set(fileName, module)
        const require = (specifier: string) =>
            evaluate(path.posix.normalize(path.posix.join(path.posix.dirname(fileName), specifier)))
        const execute: unknown = runInContext(`(function(require, module, exports) {\n${source}\n})`, context, {
            filename: fileName
        })
        assert.ok(typeof execute === 'function')
        execute(require, module, module.exports)
        return module.exports
    }

    return {
        evaluate,
        read(expression: string): unknown {
            return runInContext(expression, context)
        },
        json(expression: string): unknown {
            return JSON.parse(runInContext(`JSON.stringify(${expression})`, context))
        },
        sendPatch(code: string) {
            assert.ok(onMessage)
            const data = JSON.stringify({
                type: 'custom',
                event: interpreterServerEvent,
                data: { buildId: 'test', patches: [{ seq: 1, changedIds: ['probe'], code }] }
            })
            onMessage(target === 'wx' ? { data } : { message: data })
        },
        reports
    }
}

/** The standalone polyfills file installs the selection without needing SystemJS, App registration, or an application capsule. */
function assertPolyfilledBootstrap(
    chunks: readonly OutputChunk[],
    target: MiniTarget,
    structuredClone: 'function' | 'undefined'
): void {
    const heap = createAppHeap(chunks, false, target)
    heap.evaluate('common/polyfills.js')
    assert.equal(heap.read('typeof System'), 'undefined')
    assert.equal(heap.read('typeof URL'), 'function')
    assert.equal(heap.read('typeof URLSearchParams'), 'function')
    assert.equal(heap.read('[1, 2].at(-1)'), 2)
    assert.equal(heap.read('typeof structuredClone'), structuredClone)
    assert.equal(heap.read('typeof globalThis.polyfillProbe'), 'undefined')
    const installedURL = heap.read('URL')
    heap.evaluate('common/bootstrap.js')
    assert.equal(heap.read('URL'), installedURL)
}

function assertPolyfilledApp(heap: ReturnType<typeof createAppHeap>, structuredClone: 'function' | 'undefined'): void {
    heap.evaluate('app.js')
    assert.deepEqual(heap.json('polyfillProbe'), {
        href: 'https://example.com/dir/child',
        params: 'a=1&b=2&a=3',
        entries: [
            ['a', '1'],
            ['b', '2'],
            ['a', '3']
        ],
        at: 2,
        hostURL: true,
        hostParams: true,
        document: true,
        local: 'local',
        structuredClone
    })
    const installedURL = heap.read('URL')
    heap.evaluate('pages/home/index.js')
    heap.evaluate('comp.js')
    assert.equal(heap.read('URL'), installedURL)
    assert.equal(heap.read('globalThis["__core-js_shared__"].versions.length'), 1)
}

for (const target of ['wx', 'zfb'] as const) {
    test(`${target}: selected production APIs install before dependencies without replacing native URL constructors`, async () => {
        const chunks = await compileFixture(target, 'production', [...optionalPolyfills, 'es.array.at'])
        assertPolyfilledBootstrap(chunks, target, 'undefined')
        const missing = createAppHeap(chunks, false, target)
        assertPolyfilledApp(missing, 'undefined')
        const native = createAppHeap(chunks, true, target)
        assertPolyfilledApp(native, 'undefined')
        assert.equal(native.read('URL'), URL)
        assert.equal(native.read('URLSearchParams'), URLSearchParams)
    })

    for (const mode of ['devtools', 'interpreter', 'rebuild'] as const) {
        test(`${target}: ${mode} installs optional APIs before the app and exposes them to HMR`, async () => {
            const chunks = await compileFixture(target, mode, [
                ...optionalPolyfills,
                'web.structured-clone',
                'web.queue-microtask'
            ])
            assertPolyfilledBootstrap(chunks, target, 'function')
            const heap = createAppHeap(chunks, false, target)
            assertPolyfilledApp(heap, 'function')
            assert.equal(heap.read('typeof queueMicrotask'), 'function')
            if (mode === 'interpreter') {
                heap.read(`
                    __rolldown_runtime__.registerGraph({ ids: ['probe'], localCount: 1, edges: [[]], dynamicEdges: [[]] });
                    __rolldown_runtime__.registerModule('probe', { exports: {} });
                    __rolldown_runtime__.createModuleHotContext('probe').accept();
                `)
                heap.sendPatch(`
                    __rolldown_runtime__.registerFactory('probe', 'esm', function(moduleId) {
                        __rolldown_runtime__.registerModule(moduleId, { exports: {
                            href: new URL('child', 'https://example.com/dir/page').href,
                            clone: structuredClone({ value: [1, 2].at(-1) })
                        } });
                        __rolldown_runtime__.createModuleHotContext(moduleId).accept();
                    });
                `)
                assert.deepEqual(heap.json('__rolldown_runtime__.loadExports("probe")'), {
                    href: 'https://example.com/dir/child',
                    clone: { value: 2 }
                })
                assert.ok(heap.reports.some((report) => JSON.parse(report).data.kind === 'applied'))
            }
        })
    }
}

for (const target of ['wx', 'zfb'] as const) {
    for (const mode of ['production', 'devtools', 'interpreter', 'rebuild'] as const) {
        test(`${target} ${mode}: the empty selection keeps core-js out while development retains its microtask fallback`, async () => {
            const chunks = await compileFixture(target, mode, [])
            const missing = createAppHeap(chunks, false, target)
            assert.throws(() => missing.evaluate('app.js'), { name: 'ReferenceError', message: 'URL is not defined' })
            assert.equal(missing.read('typeof URLSearchParams'), 'undefined')

            const heap = createAppHeap(chunks, true, target)
            heap.evaluate('common/bootstrap.js')
            assert.equal(heap.read('typeof globalThis.polyfillProbe'), 'undefined')
            assert.equal(heap.read('typeof queueMicrotask'), mode === 'production' ? 'undefined' : 'function')
            assert.equal(heap.read('typeof globalThis["__core-js_shared__"]'), 'undefined')
            if (mode !== 'production') {
                await assertMicrotaskQueue(heap)
            }

            heap.evaluate('app.js')
            assert.equal(
                Array.isArray(heap.evaluate('common/vendor.js')),
                true,
                'vendor must export a capsule registration'
            )
            assert.equal(heap.read('URL'), URL)
            assert.equal(heap.read('URLSearchParams'), URLSearchParams)
            assert.equal(heap.read('typeof Array.prototype.at'), 'undefined')
            assert.deepEqual(heap.json('polyfillProbe'), {
                href: 'https://example.com/dir/child',
                params: 'a=1&b=2&a=3',
                entries: [
                    ['a', '1'],
                    ['b', '2'],
                    ['a', '3']
                ],
                at: null,
                hostURL: true,
                hostParams: true,
                document: true,
                local: 'local',
                structuredClone: 'undefined'
            })
            // Fixed clocks in this isolated heap distinguish the development rewrite from production's original call.
            assert.equal(
                heap.read('globalThis.performance = { now: () => 123 }; Date.now = () => 456; readPerformanceNow()'),
                mode === 'production' ? 123 : 456
            )

            const native = createAppHeap(chunks, true, target)
            const nativeQueue = native.read(
                'globalThis.queueMicrotask = (callback) => { void Promise.resolve().then(callback) }'
            )
            native.evaluate('app.js')
            assert.equal(native.read('queueMicrotask'), nativeQueue)
        })
    }

    test(`${target}: production can opt into queueMicrotask without other APIs`, async () => {
        const chunks = await compileFixture(target, 'production', ['web.queue-microtask'])
        const heap = createAppHeap(chunks, true, target)
        heap.evaluate('common/bootstrap.js')
        await assertMicrotaskQueue(heap)
        assert.throws(() => heap.read('queueMicrotask()'), { name: 'TypeError' })
        assert.throws(() => heap.read('queueMicrotask(null)'), { name: 'TypeError' })
        const installedQueue = heap.read('queueMicrotask')
        heap.evaluate('app.js')
        heap.evaluate('pages/home/index.js')
        heap.evaluate('comp.js')
        assert.equal(heap.read('queueMicrotask'), installedQueue)
        assert.equal(heap.read('globalThis["__core-js_shared__"].versions.length'), 1)
        assert.equal(heap.read('typeof Array.prototype.at'), 'undefined')
    })
}

async function assertMicrotaskQueue(heap: ReturnType<typeof createAppHeap>): Promise<void> {
    assert.equal(heap.read('typeof queueMicrotask'), 'function')
    // This heap-local journal records callback order without changing the test runner's globals.
    heap.read(`
        globalThis.microtaskOrder = ['sync'];
        queueMicrotask(() => microtaskOrder.push('first'));
        queueMicrotask(() => microtaskOrder.push('second'));
        microtaskOrder.push('after-schedule');
    `)
    assert.deepEqual(heap.json('microtaskOrder'), ['sync', 'after-schedule'])
    await Promise.resolve()
    assert.deepEqual(heap.json('microtaskOrder'), ['sync', 'after-schedule', 'first', 'second'])
}

test('a prototype-only selection does not install unselected URL APIs', async () => {
    const chunks = await compileFixture('wx', 'production', ['es.array.at'])
    const heap = createAppHeap(chunks, false, 'wx')
    assert.throws(() => heap.evaluate('app.js'), { name: 'ReferenceError', message: 'URL is not defined' })
    assert.equal(heap.read('[1, 2].at(-1)'), 2)
    assert.equal(heap.read('typeof globalThis.URL'), 'undefined')
    assert.equal(heap.read('typeof globalThis.URLSearchParams'), 'undefined')
})
