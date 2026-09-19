import assert from 'node:assert/strict'
import test from 'node:test'
import { hooks } from '@tarojs/shared'
import './taro-runtime.ts'

test('declares the independent Page property without mutating stock recursive component configuration', () => {
    const config = {
        properties: { i: { type: Object }, l: { type: String } },
        options: { virtualHost: true },
        methods: { eh: () => {} }
    }
    // Taro 4.2.1 incorrectly types this hook's native component config as its unrelated MiniLifecycle descriptor.
    const result = Reflect.apply(hooks.call, hooks, [
        'modifyRecursiveComponentConfig',
        config,
        { isCustomWrapper: false }
    ])
    assert.deepEqual(result, {
        ...config,
        properties: { ...config.properties, p: { type: Object, value: { cn: [] } } }
    })
    assert.notStrictEqual(result, config)
    assert.equal('p' in config.properties, false)
    assert.strictEqual(result.methods, config.methods)
    assert.strictEqual(result.options, config.options)
    const customWrapper = Reflect.apply(hooks.call, hooks, [
        'modifyRecursiveComponentConfig',
        config,
        { isCustomWrapper: true }
    ])
    assert.deepEqual(customWrapper.properties.p, result.properties.p)
})
