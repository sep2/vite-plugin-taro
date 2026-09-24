import assert from 'node:assert/strict'
import test from 'node:test'
import { injectDevPageComponent } from './inject-dev-page-component.ts'

test('resolves a patched Page only in the transformed serve capsule', () => {
    const source = 'const config = createPageConfig(\n    PageComponent,\n    "pages/mirror/index")'
    const code = injectDevPageComponent(source, 'pages/mirror/index')
    assert.match(code, /import \{ vptGlobal \} from/)
    assert.match(code, /resolvePageComponent\("src\/pages\/mirror\/index\.tsx", PageComponent\)/)
    assert.doesNotMatch(code, /import\.meta\.env/)
    assert.ok(code.endsWith('"pages/mirror/index")'))
})

test('rejects a changed Page capsule contract', () => {
    const input = 'createPageConfig(\n    PageComponent,'
    assert.throws(
        () => injectDevPageComponent('export default {}', 'pages/mirror/index'),
        /Expected one Page config component argument, found 0/
    )
    assert.throws(
        () => injectDevPageComponent(`${input}; ${input}`, 'pages/mirror/index'),
        /Expected one Page config component argument, found 2/
    )
})
