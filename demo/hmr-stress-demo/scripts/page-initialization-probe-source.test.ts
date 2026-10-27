import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { pageInitializationProbeSource } from './page-initialization-probe-source.ts'

test('native Page registration observes each data-factory result', async () => {
    const source = await readFile(
        new URL('../../../packages/vite-plugin-taro/src/runtime/mini/native/page.ts', import.meta.url),
        'utf8'
    )
    const registration = 'registerPage(pageConfig)'
    assert.equal(source.split(registration).length, 2)
    const data = { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } }
    const pageConfig = {
        data(query: unknown) {
            assert.strictEqual(this, pageConfig)
            assert.equal(query, 'native-query')
            return data
        }
    }
    const registerPage = (config: unknown) => assert.strictEqual(config, pageConfig)
    runInNewContext(pageInitializationProbeSource, { pageConfig, registerPage })
    for (const visit of [1, 2]) {
        const result = pageConfig.data('native-query')
        assert.notStrictEqual(result, data, `Visit ${visit} owns its initialization marker`)
        assert.strictEqual(result.app, data.app)
        assert.strictEqual(result.page, data.page)
        assert.equal(Reflect.get(result, '__hmrDataFactoryRan'), true)
        assert.equal(Object.hasOwn(data, '__hmrDataFactoryRan'), false)
    }
})

test('native Page registration preserves static initial data', () => {
    const data = { app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } }
    const pageConfig = { data }
    const registerPage = (config: unknown) => assert.strictEqual(config, pageConfig)
    runInNewContext(pageInitializationProbeSource, { pageConfig, registerPage })
    assert.strictEqual(pageConfig.data, data)
    assert.equal(Object.hasOwn(data, '__hmrDataFactoryRan'), false)
})
