import assert from 'node:assert/strict'
import test from 'node:test'
import { createTailwindSidecarId, extractViteCss, isGlobalStyleRequest } from './utils.ts'

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
