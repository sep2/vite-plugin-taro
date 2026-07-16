import assert from 'node:assert/strict'
import test from 'node:test'
import { postRenderChunk } from './post-render-chunk.ts'

test('converts a final ESM chunk into a System registration capsule', () => {
    const result = postRenderChunk(
        `import { value } from './dependency.js'
export const doubled = value * 2`,
        { fileName: 'assets/root.js' }
    )
    const commonJsModule: { exports?: unknown } = {}

    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['./dependency.js'])
    assert.equal(typeof commonJsModule.exports[1], 'function')
    assert.doesNotMatch(result.code, /System\.register/)
})

test('converts dynamic imports and generates a source map for the final chunk', () => {
    const result = postRenderChunk(`export const load = () => import('./lazy.js')`, {
        fileName: 'assets/root.js'
    })

    assert.match(result.code, /_context\.import\(['"]\.\/lazy\.js['"]\)/)
    assert.notEqual(typeof result.map, 'string')
    assert.ok(result.map)
    assert.deepEqual(result.map.sources, ['assets/root.js'])
    assert.ok(result.map.mappings)
})
