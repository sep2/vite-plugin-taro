import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { build, type OutputChunk } from 'rolldown'
import { dev } from 'rolldown/experimental'
import { resolveRuntimeFile } from '../../../utils/packages.ts'
import { rolldownRuntimeId, vptGlobalBindingId } from '../module/module.ts'
import { createMiniGlobalPlugin } from './create-mini-global-plugin.ts'

const [plugin, devPlugin] = createMiniGlobalPlugin({
    getPhysicalChunkId(chunk) {
        assert.ok(typeof chunk !== 'string')
        return chunk.fileName
    }
})

test('virtual hooks match only the private binding and leave the real provider untouched', () => {
    assert.equal(plugin.name, 'vpt:mini-global')
    assert.equal(plugin.apply, undefined)
    assert.equal(devPlugin.name, 'vpt:mini-global-dev')
    assert.equal(devPlugin.apply, 'serve')
    for (const hook of [plugin.resolveId, plugin.load]) {
        assert.ok(hook && typeof hook === 'object')
        const filter = hook.filter
        assert.ok(filter && !Array.isArray(filter) && filter.id instanceof RegExp)
        assert.equal(filter.id.test(vptGlobalBindingId), true)
        assert.equal(filter.id.test(`${vptGlobalBindingId}?import`), true)
        assert.equal(filter.id.test(`${vptGlobalBindingId}-other`), false)
        assert.equal(filter.id.test(resolveRuntimeFile('global/vpt-global')), false)
    }
})

test('the virtual binding exports the exact provider object without probing or augmenting it', async () => {
    const provider = Object.freeze({ marker: 'shared global' })
    const result = await build({
        input: vptGlobalBindingId,
        // Isolate virtual loading here; the output tests below exercise rendering and standalone emission too.
        plugins: [{ name: plugin.name, resolveId: plugin.resolveId, load: plugin.load }],
        transform: { define: { __VPT_GLOBAL__: 'globalThis.provider' } },
        output: { format: 'cjs' },
        write: false
    })
    assert.equal(result.output.length, 1)
    const chunk = result.output[0]
    assert.ok(chunk.type === 'chunk')
    assert.deepEqual(chunk.moduleIds, [vptGlobalBindingId])
    assert.deepEqual(chunk.imports, [])
    const context = createContext({ provider, exports: {} }, { codeGeneration: { strings: false, wasm: false } })
    runInContext(chunk.code, context)
    assert.deepEqual(Object.keys(context.exports), ['vptGlobal'])
    assert.strictEqual(context.exports.vptGlobal, provider)
})

