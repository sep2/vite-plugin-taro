import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { renderNativeModule } from './render-native-module.ts'

test('renders native require and CommonJS exports', () => {
    const source = `const transport = __VITE_PLUGIN_TARO_NATIVE_REQUIRE__("../transport.js")
export const instantiate = transport.instantiate`
    const result = renderNativeModule(source, { fileName: 'assets/bootstrap-a.js' } as Rolldown.RenderedChunk)
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

test('renders static native imports and dynamic SystemJS imports', async () => {
    const source = `import { createNativeConfig } from "./assets/bootstrap-a.js"
const loadModule = () => import("./assets/module-b.js")
App({
    createNativeConfig,
    loadModule
})`
    const result = renderNativeModule(source, { fileName: 'app.js' } as Rolldown.RenderedChunk)
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
        'globalThis',
        'App',
        result.code
    )(
        (id: string) => {
            requiredPaths.push(id)
            return {
                createNativeConfig() {
                    return undefined
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
    assert.deepEqual(result.map.sources, ['app.js'])
})
