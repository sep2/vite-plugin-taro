import assert from 'node:assert/strict'
import test from 'node:test'
import { createVitePluginTaroConditionalDirectivePlugin } from '../src/vite/plugins/conditional-directive-plugin.ts'
import type { VitePluginTaroBuildContext, VitePluginTaroTarget } from '../src/vite/types.ts'

function transform(code: string, target: VitePluginTaroTarget): string {
    const context = {
        target,
        appComponentFile: '',
        pages: [],
        appConfig: {},
        projectConfigJson: {},
        projectPrivateConfigJson: {},
        sitemapJson: {}
    } satisfies VitePluginTaroBuildContext
    const hook = createVitePluginTaroConditionalDirectivePlugin(context).transform
    if (!hook) throw new Error('Expected a transform hook.')
    const handler = typeof hook === 'function' ? hook : hook.handler
    const result = handler.call({} as never, code, 'example.ts')
    if (!result || result instanceof Promise || typeof result === 'string' || !result.code)
        throw new Error('Expected transformed code.')

    return result.code as string
}

test('keeps the active conditional branch and preserves line count', () => {
    const source = `// #ifdef wx
const platform = 'wx'
// #else
const platform = 'h5'
// #endif
`
    const result = transform(source, 'wx')
    assert.match(result, /const platform = 'wx'/)
    assert.doesNotMatch(result, /const platform = 'h5'/)
    assert.equal(result.split('\n').length, source.split('\n').length)
})

test('supports nested ifndef blocks', () => {
    const source = `// #ifdef wx
// #ifndef h5
const enabled = true
// #endif
// #endif
`
    assert.match(transform(source, 'wx'), /const enabled = true/)
    assert.doesNotMatch(transform(source, 'h5'), /const enabled = true/)
})

test('rejects removed expression directives', () => {
    assert.throws(
        () => transform('// #if wx && !h5\nconst enabled = true\n// #endif\n', 'wx'),
        /no longer supports #if/
    )
})
