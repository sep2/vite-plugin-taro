import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { renderCapsule } from './capsule.ts'

test('converts a final ESM chunk into a System registration capsule', () => {
    const result = renderCapsule(
        `import { value } from './dependency.js'
export const doubled = value * 2`,
        { fileName: 'assets/root.js' } as Rolldown.RenderedChunk
    )
    const commonJsModule: { exports?: unknown } = {}

    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['assets/dependency.js'])
    assert.equal(typeof commonJsModule.exports[1], 'function')
    assert.doesNotMatch(result.code, /System\.register/)
})

test('canonicalizes static and dynamic references owned by a subpackage', () => {
    const result = renderCapsule(
        `import { value } from '../../assets/shared.js'
export const load = () => import('./lazy.js')
export { value }`,
        { fileName: 'sub/p_account/page.js' } as Rolldown.RenderedChunk
    )
    const commonJsModule: { exports?: unknown } = {}
    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['assets/shared.js'])
    assert.match(result.code, /_context\.import\(['"]sub\/p_account\/lazy\.js['"]\)/)
})

test('keeps Vite preload imports while converting dynamic imports', () => {
    const result = renderCapsule(
        `import { __vitePreload } from './bootstrap.js'
export const load = () => __vitePreload(() => import('./lazy.js'), __VITE_PRELOAD__)`,
        { fileName: 'assets/root.js' } as Rolldown.RenderedChunk
    )
    const commonJsModule: { exports?: unknown } = {}
    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['assets/bootstrap.js'])
    assert.match(result.code, /_context\.import\(['"]assets\/lazy\.js['"]\)/)
    assert.match(result.code, /VITE_PRELOAD/)
    assert.ok(result.map)
    assert.notEqual(typeof result.map, 'string')
    assert.deepEqual(result.map.sources, ['assets/root.js'])
    assert.ok(result.map.mappings)
})
