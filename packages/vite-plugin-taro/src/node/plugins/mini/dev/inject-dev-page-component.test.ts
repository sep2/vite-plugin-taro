import assert from 'node:assert/strict'
import test from 'node:test'
import { injectDevPageComponent } from './inject-dev-page-component.ts'

const filename = 'capsule/page.ts'
const moduleId = 'src/pages/mirror/index.tsx'

test('resolves a patched Page only in the transformed serve capsule', () => {
    const source = 'const config = createVptPageConfig(\n    PageComponent,\n    { path: "pages/mirror/index" })'
    const result = injectDevPageComponent({ capsuleCode: source, componentId: moduleId, capsuleId: filename })
    assert.match(
        result.code,
        /__rolldown_runtime__\.resolvePageComponent\("src\/pages\/mirror\/index\.tsx", PageComponent\)/
    )
    assert.doesNotMatch(result.code, /vptGlobal|Reflect\.get|import\.meta\.env/)
    assert.match(result.code, /"pages\/mirror\/index" \}\)\nimport\.meta\.hot\.accept\(\)\n$/)
    assert.equal(result.map, null)
})

test('selects the Page component by syntax rather than whitespace or text in comments', () => {
    const source = `
        // createVptPageConfig(PageComponent, 'not a call')
        const decoy = 'createVptPageConfig(PageComponent, another string)'
        const unrelated = createVptPageConfig(OtherComponent)
        const upstream = createPageConfig(PageComponent, 'pages/upstream/index')
        const config = createVptPageConfig /* between callee and arguments */ (
            PageComponent /* after the component */,
            { path: 'pages/mirror/index' }
        )
    `
    const result = injectDevPageComponent({ capsuleCode: source, componentId: moduleId, capsuleId: filename })
    assert.match(result.code, /createVptPageConfig\(OtherComponent\)/)
    assert.match(result.code, /createPageConfig\(PageComponent, 'pages\/upstream\/index'\)/)
    assert.match(result.code, /PageComponent\) \/\* after the component \*\//)
    assert.match(result.code, /\/\/ createVptPageConfig\(PageComponent, 'not a call'\)/)
    assert.equal(result.code.split('resolvePageComponent(').length - 1, 1)
    assert.equal(result.code.split('import.meta.hot.accept()').length - 1, 1)
})

test('rejects a changed Page capsule contract', () => {
    assert.throws(
        () => injectDevPageComponent({ capsuleCode: 'export default {}', componentId: moduleId, capsuleId: filename }),
        /Expected one Page config component argument, found 0/
    )
    assert.throws(
        () =>
            injectDevPageComponent({
                capsuleCode: 'createVptPageConfig(PageComponent); createVptPageConfig ( PageComponent )',
                componentId: moduleId,
                capsuleId: filename
            }),
        /Expected one Page config component argument, found 2/
    )
})
