import assert from 'node:assert/strict'
import test from 'node:test'
import { composeGraphStyleCss, createTailwindSidecarId, extractViteCss, isGlobalStyleRequest } from './utils.ts'

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

test('composes current graph styles in dependency order with shared modules deduplicated', () => {
    // This mutable graph models Rolldown replacing import topology between HMR updates.
    const graph = new Map([
        ['app', { importedIds: ['app.css', 'feature'], dynamicallyImportedIds: ['lazy'] }],
        ['feature', { importedIds: ['feature.css', 'shared.css?graph'], dynamicallyImportedIds: [] }],
        ['lazy', { importedIds: ['shared.css?graph', 'lazy.css'], dynamicallyImportedIds: [] }],
        ['app.css', { importedIds: [], dynamicallyImportedIds: [] }],
        ['feature.css', { importedIds: [], dynamicallyImportedIds: [] }],
        ['shared.css?graph', { importedIds: [], dynamicallyImportedIds: [] }],
        ['lazy.css', { importedIds: [], dynamicallyImportedIds: [] }]
    ])
    const styleCacheMap: ReadonlyMap<string, string> = new Map([
        ['app.css', '.app {}'],
        ['feature.css', '.feature {}'],
        ['shared.css', '.shared {}'],
        ['lazy.css', '.lazy {}']
    ])

    // Keep CSS storage independent from graph storage, matching the host's two authoritative projections.
    const getStyleCss = (styleId: string) => styleCacheMap.get(styleId)
    assert.equal(
        composeGraphStyleCss(['app'], (moduleId) => graph.get(moduleId) ?? null, getStyleCss),
        '.app {}\n.feature {}\n.shared {}\n.lazy {}'
    )

    graph.set('app', { importedIds: ['app.css'], dynamicallyImportedIds: [] })
    assert.equal(
        composeGraphStyleCss(['app'], (moduleId) => graph.get(moduleId) ?? null, getStyleCss),
        '.app {}'
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
