import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { renderCapsule } from './capsule.ts'

test('converts a final ESM chunk into a System registration capsule', () => {
    const result = renderCapsule(
        `import { value } from './dependency.js'
const doubled = value * 2
export { doubled }`,
        { fileName: 'assets/root.js' } as Rolldown.RenderedChunk,
        true
    )
    const commonJsModule: { exports?: unknown } = {}

    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['dependency.js'])
    assert.equal(typeof commonJsModule.exports[1], 'function')
    assert.doesNotMatch(result.code, /System\.register/)
})

test('canonicalizes physical asset references as package-neutral logical IDs', () => {
    const result = renderCapsule(
        `import { value } from './shared.js'
const load = () => import('./lazy.js')
export { load, value }`,
        { fileName: 'assets/page.js' } as Rolldown.RenderedChunk,
        true
    )
    const commonJsModule: { exports?: unknown } = {}
    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['shared.js'])
    assert.match(result.code, /\b\w+\.import\(['"]lazy\.js['"]\)/)
})

test('preserves package-like dynamic import identities', () => {
    const result = renderCapsule(
        `const load = () => import('external-feature')
export { load }`,
        { fileName: 'assets/root.js' } as Rolldown.RenderedChunk,
        false
    )

    assert.match(result.code, /\.import\(['"]external-feature['"]\)/)
})

test('keeps Vite preload imports while converting dynamic imports', () => {
    const result = renderCapsule(
        `import { __vitePreload } from './bootstrap.js'
const load = () => __vitePreload(() => import('./lazy.js'), __VITE_PRELOAD__)
export { load }`,
        { fileName: 'assets/root.js' } as Rolldown.RenderedChunk,
        true
    )
    const commonJsModule: { exports?: unknown } = {}
    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['bootstrap.js'])
    assert.match(result.code, /\b\w+\.import\(['"]lazy\.js['"]\)/)
    assert.match(result.code, /VITE_PRELOAD/)
    assert.ok(result.map)
    assert.notEqual(typeof result.map, 'string')
    assert.deepEqual(result.map.sources, ['assets/root.js'])
    assert.ok(result.map.mappings)
})
