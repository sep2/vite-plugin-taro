import assert from 'node:assert/strict'
import test from 'node:test'
import { renderAppShell } from './render-app-shell.ts'

test('restores native require in the App shell', () => {
    const source = `__VITE_PLUGIN_TARO_NATIVE_REQUIRE__("./transport.js")
App({ config: {} })`
    const result = renderAppShell(source, 'app.js')
    const requiredPaths: string[] = []
    const registrations: unknown[] = []

    Function(
        'require',
        'App',
        result.code
    )(
        (id: string) => requiredPaths.push(id),
        (config: unknown) => registrations.push(config)
    )

    assert.deepEqual(requiredPaths, ['./transport.js'])
    assert.deepEqual(registrations, [{ config: {} }])
    assert.deepEqual(result.map.sources, ['app.js'])
})
