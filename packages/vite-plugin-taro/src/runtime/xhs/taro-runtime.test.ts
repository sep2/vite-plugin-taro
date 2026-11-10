import assert from 'node:assert/strict'
import test from 'node:test'
import { hooks } from '@tarojs/shared'
import './taro-runtime.ts'

test('declares both XHS recursive component Page properties without changing existing config', () => {
    const config = {
        properties: { i: { type: Object } },
        options: { virtualHost: true },
        methods: { eh: () => {} }
    }
    for (const isCustomWrapper of [false, true]) {
        // Taro declares the native-config hook using its unrelated MiniLifecycle type.
        const result = Reflect.apply(hooks.call, hooks, ['modifyRecursiveComponentConfig', config, { isCustomWrapper }])
        assert.deepEqual(result, {
            ...config,
            properties: { ...config.properties, p: { type: Object, value: { cn: [] } } }
        })
        assert.strictEqual(result.methods, config.methods)
        assert.strictEqual(result.options, config.options)
        assert.equal('p' in config.properties, false)
    }
})

test('uses XHS numeric setData indices and retains its sharing lifecycle hooks', () => {
    assert.equal(hooks.call('getPathIndex', 12), '12')
    const lifecycle = hooks.call('getMiniLifecycleImpl')
    assert.ok(lifecycle)
    assert.ok(lifecycle.page[5].includes('onShareChat'))
    assert.ok(lifecycle.page[5].includes('onCopyUrl'))
})
