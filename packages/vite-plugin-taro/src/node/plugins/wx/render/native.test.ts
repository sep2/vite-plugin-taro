import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { renderNative } from './native.ts'

test('renders native require and CommonJS exports', () => {
    const source = `import { instantiate } from "../transport.js"
export { instantiate }`
    const result = renderNative(source, { fileName: 'assets/bootstrap-a.js' } as Rolldown.RenderedChunk)
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

test('synchronously activates an eager native capsule through the Vite preload identity wrapper', () => {
    const source = `import { loadCapsuleConfig, __vitePreload } from "./assets/bootstrap-a.js"
App(loadCapsuleConfig("App", () => __vitePreload(() => import("./assets/module-b.js"), void 0)))`
    const result = renderNative(source, { fileName: 'app.js' } as Rolldown.RenderedChunk)
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
        'App',
        result.code
    )(
        (id: string) => {
            requiredPaths.push(id)
            return {
                loadCapsuleConfig(_name: string, loadCapsule: () => { default: object }) {
                    return loadCapsule().default
                },
                __vitePreload(load: () => unknown) {
                    return load()
                }
            }
        },
        { System: system },
        (registeredConfig: unknown) => registrations.push(registeredConfig)
    )

    assert.strictEqual(registrations[0], config)
    assert.deepEqual(requiredPaths, ['./assets/bootstrap-a.js'])
    assert.deepEqual(importedModuleIds, ['assets/module-b.js'])
    assert.match(result.code, /vitePreload/)
    assert.ok(result.map)
    assert.deepEqual(result.map.sources, ['app.js'])
})
