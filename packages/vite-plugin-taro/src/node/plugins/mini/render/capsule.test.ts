import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { renderCapsule } from './capsule.ts'

test('converts a final ESM chunk into a System registration capsule', () => {
    const result = renderCapsule({
        code: `import { value } from './dependency.js'
const doubled = value * 2
export { doubled }`,
        chunk: { fileName: 'assets/root.js' } as Rolldown.RenderedChunk,
        removeRefreshPreambleGuard: false,
        sourcemap: true
    })
    const commonJsModule: { exports?: unknown } = {}

    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['dependency.js'])
    assert.equal(typeof commonJsModule.exports[1], 'function')
    assert.doesNotMatch(result.code, /System\.register/)
})

test('removes only the generated React Refresh preamble assertion when requested', () => {
    const code = `
        if (!window.$RefreshReg$) {
            throw new Error("@vitejs/plugin-react can't detect preamble. Something is wrong.")
        }
        if (!window.$RefreshReg$) throw new Error('application invariant')
        const rendered = true
        export { rendered }
    `
    const chunk = { fileName: 'assets/root.js' } as Rolldown.RenderedChunk
    const development = renderCapsule({ code, chunk, removeRefreshPreambleGuard: true, sourcemap: false })
    const production = renderCapsule({ code, chunk, removeRefreshPreambleGuard: false, sourcemap: false })

    assert.doesNotMatch(development.code, /can't detect preamble/)
    assert.match(development.code, /application invariant/)
    assert.match(production.code, /can't detect preamble/)
})

test('canonicalizes physical asset references as package-neutral logical IDs', () => {
    const result = renderCapsule({
        code: `import { value } from './shared.js'
const load = () => import('./lazy.js')
export { load, value }`,
        chunk: { fileName: 'assets/page.js' } as Rolldown.RenderedChunk,
        removeRefreshPreambleGuard: false,
        sourcemap: true
    })
    const commonJsModule: { exports?: unknown } = {}
    Function('module', result.code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['shared.js'])
    assert.match(result.code, /\b\w+\.import\(['"]lazy\.js['"]\)/)
})

test('preserves package-like dynamic import identities', () => {
    const result = renderCapsule({
        code: `const load = () => import('external-feature')
export { load }`,
        chunk: { fileName: 'assets/root.js' } as Rolldown.RenderedChunk,
        removeRefreshPreambleGuard: false,
        sourcemap: false
    })

    assert.match(result.code, /\.import\(['"]external-feature['"]\)/)
})

test('keeps Vite preload imports while converting dynamic imports', () => {
    const result = renderCapsule({
        code: `import { __vitePreload } from './bootstrap.js'
const load = () => __vitePreload(() => import('./lazy.js'), __VITE_PRELOAD__)
export { load }`,
        chunk: { fileName: 'assets/root.js' } as Rolldown.RenderedChunk,
        removeRefreshPreambleGuard: false,
        sourcemap: true
    })
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
