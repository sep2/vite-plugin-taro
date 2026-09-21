import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createContext, runInContext } from 'node:vm'
import { walk } from 'oxc-walker'
import type { OutputChunk } from 'rolldown'
import { parseSync } from 'rolldown/utils'
import { build, createServer, normalizePath, type Plugin } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { interpreterServerEvent } from '../../../../runtime/mini/dev/modes/interpreter/interpreter-protocol.ts'
import { packageRequire } from '../../../utils/packages.ts'
import vpt from '../../../vpt.ts'
import { miniPolyfillsId, rolldownRuntimeId, vptGlobalBindingId } from '../module/module.ts'

type MiniTarget = 'wx' | 'zfb' | 'tt'
type Mode = 'production' | 'devtools' | 'interpreter' | 'rebuild'
type NativeFile = Pick<OutputChunk, 'fileName' | 'code'>

const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
const coreJsRoot = `${normalizePath(path.dirname(packageRequire.resolve('core-js/package.json')))}/`
const optionalPolyfills = ['web.url', 'es.array.at']
const miniTargets = ['wx', 'zfb', 'tt'] as const

/** Captures public build/server output; only patch probes materialize an editable page for the real watcher. */
async function compileFixture(
    target: MiniTarget,
    mode: Mode,
    polyfills: readonly string[],
    onDevReady?: (chunks: readonly NativeFile[], root: string) => Promise<void>
): Promise<readonly NativeFile[]> {
    const root = await mkdtemp(path.join(packageRoot, '.vpt-polyfills-test-'))
    const pagePath = normalizePath(path.join(root, 'src/pages/home/index.tsx'))
    const pageSource = 'export default function Home() { return null }'
    const sources: ReadonlyMap<string, string> = new Map([
        [
            normalizePath(path.join(root, 'src/probe.ts')),
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
        ],
        [
            normalizePath(path.join(root, 'src/app.tsx')),
            `
            import { probe } from './probe.ts'
            globalThis.polyfillProbe = probe
            globalThis.readPerformanceNow = () => performance.now()
            export default function App({ children }) { return children }
        `
        ],
        [pagePath, pageSource]
    ])
    // This completion cell captures exactly one initial output graph; the server is closed before returning it.
    const output = Promise.withResolvers<readonly NativeFile[]>()
    const capture: Plugin = {
        name: 'test:polyfill-output',
        resolveId(id, importer) {
            const resolved = normalizePath(
                importer && id.startsWith('.') ? path.resolve(path.dirname(importer), id) : id
            )
            return sources.has(resolved) ? resolved : undefined
        },
        load(id) {
            // A patch test uses the real watcher and file loader for this one editable module.
            if (onDevReady && normalizePath(id) === pagePath) {
                return
            }
            return sources.get(normalizePath(id))
        },
        generateBundle: {
            order: 'post',
            handler(_options, bundle) {
                const chunks = Object.values(bundle).filter((item): item is OutputChunk => item.type === 'chunk')
                const globalEntry = chunks.find((chunk) => chunk.fileName === 'common/vpt/global.js')
                assert.ok(globalEntry?.isEntry)
                assert.equal(globalEntry.fileName, 'common/vpt/global.js')
                assert.deepEqual(
                    globalEntry.moduleIds,
                    [],
                    'the provider must be emitted outside the instrumented graph'
                )
                assert.deepEqual(globalEntry.imports, [])
                assert.doesNotMatch(
                    globalEntry.code,
                    /require\(|__rolldown_runtime__|registerGraph|createModuleHotContext/
                )
                assert.equal(chunks.filter((chunk) => chunk.code.includes('vpt.fake.global')).length, 1)
                const hasPolyfills = polyfills.length > 0
                const polyfillChunks = chunks.filter((chunk) =>
                    chunk.moduleIds.some((id) => normalizePath(id).startsWith(coreJsRoot))
                )
                assert.deepEqual(
                    polyfillChunks.map((chunk) => chunk.fileName),
                    hasPolyfills ? ['common/polyfills.js'] : [],
                    'core-js modules must stay in one dedicated polyfills file'
                )
                const polyfillChunk = chunks.find((chunk) => chunk.fileName === 'common/polyfills.js')
                assert.ok(polyfillChunk)
                assert.equal(polyfillChunk.isEntry, false, 'bootstrap owns polyfill loading, not a second entry root')
                for (const moduleId of polyfillChunk.moduleIds) {
                    assert.ok(
                        moduleId === miniPolyfillsId ||
                            moduleId === vptGlobalBindingId ||
                            normalizePath(moduleId).startsWith(coreJsRoot),
                        `Unrelated module in common/polyfills.js: ${moduleId}`
                    )
                }
                const runtimeChunk = chunks.find((chunk) => chunk.moduleIds.includes(rolldownRuntimeId))
                assert.ok(runtimeChunk)
                assert.equal(runtimeChunk.fileName, 'common/rolldown-runtime.js')
                assert.deepEqual(runtimeChunk.moduleIds, [rolldownRuntimeId])
                assert.ok(
                    !polyfillChunk.imports.includes('common/vendor.js'),
                    'pre-bootstrap polyfills must not depend on the framework capsule'
                )
                // Compiler-owned JavaScript assets execute through native require just like rendered chunks.
                const transport = bundle['common/vpt/transport.js']
                assert.ok(transport?.type === 'asset' && typeof transport.source === 'string')
                const files = [...chunks, { fileName: transport.fileName, code: transport.source }]
                // Alipay rejects import() at compile time, even inside an unused React Refresh export that Node can parse.
                for (const chunk of files) {
                    assert.doesNotMatch(chunk.code, /__VPT_GLOBAL__/, chunk.fileName)
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
                output.resolve(files)
                if (mode !== 'production') {
                    // The Mini dev host deliberately writes regardless of build.write. These tests execute the captured
                    // chunks in a VM, so discard the bundle after all output assertions instead of writing a native project.
                    for (const fileName of Object.keys(bundle)) {
                        delete bundle[fileName]
                    }
                }
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
        const config = {
            root,
            configFile: false as const,
            logLevel: 'silent' as const,
            plugins: [vpt(options), capture],
            // The host writes metadata relative to outDir itself, so a relative default would pollute the package's dist.
            build: {
                outDir: path.join(root, 'dist'),
                write: false,
                minify: false as const,
                sourcemap: mode === 'production'
            },
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
            const globalMap = result.output.find((item) => item.fileName === 'common/vpt/global.js.map')
            assert.ok(globalMap?.type === 'asset')
            const globalSourceMap: { mappings: string; sources: string[] } = JSON.parse(String(globalMap.source))
            assert.ok(globalSourceMap.mappings.length > 0)
            assert.ok(globalSourceMap.sources.some((source) => source.endsWith('/global/vpt-global.ts')))
            if (polyfills.length > 0) {
                const polyfillsMap = result.output.find((item) => item.fileName === 'common/polyfills.js.map')
                assert.ok(polyfillsMap?.type === 'asset')
                const map: { mappings: string; sources: string[] } = JSON.parse(String(polyfillsMap.source))
                assert.ok(map.mappings.length > 0)
                assert.ok(map.sources.length > 0)
            }
            assert.deepEqual(await readdir(root), [], 'Production fixtures must not materialize sources or output')
            return await output.promise
        } else {
            if (onDevReady) {
                await mkdir(path.dirname(pagePath), { recursive: true })
                await writeFile(pagePath, pageSource)
            }
            const server = await createServer(config)
            try {
                await server.listen()
                await onDevReady?.(await output.promise, root)
            } finally {
                await server.close()
            }
            // close() drains the listening action and its atomic metadata writes before inspecting the final file set.
            const files = (await readdir(root, { recursive: true, withFileTypes: true }))
                .filter((entry) => entry.isFile())
                .map((entry) => normalizePath(path.relative(root, path.join(entry.parentPath, entry.name))))
                .sort()
            const extension = { wx: 'wxss', zfb: 'acss', tt: 'ttss' }[target]
            assert.deepEqual(
                files,
                [
                    `dist/app.${extension}`,
                    `dist/assets/global.${extension}`,
                    ...(mode === 'rebuild' ? [] : ['dist/hmr/info.js']),
                    ...(mode === 'devtools' ? ['dist/hmr/patches.js'] : []),
                    ...(onDevReady ? ['src/pages/home/index.tsx'] : [])
                ],
                'Only the editable fixture page and host-owned style/HMR metadata may reach disk'
            )
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
function createAppHeap(chunks: readonly NativeFile[], nativeURLs: boolean, target: MiniTarget) {
    // Add the host-published HMR files, which deliberately live outside Rolldown's chunk graph, to this fixture's source table.
    const sources = new Map(chunks.map((chunk) => [chunk.fileName, chunk.code]))
    sources.set('hmr/info.js', 'module.exports = { buildId: "test", endpoint: "ws://localhost/test" };')
    sources.set('hmr/patches.js', 'module.exports = undefined;')
    // Native CommonJS caching preserves one bootstrap execution across App, Page, and component entry points.
    const cache = new Map<string, { exports: unknown }>()
    // Record host lifecycle registrations to prove every emitted shell executes once, rather than returning an inert capsule.
    const registrations: string[] = []
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
            tt: host,
            App() {
                registrations.push('App')
            },
            Page() {
                registrations.push('Page')
            },
            Component() {
                registrations.push('Component')
            },
            getCurrentPages: () => [],
            ...(nativeURLs ? { URL, URLSearchParams } : {})
        },
        { codeGeneration: { strings: false, wasm: false } }
    )
    // Only this isolated realm loses the optional prototype method; Node and other App heaps retain their native built-ins.
    runInContext(
        `
        globalThis.global = globalThis;
        delete Array.prototype.at;
        // Count discovery attempts in this realm, independently of native module cache lookups.
        this.globalDiscoveries = 0;
        const nativeDefineProperty = Object.defineProperty;
        Object.defineProperty = (object, key, descriptor) => {
            if (key === '__vpt_global__') { globalDiscoveries += 1; }
            return nativeDefineProperty(object, key, descriptor);
        };
    `,
        context
    )

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
            onMessage(target === 'zfb' ? { message: data } : { data })
        },
        reports,
        registrations
    }
}

/** The standalone polyfills file installs the selection without needing SystemJS, App registration, or an application capsule. */
function assertPolyfilledBootstrap(
    chunks: readonly NativeFile[],
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
    heap.evaluate('custom-wrapper.js')
    assert.deepEqual(heap.registrations, ['App', 'Page', 'Component', 'Component'])
    assert.equal(heap.read('URL'), installedURL)
    assert.equal(heap.read('this["__core-js_shared__"].versions.length'), 1)
}

for (const target of miniTargets) {
    test(`${target}: selected production APIs install before dependencies without replacing native URL constructors`, async () => {
        const chunks = await compileFixture(target, 'production', [...optionalPolyfills, 'es.array.at'])
        assertPolyfilledBootstrap(chunks, target, 'undefined')
        const missing = createAppHeap(chunks, false, target)
        assertPolyfilledApp(missing, 'undefined')
        const native = createAppHeap(chunks, true, target)
        assertPolyfilledApp(native, 'undefined')
        assert.equal(native.read('URL'), URL)
        assert.equal(native.read('URLSearchParams'), URLSearchParams)

        // Enter through the real App/Page/Component shells, without a host globalThis alias or a manual System import.
        for (const setup of ['delete this.globalThis;', 'let globalThis;']) {
            const recovered = createAppHeap(chunks, false, target)
            recovered.read(setup)
            assertPolyfilledApp(recovered, 'undefined')
            assert.equal(recovered.read('typeof globalThis'), 'undefined')
        }
    })

    for (const mode of ['devtools', 'interpreter', 'rebuild'] as const) {
        test(`${target}: ${mode} installs optional APIs before the app and exposes them to HMR`, async (t) => {
            const chunks = await compileFixture(target, mode, [
                ...optionalPolyfills,
                'web.structured-clone',
                'web.queue-microtask'
            ])
            assertPolyfilledBootstrap(chunks, target, 'function')
            // Reuse the emitted graph, but give every host configuration its own heap and CommonJS cache.
            // Each case requires successful startup; asserting the current exception would hide the missing runtime binding.
            for (const { name, setup, globalType } of [
                { name: 'native globalThis', setup: '', globalType: 'object' },
                { name: 'deleted globalThis', setup: 'delete this.globalThis;', globalType: 'undefined' },
                { name: 'shadowed globalThis', setup: 'let globalThis;', globalType: 'undefined' }
            ]) {
                await t.test(name, () => {
                    const heap = createAppHeap(chunks, false, target)
                    heap.read(setup)
                    assert.equal(heap.read('typeof globalThis'), globalType)
                    const provider = heap.evaluate('common/vpt/global.js')
                    assert.ok(provider && typeof provider === 'object')
                    assert.strictEqual(Reflect.get(provider, 'vptGlobal'), heap.read('this'))
                    assert.equal(heap.read('typeof __rolldown_runtime__'), 'undefined')
                    assert.deepEqual(heap.registrations, [])
                    // Record the install target inside this heap, then restore Reflect before exercising any HMR patches.
                    heap.read(`
                        let runtimeGlobal;
                        const nativeReflectSet = Reflect.set;
                        Reflect.set = (target, key, ...args) => {
                            if (key === '__rolldown_runtime__') {
                                runtimeGlobal = target;
                            }
                            return nativeReflectSet(target, key, ...args);
                        };
                    `)
                    assertPolyfilledApp(heap, 'function')
                    heap.read('Reflect.set = nativeReflectSet;')
                    const globalEntry = heap.evaluate('common/vpt/global.js')
                    assert.ok(globalEntry && typeof globalEntry === 'object')
                    assert.strictEqual(Reflect.get(globalEntry, 'vptGlobal'), heap.read('runtimeGlobal'))
                    assert.strictEqual(heap.read('runtimeGlobal'), heap.read('this'))
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
                    assert.equal(heap.read('typeof globalThis'), globalType, 'startup must not install a host alias')
                    assert.equal(heap.read('globalDiscoveries'), globalType === 'object' ? 0 : 1)
                })
            }
        })
    }
}

for (const target of miniTargets) {
    for (const mode of ['production', 'devtools', 'interpreter', 'rebuild'] as const) {
        test(`${target} ${mode}: the empty selection keeps core-js out while development retains its microtask fallback`, async (t) => {
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

            for (const setup of ['delete this.globalThis;', 'let globalThis;']) {
                await t.test(`failed discovery: ${setup}`, async () => {
                    const restricted = createAppHeap(chunks, true, target)
                    restricted.read(`
                        ${setup}
                        Object.preventExtensions(Object.prototype);
                        this.diagnostics = [];
                        this.console = { ...console, error: (...args) => diagnostics.push(args) };
                    `)
                    const provider = restricted.evaluate('common/vpt/global.js')
                    assert.ok(provider && typeof provider === 'object')
                    restricted.read('const sharedGlobal = Object[Symbol.for("vpt.fake.global")];')
                    assert.strictEqual(Reflect.get(provider, 'vptGlobal'), restricted.read('sharedGlobal'))
                    assert.notStrictEqual(restricted.read('sharedGlobal'), restricted.read('this'))
                    restricted.evaluate('common/bootstrap.js')
                    // Sval publishes its imported runtime on the host's global alias; generated app code must not need it.
                    restricted.read('this.__rolldown_runtime__ = undefined;')
                    restricted.evaluate('app.js')
                    restricted.evaluate('pages/home/index.js')
                    restricted.evaluate('comp.js')
                    restricted.evaluate('custom-wrapper.js')
                    assert.deepEqual(restricted.registrations, ['App', 'Page', 'Component', 'Component'])
                    assert.equal(restricted.read('sharedGlobal.polyfillProbe.href'), 'https://example.com/dir/child')
                    assert.equal(restricted.read('typeof globalThis'), 'undefined')
                    assert.equal(restricted.read('typeof __rolldown_runtime__'), 'undefined')
                    assert.equal(restricted.read('typeof queueMicrotask'), 'undefined')
                    if (mode !== 'production') {
                        assert.equal(restricted.read('typeof sharedGlobal.__rolldown_runtime__'), 'object')
                        restricted.read(`
                            this.microtaskOrder = ['sync'];
                            sharedGlobal.queueMicrotask(() => microtaskOrder.push('queued'));
                            microtaskOrder.push('after-schedule');
                        `)
                        assert.deepEqual(restricted.json('microtaskOrder'), ['sync', 'after-schedule'])
                        await Promise.resolve()
                        assert.deepEqual(restricted.json('microtaskOrder'), ['sync', 'after-schedule', 'queued'])
                    }
                    assert.equal(restricted.read('globalDiscoveries'), 1)
                    assert.equal(restricted.read('diagnostics.length'), 1)
                })
            }
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

for (const target of miniTargets) {
    test(`${target}: a real React Refresh patch uses the shared global after failed discovery`, async () => {
        await compileFixture(target, 'devtools', [], async (chunks, root) => {
            const patchesPath = path.join(root, 'dist/hmr/patches.js')
            await waitForPatchSource(patchesPath, 'module.exports')
            const heaps = [false, true].map((restricted) => {
                const heap = createAppHeap(chunks, true, target)
                if (restricted) {
                    heap.read(`
                        delete this.globalThis;
                        Object.preventExtensions(Object.prototype);
                        this.console = { ...console, error() {} };
                    `)
                }
                const provider = heap.evaluate('common/vpt/global.js')
                assert.ok(provider && typeof provider === 'object')
                heap.read(`const sharedGlobal = ${restricted ? 'Object[Symbol.for("vpt.fake.global")]' : 'this'};`)
                assert.strictEqual(Reflect.get(provider, 'vptGlobal'), heap.read('sharedGlobal'))
                heap.evaluate('app.js')
                heap.evaluate('pages/home/index.js')
                return heap
            })
            const pagePath = path.join(root, 'src/pages/home/index.tsx')
            for (const seq of [1, 2]) {
                // Both cold and patched Refresh boundaries must arm their next accept callback in a microtask.
                await Promise.resolve()
                const marker = `refreshed page ${seq}`
                await writeFile(
                    `${pagePath}.tmp`,
                    `export default function Home() { return ${JSON.stringify(marker)} }`
                )
                await rename(`${pagePath}.tmp`, pagePath)
                const source = await waitForPatchSource(patchesPath, marker)
                assert.match(source, /validateRefreshBoundaryAndEnqueueUpdate/)
                assert.doesNotMatch(source, /vpt\.fake\.global|__VPT_GLOBAL__/)
                for (const heap of heaps) {
                    // Keep the real factory and changed IDs; only the fixture socket uses a deterministic build ID.
                    const rendered = heap.read(`(() => {
                        const module = { exports: {} };
                        ${source}
                        const runtime = sharedGlobal.__rolldown_runtime__;
                        runtime.applyPatches({ ...module.exports, buildId: 'test' });
                        const patches = module.exports.patches;
                        return runtime.loadExports(patches[patches.length - 1].changedIds[0]).default();
                    })()`)
                    const reports = heap.reports.map((report) => JSON.parse(report).data)
                    assert.ok(
                        reports.some((report) => report.kind === 'applied' && report.seq === seq),
                        JSON.stringify(reports)
                    )
                    assert.equal(
                        reports.some((report) => report.kind === 'rebuild'),
                        false
                    )
                    assert.equal(rendered, marker)
                }
            }
        })
    })
}

/** The dev host publishes metadata asynchronously, after bundle capture, and replaces patch files atomically. */
async function waitForPatchSource(fileName: string, marker: string): Promise<string> {
    const deadline = Date.now() + 10_000
    while (true) {
        assert.ok(Date.now() < deadline, `Timed out waiting for patch source containing ${marker}`)
        const source = await readFile(fileName, 'utf8').catch((error: unknown) => {
            assert.ok(error instanceof Error && 'code' in error && error.code === 'ENOENT')
            return ''
        })
        if (source.includes(marker)) {
            return source
        }
        await delay(10)
    }
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
