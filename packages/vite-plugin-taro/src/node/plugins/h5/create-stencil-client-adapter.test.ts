import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { packageRequire } from '../../utils/packages.ts'
import { adaptStencilClient } from './create-stencil-client-adapter.ts'

const stencilClientPath = packageRequire.resolve('@stencil/core/internal/client', {
    paths: [packageRequire.resolve('@tarojs/components/package.json')]
})

test('adapts Stencil component style insertion', async () => {
    const source = await readFile(stencilClientPath, 'utf8')
    const transformed = await adaptStencilClient(source, stencilClientPath)

    assert.ok(transformed)
    assert.match(transformed.code, /scopeId\.startsWith\("sc-taro-"\)/)
    assert.match(transformed.code, /querySelector\("style,link\[rel=\\"stylesheet\\"\]"\)/)
})
