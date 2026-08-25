import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { packageRequire } from '../../utils/packages.ts'
import { adaptStencilClient } from './create-stencil-client-adapter.ts'

const stencilClientPath = packageRequire.resolve('@stencil/core/internal/client', {
    paths: [packageRequire.resolve('@tarojs/components/package.json')]
})

test('leaves identical insertion code outside the physical Stencil client untouched', async () => {
    const source = await readFile(stencilClientPath, 'utf8')

    assert.equal(await adaptStencilClient(source, '/project/src/client.ts'), undefined)
})

test('leaves a near-miss Stencil insertion contract unchanged', async () => {
    const source = await readFile(stencilClientPath, 'utf8')
    const nearMiss = source.replace(
        "styleContainerNode.insertBefore(styleElm, styleContainerNode.querySelector('link'))",
        "styleContainerNode.insertBefore(styleElm, styleContainerNode.querySelector('style'))"
    )
    assert.notEqual(nearMiss, source)

    const missingSelector = source.replace(
        "styleContainerNode.insertBefore(styleElm, styleContainerNode.querySelector('link'))",
        'styleContainerNode.insertBefore(styleElm, styleContainerNode.querySelector())'
    )
    const transformed = await adaptStencilClient(nearMiss, stencilClientPath)
    const missingSelectorResult = await adaptStencilClient(missingSelector, stencilClientPath)

    assert.ok(transformed)
    assert.ok(missingSelectorResult)
    assert.doesNotMatch(transformed.code, /scopeId\.startsWith\("sc-taro-"\)/)
    assert.doesNotMatch(missingSelectorResult.code, /scopeId\.startsWith\("sc-taro-"\)/)
})

test('ignores insertion calls that use a different style value', async () => {
    const source = "styleContainerNode.insertBefore(otherStyle, styleContainerNode.querySelector('link'))"
    const transformed = await adaptStencilClient(source, stencilClientPath)

    assert.ok(transformed)
    assert.equal(transformed.code, source)
})

test('rejects malformed physical Stencil source before walking it', () => {
    assert.throws(() => adaptStencilClient('const =', stencilClientPath), /Failed to parse .* with Oxc/)
})

test('adapts Stencil component style insertion', async () => {
    const source = await readFile(stencilClientPath, 'utf8')
    const transformed = await adaptStencilClient(source, stencilClientPath)

    assert.ok(transformed)
    assert.ok(transformed.map)
    assert.deepEqual(transformed.map.sources, [stencilClientPath])
    assert.deepEqual(transformed.map.sourcesContent, [source])
    assert.match(transformed.code, /scopeId\.startsWith\("sc-taro-"\)/)
    assert.match(transformed.code, /querySelector\("style,link\[rel=\\"stylesheet\\"\]"\)/)
})
