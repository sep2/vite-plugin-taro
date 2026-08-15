import assert from 'node:assert/strict'
import test from 'node:test'
import { composeGraphStyleCss, createGraphStylePlan, extractViteCss, isGlobalStyleRequest } from './utils.ts'

test('selects only runtime global style requests', () => {
    assert.equal(isGlobalStyleRequest('/project/src/app.css'), true)
    assert.equal(isGlobalStyleRequest('/project/src/page.module.scss'), true)
    assert.equal(isGlobalStyleRequest('/project/src/app.tsx'), false)
    assert.equal(isGlobalStyleRequest('/project/src/app.css?raw'), false)
    assert.equal(isGlobalStyleRequest('/project/src/app.css?url'), false)
    assert.equal(isGlobalStyleRequest('/project/src/app.css?inline'), false)
    assert.equal(isGlobalStyleRequest('/project/src/app.css?direct'), false)
})

test('plans graph styles once in dependency order with shared modules deduplicated', () => {
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

    // Keep CSS storage independent from graph storage, matching the host's two authoritative projections. This mutable
    // counter proves rendering consumes the immutable plan without returning to the graph reader.
    let moduleReads = 0
    const createPlan = () =>
        createGraphStylePlan(
            ['app'],
            (moduleId) => {
                moduleReads += 1
                return graph.get(moduleId) ?? null
            },
            (styleId) => styleCacheMap.has(styleId)
        )
    const initialPlan = createPlan()
    assert.deepEqual(initialPlan, ['app.css', 'feature.css', 'shared.css', 'lazy.css'])
    assert.equal(
        composeGraphStyleCss(initialPlan, (styleId) => requireStyleCss(styleCacheMap, styleId)),
        '.app {}\n.feature {}\n.shared {}\n.lazy {}'
    )
    assert.equal(moduleReads, 7)

    graph.set('app', { importedIds: ['app.css'], dynamicallyImportedIds: [] })
    moduleReads = 0
    const updatedPlan = createPlan()
    assert.deepEqual(updatedPlan, ['app.css'])
    assert.equal(
        composeGraphStyleCss(updatedPlan, (styleId) => requireStyleCss(styleCacheMap, styleId)),
        '.app {}'
    )
    assert.equal(moduleReads, 2)
})

function requireStyleCss(styles: ReadonlyMap<string, string>, styleId: string): string {
    const css = styles.get(styleId)
    if (css === undefined) {
        throw new Error(`Expected captured style: ${styleId}`)
    }
    return css
}

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
