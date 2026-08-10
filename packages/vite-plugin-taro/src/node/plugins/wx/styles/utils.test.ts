import assert from 'node:assert/strict'
import test from 'node:test'
import { collectOrderedStyleIds, createTailwindSidecarId, extractViteCss, isGlobalStyleRequest } from './utils.ts'

test('creates the stable upstream Tailwind sidecar request', () => {
    assert.equal(createTailwindSidecarId('/project/src/app.css'), '/project/src/app.css?weapp-vite-sidecar=style')
})

test('selects only runtime global style requests', () => {
    assert.equal(isGlobalStyleRequest('/project/src/app.css'), true)
    assert.equal(isGlobalStyleRequest('/project/src/page.module.scss'), true)
    assert.equal(isGlobalStyleRequest('/project/src/app.tsx'), false)
    assert.equal(isGlobalStyleRequest('/project/src/app.css?raw'), false)
    assert.equal(isGlobalStyleRequest('/project/src/app.css?url'), false)
    assert.equal(isGlobalStyleRequest('/project/src/app.css?inline'), false)
    assert.equal(isGlobalStyleRequest('/project/src/app.css?direct'), false)
    assert.equal(isGlobalStyleRequest('/project/src/app.css?weapp-vite-sidecar=style'), false)
})

test('collects current styles in entry and dependency order with shared modules deduplicated', () => {
    // This mutable graph models Rolldown replacing import topology between HMR updates.
    const graph = new Map([
        ['app', { importedIds: ['app.css', 'feature'], dynamicallyImportedIds: ['lazy'] }],
        ['feature', { importedIds: ['feature.css', 'shared.css'], dynamicallyImportedIds: [] }],
        ['lazy', { importedIds: ['shared.css', 'lazy.css'], dynamicallyImportedIds: [] }],
        ['app.css', { importedIds: [], dynamicallyImportedIds: [] }],
        ['feature.css', { importedIds: [], dynamicallyImportedIds: [] }],
        ['shared.css', { importedIds: [], dynamicallyImportedIds: [] }],
        ['lazy.css', { importedIds: [], dynamicallyImportedIds: [] }]
    ])

    assert.deepEqual(
        collectOrderedStyleIds(
            ['app'],
            (moduleId) => graph.get(moduleId) ?? null,
            (moduleId) => (moduleId.endsWith('.css') ? moduleId : undefined)
        ),
        ['app.css', 'feature.css', 'shared.css', 'lazy.css']
    )

    graph.set('app', { importedIds: ['app.css'], dynamicallyImportedIds: [] })
    assert.deepEqual(
        collectOrderedStyleIds(
            ['app'],
            (moduleId) => graph.get(moduleId) ?? null,
            (moduleId) => (moduleId.endsWith('.css') ? moduleId : undefined)
        ),
        ['app.css']
    )
})

test('extracts and decodes Vite development CSS', () => {
    const css = '.generated { content: "\\n"; }\n.next {}'
    const moduleCode = `import '/@vite/client'\nconst __vite__css = ${JSON.stringify(css)}\nexport default __vite__css`

    assert.equal(extractViteCss(moduleCode, '/project/src/app.css'), css)
})

test('rejects a transformed module without Vite CSS', () => {
    assert.throws(
        () => extractViteCss('export default undefined', '/project/src/app.css'),
        /app\.css did not expose __vite__css/
    )
})
