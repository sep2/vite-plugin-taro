import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { build } from 'rolldown'
import { normalizePath } from 'vite'
import { packageRequire } from '../../utils/packages.ts'
import { wrapPluginTransform } from '../../utils/vite.ts'
import { adaptStencilClient, createStencilClientAdapter } from './create-stencil-client-adapter.ts'

const runtimeRequire = createRequire(packageRequire.resolve('vite-plugin-taro-runtime/components'))
const stencilClientPath = runtimeRequire.resolve('@stencil/core/internal/client')

test('native filtering dispatches only exact and query-suffixed Stencil client IDs', async () => {
    const clientId = normalizePath(stencilClientPath)
    const eligibleIds = new Set([clientId, `${clientId}?v=1`, `${clientId}?import&v=2`])
    const sourceIds = new Set([
        ...eligibleIds,
        `${clientId}.backup.js`,
        `${clientId}/nested.js`,
        `/fixture${clientId}`,
        '/fixture/client.js',
        `/fixture/client.js?original=${clientId}`
    ])
    const source = `export function insertStyle(styleContainerNode, styleElm, scopeId) {
        styleContainerNode.insertBefore(styleElm, styleContainerNode.querySelector('link'))
    }`
    const plugin = createStencilClientAdapter()
    // This journal counts actual JS dispatches; the wrapper preserves the native hook filter.
    const calls: string[] = []
    wrapPluginTransform(
        plugin,
        (transform) =>
            function (code, id, options) {
                calls.push(id)
                return transform.call(this, code, id, options)
            }
    )
    const result = await build({
        input: Array.from(sourceIds),
        plugins: [
            {
                name: 'test:stencil-client-sources',
                resolveId: (id) => (sourceIds.has(id) ? id : undefined),
                load: (id) => (sourceIds.has(id) ? source : undefined)
            },
            plugin
        ],
        output: { format: 'es' },
        write: false
    })

    assert.deepEqual(calls.toSorted(), Array.from(eligibleIds).toSorted())
    const entries = result.output.filter((chunk) => chunk.type === 'chunk' && chunk.isEntry)
    assert.equal(entries.length, sourceIds.size)
    for (const chunk of entries) {
        assert.ok(chunk.type === 'chunk' && chunk.facadeModuleId)
        assert.equal(chunk.code.includes('sc-taro-'), eligibleIds.has(chunk.facadeModuleId), chunk.facadeModuleId)
    }
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
