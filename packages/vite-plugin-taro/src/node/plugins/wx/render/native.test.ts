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
    assert.deepEqual(result.map.sources, ['assets/bootstrap-a.js'])
})

test('keeps the native Vite preload identity wrapper around dynamic imports', async () => {
    const source = `import { createAppShell, __vitePreload } from "./assets/bootstrap-a.js"
App(createAppShell(() => __vitePreload(() => import("./assets/module-b.js"), void 0)))`
    const result = renderNative(source, { fileName: 'app.js' } as Rolldown.RenderedChunk)
    const importedModuleUrls: string[] = []
    const requiredPaths: string[] = []
    const registrations: unknown[] = []
    const system = {
        import(moduleUrl: string) {
            importedModuleUrls.push(moduleUrl)
            return Promise.resolve({})
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
                createAppShell(loadModule: () => Promise<unknown>) {
                    return { loadModule }
                },
                __vitePreload(load: () => unknown) {
                    return load()
                }
            }
        },
        { System: system },
        (config: unknown) => registrations.push(config)
    )
    const registration = registrations[0] as { loadModule: () => Promise<unknown> }
    await registration.loadModule()

    assert.deepEqual(requiredPaths, ['./assets/bootstrap-a.js'])
    assert.deepEqual(importedModuleUrls, ['vpt:/assets/module-b.js'])
    assert.match(result.code, /vitePreload/)
    assert.deepEqual(result.map.sources, ['app.js'])
})
