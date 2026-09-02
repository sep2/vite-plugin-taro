import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import type { RuntimeContract } from '../mini-contract.ts'
import { createMiniModuleClassifier, rolldownRuntimeId } from '../module/module.ts'
import { renderNative as renderNativeWithRuntime } from './native.ts'

const runtime: RuntimeContract = {
    globalObject: 'global',
    modules: {
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
    }
}
const { appCapsule: appCapsulePath, bootstrap: bootstrapPath } = runtime.modules
const classifyModule = createMiniModuleClassifier(runtime.modules)

function renderNative(input: Omit<Parameters<typeof renderNativeWithRuntime>[0], 'runtime' | 'classifyModule'>) {
    return renderNativeWithRuntime({ ...input, runtime: runtime, classifyModule: classifyModule })
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
        'global',
        'Page',
        result.code
    )(
        (id: string) => {
            requiredPaths.push(id)
            return {}
        },
        { System: system },
        (registeredConfig: unknown) => registrations.push(registeredConfig)
    )

    assert.strictEqual(registrations[0], config)
    assert.deepEqual(requiredPaths, ['./assets/bootstrap-a.js'])
    assert.deepEqual(importedModuleIds, ['module-b.js'])
    assert.doesNotMatch(result.code, /import\(/)
    assert.ok(result.map)
    assert.deepEqual(result.map.sources, ['app.js'])
})

test('uses the contracted runtime global for capsule imports', () => {
    const nativeChunk = chunk({ fileName: 'app.js', moduleIds: ['/native-app'], isEntry: true })
    const capsuleChunk = chunk({
        fileName: 'assets/module.js',
        moduleIds: [appCapsulePath],
        isEntry: true
    })
    const result = renderNativeWithRuntime({
        code: 'import config from "./assets/module.js"\nPage(config)',
        chunk: nativeChunk,
        chunks: { 'assets/module.js': capsuleChunk },
        runtime: { ...runtime, globalObject: 'my' },
        classifyModule: classifyModule,
        sourcemap: false
    })

    assert.match(result.code, /my\.System\.importSync/)
    assert.doesNotMatch(result.code, /global\.System\.importSync/)
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
