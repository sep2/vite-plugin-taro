import assert from 'node:assert/strict'
import test from 'node:test'
import { walk } from 'oxc-walker'
import { parseSync } from 'rolldown/utils'
import type { Rolldown } from 'vite'
import type { RuntimeModulesContract } from '../mini-contract.ts'
import { createMiniModuleClassifier, rolldownRuntimeId } from '../module/module.ts'
import { renderNative as renderNativeWithRuntime } from './native.ts'

const runtimeModules = {
    bootstrap: '/runtime/bootstrap',
    transport: '/runtime/transport',
    appShell: '/runtime/app-shell',
    appCapsule: '/runtime/app-capsule',
    componentShell: '/runtime/component-shell',
    componentCapsule: '/runtime/component-capsule',
    customWrapperShell: '/runtime/custom-wrapper-shell',
    pageShell: '/runtime/page-shell',
    pageCapsule: '/runtime/page-capsule',
    devtoolsHmrRuntime: '/runtime/devtools-hmr',
    interpreterHmrRuntime: '/runtime/interpreter-hmr'
} satisfies RuntimeModulesContract
const { appCapsule: appCapsulePath, bootstrap: bootstrapPath } = runtimeModules
const classifyModule = createMiniModuleClassifier(runtimeModules)

function renderNative(
    input: Omit<
        Parameters<typeof renderNativeWithRuntime>[0],
        'classifyModule' | 'bootstrapModuleId' | 'getPhysicalChunkId'
    >
) {
    return renderNativeWithRuntime({
        ...input,
        bootstrapModuleId: bootstrapPath,
        getPhysicalChunkId: (chunk) => (typeof chunk === 'string' ? 'assets/bootstrap-a.js' : chunk.fileName),
        classifyModule: classifyModule
    })
}

function chunk({
    fileName,
    moduleIds,
    isEntry
}: {
    fileName: string
    moduleIds: readonly string[]
    isEntry: boolean
}): Rolldown.RenderedChunk {
    return { fileName, moduleIds, isEntry } as Rolldown.RenderedChunk
}

test('renders native require and CommonJS exports', () => {
    const source = `import { instantiate } from "../transport.js"
export { instantiate }`
    const result = renderNative({
        code: source,
        chunk: chunk({ fileName: 'assets/bootstrap-a.js', moduleIds: [bootstrapPath], isEntry: false }),
        chunks: {},
        sourcemap: true
    })
    const requiredPaths: string[] = []
    const commonJsModule: { exports: Record<string, unknown> } = {
        exports: {}
    }
    const instantiate = () => undefined

    Function(
        'require',
        'module',
        'exports',
        result.code
    )(
        (id: string) => {
            requiredPaths.push(id)
            return { instantiate }
        },
        commonJsModule,
        commonJsModule.exports
    )

    assert.deepEqual(requiredPaths, ['../transport.js'])
    assert.doesNotMatch(result.code, /bootstrap-a|\.System/)
    assert.strictEqual(commonJsModule.exports.instantiate, instantiate)
    assert.ok(result.map)
    assert.deepEqual(result.map.sources, ['assets/bootstrap-a.js'])
})

