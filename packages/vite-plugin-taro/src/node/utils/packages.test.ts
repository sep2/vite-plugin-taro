import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { packageRequire, resolveTaroRuntime, resolveVptRuntime } from './packages.ts'

test('resolves exports from the bundled Taro runtime package', () => {
    for (const subpath of ['runtime/mini', 'api']) {
        assert.equal(resolveTaroRuntime(subpath), packageRequire.resolve(`vite-plugin-taro-runtime/${subpath}`))
    }
})

test('resolves VPT runtime files from this package in source or dist', () => {
    const file = resolveVptRuntime('mini/native/app')
    assert.equal(path.isAbsolute(file), true)
    assert.match(file, /\/(?:src|dist)\/runtime\/mini\/native\/app\.(?:ts|js)$/)
    assert.equal(existsSync(file), true)
})
