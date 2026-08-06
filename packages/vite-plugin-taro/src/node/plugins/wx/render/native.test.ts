import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { appCapsulePath, bootstrapPath, rolldownRuntimeId } from '../module.ts'
import { renderNative } from './native.ts'

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
    assert.deepEqual(importedModuleIds, ['assets/module-b.js'])
    assert.doesNotMatch(result.code, /import\(/)
    assert.ok(result.map)
    assert.deepEqual(result.map.sources, ['app.js'])
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
