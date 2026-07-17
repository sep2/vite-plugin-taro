import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { renderCapsule } from './render-capsule.ts'

test('converts a final ESM chunk into a System registration capsule', () => {
    const result = renderCapsule(
        `import { value } from './dependency.js'
export const doubled = value * 2`,
        { fileName: 'assets/root.js' } as Rolldown.RenderedChunk
    )
    const commonJsModule: { exports?: unknown } = {}

    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['./dependency.js'])
    assert.equal(typeof commonJsModule.exports[1], 'function')
    assert.doesNotMatch(result.code, /System\.register/)
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
    assert.deepEqual(commonJsModule.exports[0], ['./bootstrap.js'])
    assert.match(result.code, /_context\.import\(['"]\.\/lazy\.js['"]\)/)
    assert.match(result.code, /VITE_PRELOAD/)
    assert.notEqual(typeof result.map, 'string')
    assert.deepEqual(result.map.sources, ['assets/root.js'])
    assert.ok(result.map.mappings)
})