test('synchronously activates a statically imported capsule even when its chunk is amphibious', () => {
    const source = `import "./assets/bootstrap-a.js"
import config from "./assets/module-b.js"
Page(config)`
    const nativeChunk = chunk({ fileName: 'app.js', moduleIds: ['/native-app'], isEntry: true })
    const chunks = {
        'assets/bootstrap-a.js': chunk({
            fileName: 'assets/bootstrap-a.js',
            moduleIds: [bootstrapPath],
            isEntry: false
        }),
        'assets/module-b.js': chunk({
            fileName: 'assets/module-b.js',
            moduleIds: [appCapsulePath, rolldownRuntimeId],
            isEntry: true
        })
    }
    const result = renderNative({ code: source, chunk: nativeChunk, chunks, sourcemap: true })
    const importedModuleIds: string[] = []
    const requiredPaths: string[] = []
    const registrations: unknown[] = []
    const config = {}
    const system = {
        importSync(moduleId: string) {
            importedModuleIds.push(moduleId)
            return { default: config }
        }
    }

    Function(
        'require',
        'globalThis',
        'Page',
        result.code
    )(
        (id: string) => {
            requiredPaths.push(id)
            return { System: system }
        },
        undefined,
        (registeredConfig: unknown) => registrations.push(registeredConfig)
    )

    assert.strictEqual(registrations[0], config)
    assert.deepEqual(requiredPaths, ['./assets/bootstrap-a.js'])
    assert.deepEqual(importedModuleIds, ['assets/module-b.js'])
    assert.doesNotMatch(result.code, /import\(|__nativeRequire/)
    assert.ok(result.map)
    assert.deepEqual(result.map.sources, ['app.js'])
    assert.deepEqual(result.map.sourcesContent, [source])
})

for (const { declaration, read } of [
    { declaration: "import './assets/bootstrap-a.js'", read: 'undefined' },
    { declaration: "import { System as loader } from './assets/bootstrap-a.js'", read: 'loader' },
    { declaration: "import * as bootstrap from './assets/bootstrap-a.js'", read: 'bootstrap.System' },
    { declaration: "import bootstrap from './assets/bootstrap-a.js'", read: 'bootstrap.System' }
]) {
    test(`reuses the bootstrap namespace for dynamic imports: ${declaration}`, async () => {
        const result = renderNative({
            code: `${declaration};
                export const value = ${read};
                export const read = () => ${read};
                export const load = (__nativeImport, __nativeSystem, require, System, globalThis) => import('feature.js');
            `,
            chunk: chunk({ fileName: 'app.js', moduleIds: ['/native-app'], isEntry: true }),
            chunks: {},
            sourcemap: false
        })
        // The export cell and journal capture generated module behavior without an ambient globalThis binding.
        const exports: Record<string, unknown> = {}
        const requiredPaths: string[] = []
        const namespace = { value: 42 }
        const pending = Promise.resolve(namespace)
        const system = {
            import(id: string) {
                assert.strictEqual(this, system)
                assert.equal(id, 'feature.js')
                return pending
            }
        }
        // This mutable dependency models live named and default exports without re-evaluating the importer.
        const dependency = { __esModule: true, System: system, default: { System: system } }
        Function(
            'require',
            'exports',
            'globalThis',
            result.code
        )(
            (id: string) => {
                requiredPaths.push(id)
                return dependency
            },
            exports,
            undefined
        )
        assert.strictEqual(exports.value, read === 'undefined' ? undefined : system)
        const load = exports.load
        assert.ok(typeof load === 'function')
        assert.strictEqual(load(), pending)
        assert.strictEqual(await load(), namespace)
        const replacement = Promise.resolve({ value: 43 })
        const replacementSystem = {
            import(id: string) {
                assert.strictEqual(this, replacementSystem)
                assert.equal(id, 'feature.js')
                return replacement
            }
        }
        dependency.System = replacementSystem
        dependency.default.System = replacementSystem
        const readValue = exports.read
        assert.ok(typeof readValue === 'function')
        assert.strictEqual(readValue(), read === 'undefined' ? undefined : replacementSystem)
        assert.strictEqual(load(), replacement)
        assert.deepEqual(requiredPaths, ['./assets/bootstrap-a.js'])
        assert.doesNotMatch(result.code, /__nativeRequire|globalThis\.System/)
    })
}

test('routes native dynamic imports through SystemJS without changing promises or namespaces', async () => {
    const filename = 'common/vendor.js'
    const result = renderNative({
        code: `
            import { resolveId } from './resolver.js'
            // Keep import(moduleId) in comments and strings unchanged.
            export const text = 'import(moduleId)'
            export const loadRelative = () => import('./lazy.js')
            export const loadParent = () => import('../sub/p_lazy/feature.js')
            export const loadExternal = () => import('external-feature')
            export const __hmr_import = (moduleId) => import(/* @vite-ignore */ moduleId)
            export const loadComputed = () => import(resolveId())
        `,
        chunk: chunk({ fileName: filename, moduleIds: [bootstrapPath], isEntry: false }),
        chunks: {},
        sourcemap: true
    })
    const parsed = parseSync(filename, result.code)
    assert.deepEqual(parsed.errors, [])
    walk(parsed.program, {
        enter(node) {
            assert.notEqual(node.type, 'ImportExpression', 'Mini Program native output must not retain import() syntax')
        }
    })
    assert.match(result.code, /\/\/ Keep import\(moduleId\) in comments and strings unchanged\./)
    assert.ok(result.map?.mappings)
    assert.deepEqual(result.map.sources, [filename])

    const namespace = { value: 42 }
    const loaded = Promise.resolve(namespace)
    const missing = new Error('Unknown System module: missing')
    // The generated CommonJS module publishes its bindings into this local export cell.
    const exports: Record<string, unknown> = {}
    // This journal proves argument evaluation order and one loader call per import expression.
    const events: string[] = []
    // Bootstrap is a static dependency; dynamic loader calls must not require it again.
    const requiredPaths: string[] = []
    const system = {
        import(id: string) {
            assert.equal(this, system)
            events.push(`load:${id}`)
            return id === 'missing' ? Promise.reject(missing) : loaded
        }
    }
    Function(
        'require',
        'exports',
        'globalThis',
        result.code
    )(
        (id: string) => {
            requiredPaths.push(id)
            if (id === '../assets/bootstrap-a.js') {
                return { System: system }
            }
            assert.equal(id, './resolver.js')
            return {
                resolveId() {
                    events.push('resolve')
                    return 'common/lazy.js'
                }
            }
        },
        exports,
        undefined
    )
    assert.deepEqual(requiredPaths, ['../assets/bootstrap-a.js', './resolver.js'])
    assert.equal(exports.text, 'import(moduleId)')
    assert.deepEqual(events, [])
    for (const name of ['loadRelative', 'loadParent', 'loadExternal', '__hmr_import', 'loadComputed']) {
        const load = exports[name]
        assert.ok(typeof load === 'function')
        const loading: unknown = load('common/lazy.js')
        assert.equal(loading, loaded)
        assert.equal(await loading, namespace)
    }
    const load = exports.__hmr_import
    assert.ok(typeof load === 'function')
    await assert.rejects(load('missing'), (error) => error === missing)
    assert.deepEqual(requiredPaths, ['../assets/bootstrap-a.js', './resolver.js'])
    assert.deepEqual(events, [
        'load:common/lazy.js',
        'load:sub/p_lazy/feature.js',
        'load:external-feature',
        'load:common/lazy.js',
        'resolve',
        'load:common/lazy.js',
        'load:missing'
    ])
})

test('resolves loader imports from placed paths without changing logical dynamic-import identities', async () => {
    const nativeChunk = chunk({ fileName: 'common/worker.js', moduleIds: ['/worker'], isEntry: false })
    // Observe the exact inputs to placement: the importer chunk and bootstrap entry identity, not guessed filenames.
    const lookups: (Rolldown.RenderedChunk | string)[] = []
    const result = renderNativeWithRuntime({
        code: 'export const load = () => import("./feature.js")',
        chunk: nativeChunk,
        chunks: {},
        bootstrapModuleId: bootstrapPath,
        getPhysicalChunkId(input) {
            lookups.push(input)
            return typeof input === 'string' ? 'runtime/loader.js' : 'sub/p_fixture/common/worker.js'
        },
        classifyModule,
        sourcemap: false
    })
    assert.deepEqual(lookups, [nativeChunk, bootstrapPath])
    // These local cells capture the generated dependency and published function before executing the dynamic load.
    const required: string[] = []
    const exports: Record<string, unknown> = {}
    const value = { feature: true }
    Function(
        'require',
        'exports',
        result.code
    )((id: string) => {
        required.push(id)
        return {
            System: {
                import(moduleId: string) {
                    assert.equal(moduleId, 'common/feature.js')
                    return Promise.resolve(value)
                }
            }
        }
    }, exports)
    assert.deepEqual(required, ['../../../runtime/loader.js'])
    assert.ok(typeof exports.load === 'function')
    assert.strictEqual(await exports.load(), value)
})

test('keeps loader access hygienic across a static bootstrap cycle', async () => {
    const filename = 'common/bootstrap.js'
    const result = renderNativeWithRuntime({
        code: `
            export function load(require, System, globalThis, __nativeImport, __nativeImport1, __nativeSystem, __nativeSystem1, id) {
                return import(id)
            }
        `,
        chunk: chunk({ fileName: filename, moduleIds: [bootstrapPath], isEntry: true }),
        chunks: {},
        bootstrapModuleId: bootstrapPath,
        getPhysicalChunkId: () => filename,
        classifyModule,
        sourcemap: false
    })
    // CommonJS caches the export cell before evaluation. Capture that namespace, not its still-uninitialized System value.
    const exports: Record<string, unknown> = {}
    const requiredPaths: string[] = []
    const namespace = { value: 42 }
    const pending = Promise.resolve(namespace)
    const system = {
        import(id: string) {
            assert.strictEqual(this, system)
            assert.equal(id, 'feature.js')
            return pending
        }
    }
    Function(
        'require',
        'exports',
        'globalThis',
        result.code
    )(
        (id: string) => {
            requiredPaths.push(id)
            assert.equal(id, './bootstrap.js')
            return exports
        },
        exports,
        undefined
    )
    assert.deepEqual(requiredPaths, ['./bootstrap.js'])
    exports.System = system
    const load = exports.load
    assert.ok(typeof load === 'function')
    const unavailable = () => assert.fail('A nested binding captured the generated loader reference')
    const loading = load(
        unavailable,
        undefined,
        undefined,
        unavailable,
        unavailable,
        unavailable,
        unavailable,
        'feature.js'
    )
    assert.strictEqual(loading, pending)
    assert.strictEqual(await loading, namespace)
    assert.deepEqual(requiredPaths, ['./bootstrap.js'])
    assert.doesNotMatch(result.code, /globalThis\.System/)
})

test('renders declaration exports, quoted imports, and unrelated destructuring', () => {
    const result = renderNative({
        code: `
            import { 'kebab-name' as imported } from 'dependency'
            const { local } = { local: 1 }
            const state = { value: 1 }
            state.value++
            export function read() { return [imported, local] }
            export class Counter { static value = imported }
        `,
        chunk: chunk({ fileName: 'app.js', moduleIds: ['/native-app'], isEntry: true }),
        chunks: {},
        sourcemap: false
    })
    const commonJsModule: { exports: Record<string, unknown> } = { exports: {} }
    Function(
        'require',
        'module',
        'exports',
        result.code
    )(
        (id: string) => {
            assert.equal(id, 'dependency')
            return { 'kebab-name': 42 }
        },
        commonJsModule,
        commonJsModule.exports
    )

    const read = commonJsModule.exports.read
    const Counter = commonJsModule.exports.Counter
    if (typeof read !== 'function' || typeof Counter !== 'function') {
        assert.fail('Expected function and class declaration exports')
    }
    assert.deepEqual(Reflect.apply(read, undefined, []), [42, 1])
    assert.equal(Reflect.get(Counter, 'value'), 42)
})

test('rejects malformed native chunks before any source rewrite', () => {
    assert.throws(
        () =>
            renderNative({
                code: 'export const =',
                chunk: chunk({ fileName: 'app.js', moduleIds: ['/native-app'], isEntry: true }),
                chunks: {},
                sourcemap: false
            }),
        /Failed to parse app\.js with Oxc/
    )
})

test('rejects direct eval because native binding rewrites cannot preserve its scope semantics', () => {
    assert.throws(
        () =>
            renderNative({
                code: "const value = eval('1'); export { value }",
                chunk: chunk({ fileName: 'app.js', moduleIds: ['/native-app'], isEntry: true }),
                chunks: {},
                sourcemap: false
            }),
        /Unsupported final Rolldown native chunk app\.js: direct eval/
    )
})

test('rejects unsupported final native chunk grammar before rewriting', () => {
    const nativeChunk = chunk({ fileName: 'app.js', moduleIds: ['/native-app'], isEntry: true })
    const compile = (code: string) => renderNative({ code, chunk: nativeChunk, chunks: {}, sourcemap: false })

    assert.throws(() => compile('export default 1'), /source-level ExportDefaultDeclaration/)
    assert.throws(() => compile("export * from './dependency.js'"), /source-level ExportAllDeclaration/)
    assert.throws(() => compile("export { value } from './dependency.js'"), /re-exports/)
    assert.throws(
        () => compile("import value from './dependency.json' with { type: 'json' }; export { value }"),
        /import phases, attributes, or type-only imports/
    )
    assert.throws(
        () => compile("const load = () => import('./dependency.json', { with: { type: 'json' } })"),
        /dynamic import options or phases/
    )
    assert.throws(
        () => compile('let value; for ({ value } of values) {} export { value }'),
        /destructuring write to exported binding/
    )
    assert.throws(() => compile('export const { value } = source'), /exported destructuring declaration/)
    assert.throws(() => compile('export const [value = 1, , ...rest] = source'), /exported destructuring declaration/)
    assert.throws(() => compile('export const { value, ...rest } = source'), /exported destructuring declaration/)
})

test('rejects a capsule namespace import from a native shell', () => {
    const nativeChunk = chunk({ fileName: 'app.js', moduleIds: ['/native-app'], isEntry: true })
    const chunks = {
        'assets/module-b.js': chunk({
            fileName: 'assets/module-b.js',
            moduleIds: [appCapsulePath],
            isEntry: true
        })
    }

    assert.throws(
        () =>
            renderNative({
                code: 'import * as capsule from "./assets/module-b.js"\nApp(capsule.default)',
                chunk: nativeChunk,
                chunks,
                sourcemap: false
            }),
        /Expected one capsule value import/
    )
})
