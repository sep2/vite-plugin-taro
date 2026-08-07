import assert from 'node:assert/strict'
import test from 'node:test'
import { injectTaroFrameworkApis } from './inject-taro-framework-apis.ts'

test('injects framework lifecycle hooks into the Taro facade', () => {
    const transformed = injectTaroFrameworkApis('const taro = {}\nexport default taro')

    assert.match(transformed, /taro\.useLaunch = useLaunch/)
    assert.match(transformed, /useDidShow/)
    assert.match(transformed, /export \{/)
})
