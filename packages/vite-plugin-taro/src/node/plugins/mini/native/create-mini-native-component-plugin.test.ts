import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build, normalizePath } from 'vite'
import { wrapPluginTransform } from '../../../utils/vite.ts'
import { clientTaroNativeId } from '../../client/constant.ts'
import { createMiniNativeComponentPlugin } from './create-mini-native-component-plugin.ts'
import { getNativeComponentSources } from './native-component-assets.ts'

// Reuse the demo's tiny native folder as read-only opaque assets; interface sources and all build output stay in memory.
const nativeFolder = normalizePath(
    fileURLToPath(new URL('../../../../../../../demo/native-comp-demo/src/native/wx/native-counter/', import.meta.url))
).replace(/\/$/, '')
const interfaceId = `${nativeFolder}/filter-fixture.tsx`
const interfaceSource = `
import { defineNativeComponent as defineNative } from '${clientTaroNativeId}'
interface CounterProps {
    count: number
    label?: string
    onIncrement?: (event: { detail: { value: number } }) => void
    children?: unknown
}
export const NativeCounter = defineNative<CounterProps>(() => import('./counter.js'))
`

for (const sourcemap of [false, true]) {
    test(`native macro filtering runs before TypeScript erasure with sourcemap ${sourcemap}`, async (context) => {
        const nativeIds = new Set([interfaceId, `${interfaceId}?v=1`])
        const markerId = '/fixture/marker.ts'
        const sources: ReadonlyMap<string, string> = new Map([
            ...Array.from(nativeIds, (id) => [id, interfaceSource] as const),
            [markerId, `export const marker = ${JSON.stringify(clientTaroNativeId)}`],
            ['/fixture/plain.ts', 'export const plain: number = 1'],
            ['/fixture/other.ts', "export const other = 'defineNativeComponent'"]
        ])
        const plugin = createMiniNativeComponentPlugin()
        assert.ok(plugin.transform && typeof plugin.transform === 'object')
        assert.equal(plugin.transform.order, 'pre')
        // This journal records real filtered dispatches without replacing the compiler or its watch-file callback.
        const calls: string[] = []
        // Rolldown has no getWatchFiles API; record this plugin's calls while still forwarding to the real context.
        const watched = new Set<string>()
        wrapPluginTransform(
            plugin,
            (transform) =>
                async function (code, id, options) {
                    calls.push(id)
                    const watch = context.mock.method(this, 'addWatchFile')
                    const result = await transform.call(this, code, id, options)
                    watch.mock.restore()
                    for (const {
                        arguments: [file]
                    } of watch.mock.calls) {
                        watched.add(file)
                    }
                    assert.ok(result && typeof result === 'object')
                    assert.equal(Boolean(result.map), sourcemap)
                    if (sourcemap) {
                        assert.ok(result.map && typeof result.map === 'object')
                        assert.deepEqual(result.map.sourcesContent, [code])
                    }
                    return result
                }
        )
        const result = await build({
            configFile: false,
            logLevel: 'silent',
            plugins: [
                {
                    name: 'test:native-interface-sources',
                    resolveId: (id) => (sources.has(id) ? id : undefined),
                    load: (id) => sources.get(id),
                    generateBundle() {
                        for (const id of nativeIds) {
                            const info = this.getModuleInfo(id)
                            assert.ok(info)
                            const nativeSources = getNativeComponentSources(info.meta)
                            assert.equal(nativeSources.length, 1)
                            const [native] = nativeSources
                            assert.ok(native)
                            assert.equal(native.folder, nativeFolder)
                            assert.equal(native.entry, 'counter')
                            assert.deepEqual(native.fields, ['count', 'label', 'onIncrement'])
                            assert.ok(native.assets.length > 0)
                            assert.ok(watched.has(native.folder))
                            for (const asset of native.assets) {
                                assert.ok(watched.has(normalizePath(path.join(native.folder, asset.relativePath))))
                            }
                        }
                    }
                },
                plugin
            ],
            build: {
                write: false,
                minify: false,
                sourcemap,
                rolldownOptions: { input: Array.from(sources.keys()), preserveEntrySignatures: 'strict' }
            }
        })

        assert.deepEqual(calls.toSorted(), [...nativeIds, markerId].toSorted())
        assert.ok(!Array.isArray(result) && 'output' in result)
        const entries = result.output.filter((chunk) => chunk.type === 'chunk' && chunk.isEntry)
        assert.equal(entries.length, sources.size)
        for (const chunk of entries) {
            assert.ok(chunk.type === 'chunk' && chunk.facadeModuleId)
            if (nativeIds.has(chunk.facadeModuleId)) {
                assert.ok(chunk.code.includes('native-counter'))
                assert.doesNotMatch(chunk.code, /defineNative|CounterProps/)
            }
        }
    })
}
