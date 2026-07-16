import assert from 'node:assert/strict'
import test from 'node:test'
import { renderAppShell } from './render-app-shell.ts'

test('renders native require and the App module import', async () => {
    const source = `__VITE_PLUGIN_TARO_NATIVE_REQUIRE__("./transport.js")
const loadAppModule = () => import("./assets/root-a.js")
App({
    config: {},
    loadAppModule
})`
    const result = renderAppShell(source, 'app.js')
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
        'System',
        'App',
        result.code
    )(
        (id: string) => requiredPaths.push(id),
        system,
        (config: unknown) => registrations.push(config)
    )
    const registration = registrations[0] as { loadAppModule: () => Promise<unknown> }
    await registration.loadAppModule()

    assert.deepEqual(requiredPaths, ['./transport.js'])
    assert.deepEqual(importedModuleUrls, ['vpt:/assets/root-a.js'])
    assert.deepEqual(result.map.sources, ['app.js'])
})
