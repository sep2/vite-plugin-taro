import assert from 'node:assert/strict'
import test from 'node:test'
import { injectDevPageComponent } from './inject-dev-page-component.ts'

const filename = 'capsule/page.ts'
const moduleId = 'src/pages/mirror/index.tsx'

test('resolves a patched Page only in the transformed serve capsule', () => {
    const source = 'const config = createPageConfig(\n    PageComponent,\n    "pages/mirror/index")'
    const result = injectDevPageComponent({ capsuleCode: source, componentId: moduleId, capsuleId: filename })
    assert.match(
        result.code,
        /__rolldown_runtime__\.resolvePageComponent\("src\/pages\/mirror\/index\.tsx", PageComponent\)/
    )
    assert.doesNotMatch(result.code, /vptGlobal|Reflect\.get|import\.meta\.env/)
    assert.ok(result.code.endsWith('"pages/mirror/index")'))
    assert.equal(result.map, null)
})

test('selects the Page component by syntax rather than whitespace or text in comments', () => {
    const source = `
        // createPageConfig(PageComponent, 'not a call')
        const decoy = 'createPageConfig(PageComponent, another string)'
        const unrelated = createPageConfig(OtherComponent)
        const config = createPageConfig /* between callee and arguments */ (
            PageComponent /* after the component */,
            'pages/mirror/index'
        )
    `
    const result = injectDevPageComponent({ capsuleCode: source, componentId: moduleId, capsuleId: filename })
    assert.match(result.code, /createPageConfig\(OtherComponent\)/)
    assert.match(result.code, /PageComponent\) \/\* after the component \*\//)
    assert.match(result.code, /\/\/ createPageConfig\(PageComponent, 'not a call'\)/)
    assert.equal(result.code.split('resolvePageComponent(').length - 1, 1)
})

test('rejects a changed Page capsule contract', () => {
    assert.throws(
        () => injectDevPageComponent({ capsuleCode: 'export default {}', componentId: moduleId, capsuleId: filename }),
        /Expected one Page config component argument, found 0/
    )
    assert.throws(
        () =>
            injectDevPageComponent({
                capsuleCode: 'createPageConfig(PageComponent); createPageConfig ( PageComponent )',
                componentId: moduleId,
                capsuleId: filename
            }),
        /Expected one Page config component argument, found 2/
    )
})
