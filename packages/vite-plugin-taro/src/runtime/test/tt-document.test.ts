import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { resolveConfig } from 'vite'
import vpt from '../../index.ts'

const require = createRequire(import.meta.url)

for (const renderer of ['template', 'dom'] as const) {
    for (const mode of ['development', 'production'] as const) {
        test(`TT ${renderer} (${mode}): render mode 2 retains logical Taro nodes`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    mode,
                    plugins: vpt({
                        target: 'tt',
                        renderer,
                        app: 'src/app.tsx',
                        pages: [],
                        appJson: { enableTTDom: true },
                        projectConfigJson: {}
                    })
                },
                mode === 'development' ? 'serve' : 'build'
            )
            const entry = 'test:tt-logical-document'
            const result = await build({
                input: entry,
                platform: 'node',
                plugins: [
                    {
                        name: entry,
                        resolveId: (id) => (id === entry ? entry : undefined),
                        load: (id) => (id === entry ? fixture : undefined)
                    }
                ],
                transform: { define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify(mode) } },
                output: { format: 'cjs' },
                write: false
            })
            const chunk = result.output[0]
            assert.ok(chunk?.type === 'chunk')

            // The host advertises native DOM capability; logical initialization must leave its document untouched.
            const nativeDocument = Object.freeze({
                createElement() {
                    assert.fail('Logical node creation must use the Taro document')
                },
                createTextNode() {
                    assert.fail('Logical text creation must use the Taro document')
                }
            })
            const tt = Object.freeze({
                __$enableTTDom$__: true,
                getRenderMode: () => 2,
                appDocument: nativeDocument
            })
            runInNewContext(chunk.code, {
                exports: {},
                require,
                global: {},
                tt,
                setTimeout() {
                    assert.fail('Detached node creation must be synchronous')
                }
            })
            assert.equal(tt.__$enableTTDom$__, true, 'build-time selection preserves the native host flag')
            assert.strictEqual(tt.appDocument, nativeDocument)
        })
    }
}

const fixture = `
import assert from 'node:assert/strict'
import { isEnableTTDom } from '@tarojs/shared'
import { document, FormElement, TaroElement, TaroRootElement, TaroText } from 'vite-plugin-taro-runtime/runtime/mini'

assert.equal(tt.getRenderMode(), 2)
assert.equal(isEnableTTDom(), false)
assert.notStrictEqual(document, tt.appDocument)
assert.ok(document.getElementById('app') instanceof TaroRootElement)
assert.ok(document.createElement('root') instanceof TaroRootElement)
assert.ok(document.createElement('view') instanceof TaroElement)
assert.ok(document.createElement('input') instanceof FormElement)
assert.ok(document.createElement('textarea') instanceof FormElement)
const text = document.createTextNode('logical text')
assert.ok(text instanceof TaroText)
assert.equal(text.nodeValue, 'logical text')
`