for (const command of ['serve', 'build'] as const) {
    for (const physicalFile of ['app.js', 'common/binding.js', 'sub/pages/home/index.js']) {
        test(`${command}: late runtime bindings use placement's ${physicalFile} path and preserve local scope`, async () => {
            const [placed, placedDev] = createMiniGlobalPlugin({ getPhysicalChunkId: () => physicalFile })
            assert.ok(typeof placed.config === 'function')
            const config: unknown = await Reflect.apply(placed.config, {}, [{}, { command }])
            assert.ok(config && typeof config === 'object')
            assert.equal('define' in config, false)
            // Capture both sides of binding insertion, before Rolldown's final printing, to prove the body is untouched.
            const linkedSources: string[] = []
            const result = await build({
                input: 'fixture',
                plugins: [
                    {
                        name: 'test:generated-runtime-bindings',
                        resolveId: (id) => id,
                        load: () => `
                            export const read = () => ({ __rolldown_runtime__, queueMicrotask });
                            export const schedule = (callback) => queueMicrotask(callback);
                            export function local(__rolldown_runtime__, queueMicrotask, __VPT_GLOBAL__) {
                                return { __rolldown_runtime__, queueMicrotask, __VPT_GLOBAL__ };
                            }
                            export const property = (object) => object.__rolldown_runtime__;
                            export const text = '__rolldown_runtime__ queueMicrotask __VPT_GLOBAL__';
                        `,
                        renderChunk: {
                            order: 'pre',
                            handler(code) {
                                linkedSources.push(code)
                            }
                        }
                    },
                    { name: placed.name, renderChunk: placed.renderChunk },
                    command === 'serve' && { name: placedDev.name, renderChunk: placedDev.renderChunk },
                    {
                        name: 'test:capture-bound-runtime',
                        renderChunk: {
                            order: 'pre',
                            handler(code) {
                                linkedSources.push(code)
                            }
                        }
                    }
                ],
                output: { format: 'cjs', entryFileNames: 'logical.js' },
                write: false
            })
            const chunk = result.output[0]
            assert.ok(chunk.type === 'chunk')
            assert.deepEqual(chunk.moduleIds, ['fixture'], 'ordinary chunks have no global binding or runtime module')
            const shared = { __rolldown_runtime__: { marker: 'shared' } }
            const ambient = {
                __rolldown_runtime__: { marker: 'ambient' },
                queueMicrotask: (callback: () => void) => callback()
            }
            // Count native provider lookups in this heap; calls after chunk initialization must use the retained singleton.
            let providerLoads = 0
            const context = createContext({
                ...ambient,
                exports: {},
                require(request: string) {
                    assert.equal(command, 'serve', 'production must not add a native provider dependency')
                    assert.equal(path.posix.join(path.posix.dirname(physicalFile), request), 'common/vpt-global.js')
                    providerLoads += 1
                    return { vptGlobal: shared }
                }
            })
            runInContext(chunk.code, context)
            assert.equal(providerLoads, command === 'serve' ? 1 : 0)
            const expectedRuntime = (command === 'serve' ? shared : ambient).__rolldown_runtime__
            assert.equal(runInContext('exports.read().__rolldown_runtime__', context), expectedRuntime)
            assert.equal(runInContext('exports.read().queueMicrotask', context), ambient.queueMicrotask)
            assert.equal(runInContext('exports.schedule(() => { this.scheduled = true }); scheduled', context), true)
            assert.equal(
                runInContext('JSON.stringify(exports.local(1, 2, 3))', context),
                JSON.stringify({ __rolldown_runtime__: 1, queueMicrotask: 2, __VPT_GLOBAL__: 3 })
            )
            assert.equal(runInContext('exports.property({ __rolldown_runtime__: 4 })', context), 4)
            assert.equal(runInContext('exports.text', context), '__rolldown_runtime__ queueMicrotask __VPT_GLOBAL__')
            if (command === 'serve') {
                // The App-lifetime runtime is captured once, not looked up on every generated call.
                shared.__rolldown_runtime__ = { marker: 'replacement' }
                assert.equal(runInContext('exports.read().__rolldown_runtime__', context), expectedRuntime)
                assert.equal(providerLoads, 1)
                assert.match(chunk.code, /^const __rolldown_runtime__ = require\(/)
                assert.equal(linkedSources[1].slice(linkedSources[1].indexOf('\n') + 1), linkedSources[0])
            } else {
                assert.equal(linkedSources[1], linkedSources[0])
                assert.doesNotMatch(chunk.code, /vpt-global\.js/)
            }
        })
    }
}

for (const minify of [false, true]) {
    test(`the runtime owner initializes its binding before co-located graph registrations, minify ${minify}`, async (t) => {
        const [owner, ownerDev] = createMiniGlobalPlugin({
            getPhysicalChunkId(chunk) {
                assert.ok(typeof chunk !== 'string')
                return chunk.fileName
            }
        })
        // Capture the real DevEngine's initial output, including the graph prelude it inserts after the runtime module.
        const chunks: OutputChunk[] = []
        const engine = await dev(
            {
                input: 'fixture',
                transform: { inject: { globalThis: [vptGlobalBindingId, 'vptGlobal'] } },
                experimental: {
                    devMode: {
                        implement: '__rolldown_runtime__ = __createRuntime(__VPT_GLOBAL__);',
                        skipCommonRuntimeInjection: true,
                        lazy: false
                    }
                },
                plugins: [
                    {
                        name: 'test:co-located-runtime',
                        resolveId: (id) => (id === 'fixture' ? id : undefined),
                        load: (id) =>
                            id === 'fixture'
                                ? 'export const runtime = __rolldown_runtime__; export const root = globalThis;'
                                : undefined
                    },
                    {
                        name: owner.name,
                        resolveId: owner.resolveId,
                        load: owner.load,
                        renderChunk: owner.renderChunk,
                        generateBundle: owner.generateBundle
                    },
                    { name: ownerDev.name, renderChunk: ownerDev.renderChunk },
                    {
                        name: 'test:capture-runtime-owner',
                        generateBundle: {
                            order: 'post',
                            handler(_options, bundle) {
                                chunks.push(...Object.values(bundle).filter((output) => output.type === 'chunk'))
                            }
                        }
                    }
                ]
            },
            { format: 'es', entryFileNames: 'combined.js', minify },
            { watch: { skipWrite: true } }
        )
        t.after(() => engine.close())
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        const chunk = chunks.find((output) => output.facadeModuleId === 'fixture')
        assert.ok(chunk?.type === 'chunk')
        assert.ok(chunk.moduleIds.includes(rolldownRuntimeId))
        assert.ok(chunk.moduleIds.includes(vptGlobalBindingId))
        // DevEngine emits the same ESM graph prelude as Mini development; lower only module syntax for this VM fixture.
        const native = await build({
            input: 'combined',
            external: (id) => id !== 'combined',
            plugins: [{ name: 'test:execute-owner', resolveId: (id) => id, load: () => chunk.code }],
            output: { format: 'cjs' },
            write: false
        })
        const executable = native.output[0]
        assert.ok(executable.type === 'chunk')
        // This journal proves initialization precedes generated code, without an ambient binding masking a missing local.
        const events: string[] = []
        const runtime = {
            registerGraph() {
                events.push('graph')
            },
            createModuleHotContext() {
                events.push('hot')
                return {}
            },
            registerModule() {
                events.push('module')
            }
        }
        const shared = {
            get __rolldown_runtime__() {
                assert.ok(events.includes('create'), 'the owner must not read the shared property before construction')
                events.push('property-read')
                return runtime
            }
        }
        const context = createContext(
            {
                exports: {},
                __createRuntime(global: unknown) {
                    assert.strictEqual(global, shared)
                    events.push('create')
                    return runtime
                },
                require(request: string) {
                    assert.equal(path.posix.normalize(request), 'common/vpt-global.js')
                    return { vptGlobal: shared }
                }
            },
            { codeGeneration: { strings: false, wasm: false } }
        )
        runInContext(`(function(exports, require) {\n${executable.code}\n})(exports, require);`, context)
        assert.strictEqual(runInContext('exports.runtime', context), runtime)
        assert.strictEqual(runInContext('exports.root', context), shared)
        assert.deepEqual(events.slice(0, 2), ['create', 'graph'])
        assert.ok(events.includes('hot') && events.includes('module'))
        assert.equal(
            events.includes('property-read'),
            false,
            'the owner uses its returned instance, not property rewrites'
        )
        assert.equal(runInContext('typeof __rolldown_runtime__', context), 'undefined')
    })
}

test('provider and development hooks independently filter their own references', () => {
    for (const [current, reference] of [
        [plugin, '__VPT_GLOBAL__'],
        [devPlugin, '__rolldown_runtime__']
    ] as const) {
        const hook = current.renderChunk
        assert.ok(hook && typeof hook === 'object')
        assert.equal(hook.order, 'pre')
        assert.ok(hook.filter && !Array.isArray(hook.filter))
        const filter = hook.filter.code
        assert.ok(filter instanceof RegExp)
        for (const name of ['__VPT_GLOBAL__', '__rolldown_runtime__']) {
            assert.equal(filter.test(name), name === reference)
        }
        assert.equal(filter.test('queueMicrotask(callback);'), false)
        assert.equal(filter.test('export const value = Math.max(3, 4);'), false)
    }
})

for (const minify of [false, true]) {
    for (const sourcemap of [false, true, 'inline', 'hidden'] as const) {
        test(`standalone output respects minification ${minify} and source maps ${sourcemap}`, async () => {
            const result = await build({
                input: vptGlobalBindingId,
                plugins: [
                    {
                        name: plugin.name,
                        resolveId: plugin.resolveId,
                        load: plugin.load,
                        renderChunk: plugin.renderChunk,
                        generateBundle: plugin.generateBundle
                    }
                ],
                output: {
                    dir: path.resolve('/fixture/output'),
                    format: 'cjs',
                    entryFileNames: 'nested/[name]-[hash].js',
                    minify,
                    sourcemap
                },
                write: false
            })
            const binding = result.output.find(
                (chunk) => chunk.type === 'chunk' && chunk.facadeModuleId === vptGlobalBindingId
            )
            const provider = result.output.find((chunk) => chunk.fileName === 'common/vpt-global.js')
            assert.ok(binding?.type === 'chunk' && provider?.type === 'chunk')
            assert.equal(provider.fileName, 'common/vpt-global.js')
            assert.deepEqual(provider.imports, [])
            assert.deepEqual(provider.moduleIds, [])
            assert.match(provider.code, /^["']use strict["']/)
            assert.doesNotMatch(provider.code, /require\(|__rolldown_runtime__|__VPT_GLOBAL__/)
            assert.doesNotMatch(binding.code, /__VPT_GLOBAL__|vpt\.fake\.global/)
            assert.match(binding.code, /\.\.\/common\/vpt-global\.js/)
            const context = createContext({}, { codeGeneration: { strings: false, wasm: false } })
            const globalExports: unknown = runInContext(
                `(function(exports) {\n${provider.code}\nreturn exports; })({})`,
                context
            )
            context.require = (request: string) => {
                assert.equal(path.posix.join(path.posix.dirname(binding.fileName), request), provider.fileName)
                return globalExports
            }
            context.exports = {}
            runInContext(`(function(exports, require) {\n${binding.code}\n})(exports, require)`, context)
            assert.equal(runInContext('exports.vptGlobal === globalThis', context), true)

            // The standalone export wrapper must preserve discovery's string-key fallback before any polyfills exist.
            // Diagnostics belong only to this restricted heap and distinguish failure recovery from native probing.
            const diagnostics: unknown[][] = []
            const restricted = createContext({ console: { error: (...args: unknown[]) => diagnostics.push(args) } })
            runInContext('delete this.globalThis; delete this.Symbol; Object.freeze(Object.prototype);', restricted)
            runInContext(`(function(exports) {\n${provider.code}\n})({})`, restricted)
            assert.equal(diagnostics.length, 1)
            assert.equal(
                runInContext('Object["vpt.fake.global"].globalThis === Object["vpt.fake.global"]', restricted),
                true
            )
            assert.equal(runInContext('typeof globalThis', restricted), 'undefined')

            const map = result.output.find((output) => output.fileName === 'common/vpt-global.js.map')
            if (sourcemap === false || sourcemap === 'inline') {
                assert.equal(map, undefined)
            } else {
                assert.ok(map?.type === 'asset')
                const parsed: { mappings: string; sources: string[]; sourcesContent: string[] } = JSON.parse(
                    String(map.source)
                )
                assert.ok(parsed.mappings.length > 0)
                assert.ok(parsed.sources.some((source) => source.endsWith('/global/vpt-global.ts')))
                assert.ok(parsed.sourcesContent.some((source) => source.includes('typeof globalThis')))
            }
            if (sourcemap === 'inline') {
                assert.match(provider.code, /sourceMappingURL=data:application\/json;.*base64,/)
            } else if (sourcemap === true) {
                assert.match(provider.code, /sourceMappingURL=vpt-global\.js\.map/)
            } else {
                assert.doesNotMatch(provider.code, /sourceMappingURL=/)
            }
        })
    }
}
