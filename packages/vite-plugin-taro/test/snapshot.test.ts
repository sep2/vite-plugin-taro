import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createWxHmrSnapshot, serializeWxHmrSnapshot } from '../src/vite/hmr/snapshot.ts'
import type { VitePluginTaroBuildContext } from '../src/vite/types.ts'

test('normalizes Rolldown preserve-module output into a complete literal snapshot', () => {
    const appComponentFile = path.resolve('src/app.ts')
    const context: VitePluginTaroBuildContext = {
        target: 'wx',
        appComponentFile,
        pages: [{ path: 'pages/index/index', config: {} }],
        appConfig: {},
        projectConfigJson: {},
        projectPrivateConfigJson: {},
        sitemapJson: {}
    }
    const snapshot = createWxHmrSnapshot(
        {
            output: [
                {
                    type: 'chunk',
                    fileName: 'app.js',
                    code: 'module.exports = function App() {}',
                    facadeModuleId: appComponentFile
                },
                {
                    type: 'chunk',
                    fileName: 'page.js',
                    code: 'module.exports = function Page() {}',
                    facadeModuleId: path.resolve('src/pages/index/index.tsx')
                },
                {
                    type: 'chunk',
                    fileName: 'shared.js',
                    code: 'exports.value = 1',
                    facadeModuleId: path.resolve('src/shared.ts')
                },
                {
                    type: 'chunk',
                    fileName: 'lazy.js',
                    code: 'exports.lazy = true',
                    facadeModuleId: path.resolve('src/lazy.ts')
                },
                { type: 'asset', fileName: 'style.css', source: '.page{}' },
                { type: 'asset', fileName: 'assets/icon.png', source: new Uint8Array([1, 2, 3]) }
            ]
        },
        context
    )

    assert.equal(snapshot.appRoot, '/app.js')
    assert.equal(snapshot.pageRoots['pages/index/index'], '/page.js')
    assert.ok(snapshot.factories['/shared.js'])
    assert.ok(snapshot.factories['/lazy.js'])
    assert.equal(snapshot.css, '.page{}')
    assert.deepEqual(snapshot.assets['assets/icon.png'], new Uint8Array([1, 2, 3]))

    const source = serializeWxHmrSnapshot(snapshot, 3)
    assert.match(source, /applySnapshot/)
    assert.match(source, /function\(module,exports,require\)/)
    assert.doesNotMatch(source, /importers:/)
    assert.doesNotMatch(source, /eval\(|new Function/)
})
