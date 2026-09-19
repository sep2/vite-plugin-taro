import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { build } from 'rolldown'
import { resolveRuntimeFile } from '../../../utils/packages.ts'
import { vptGlobalBindingId } from '../module/module.ts'
import { createMiniGlobalPlugin } from './create-mini-global-plugin.ts'

const plugin = createMiniGlobalPlugin({
    getPhysicalChunkId(chunk) {
        assert.ok(typeof chunk !== 'string')
        return chunk.fileName
    }
})

test('virtual hooks match only the private binding and leave the real provider untouched', () => {
    assert.equal(plugin.name, 'vpt:mini-global')
    for (const hook of [plugin.resolveId, plugin.load]) {
        assert.ok(hook && typeof hook === 'object')
        const filter = hook.filter
        assert.ok(filter && !Array.isArray(filter) && filter.id instanceof RegExp)
        assert.equal(filter.id.test(vptGlobalBindingId), true)
        assert.equal(filter.id.test(`${vptGlobalBindingId}?import`), true)
        assert.equal(filter.id.test(`${vptGlobalBindingId}-other`), false)
        assert.equal(filter.id.test(resolveRuntimeFile('global/vpt-global')), false)
    }
})

test('the virtual binding exports the exact provider object without probing or augmenting it', async () => {
    const provider = Object.freeze({ marker: 'shared global' })
    const result = await build({
        input: vptGlobalBindingId,
        // Isolate virtual loading here; the output tests below exercise rendering and standalone emission too.
        plugins: [{ name: plugin.name, resolveId: plugin.resolveId, load: plugin.load }],
        transform: { define: { __VPT_GLOBAL__: 'globalThis.provider' } },
        output: { format: 'cjs' },
        write: false
    })
    assert.equal(result.output.length, 1)
    const chunk = result.output[0]
    assert.ok(chunk.type === 'chunk')
    assert.deepEqual(chunk.moduleIds, [vptGlobalBindingId])
    assert.deepEqual(chunk.imports, [])
    const context = createContext({ provider, exports: {} }, { codeGeneration: { strings: false, wasm: false } })
    runInContext(chunk.code, context)
    assert.deepEqual(Object.keys(context.exports), ['vptGlobal'])
    assert.strictEqual(context.exports.vptGlobal, provider)
})

for (const minify of [false, true]) {
    for (const sourcemap of [false, true, 'inline', 'hidden'] as const) {
        test(`standalone output respects minification ${minify} and source maps ${sourcemap}`, async () => {
            const result = await build({
                input: vptGlobalBindingId,
                plugins: [
                    {
                        name: plugin.name,
                        resolveId: plugin.resolveId,
                        load: plugin.load,
                        renderChunk: plugin.renderChunk,
                        generateBundle: plugin.generateBundle
                    }
                ],
                output: {
                    dir: path.resolve('/fixture/output'),
                    format: 'cjs',
                    entryFileNames: 'nested/[name]-[hash].js',
                    minify,
                    sourcemap
                },
                write: false
            })
            const binding = result.output.find(
                (chunk) => chunk.type === 'chunk' && chunk.facadeModuleId === vptGlobalBindingId
            )
            const provider = result.output.find((chunk) => chunk.fileName === 'common/vpt-global.js')
            assert.ok(binding?.type === 'chunk' && provider?.type === 'chunk')
            assert.equal(provider.fileName, 'common/vpt-global.js')
            assert.deepEqual(provider.imports, [])
            assert.deepEqual(provider.moduleIds, [])
            assert.match(provider.code, /^["']use strict["']/)
            assert.doesNotMatch(provider.code, /require\(|__rolldown_runtime__|__VPT_GLOBAL__/)
            assert.doesNotMatch(binding.code, /__VPT_GLOBAL__|vpt\.fake\.global/)
            assert.match(binding.code, /\.\.\/common\/vpt-global\.js/)
            const context = createContext({}, { codeGeneration: { strings: false, wasm: false } })
            const globalExports: unknown = runInContext(
                `(function(exports) {\n${provider.code}\nreturn exports; })({})`,
                context
            )
            context.require = (request: string) => {
                assert.equal(path.posix.join(path.posix.dirname(binding.fileName), request), provider.fileName)
                return globalExports
            }
            context.exports = {}
            runInContext(`(function(exports, require) {\n${binding.code}\n})(exports, require)`, context)
            assert.equal(runInContext('exports.vptGlobal === globalThis', context), true)

            // The standalone export wrapper must preserve discovery's string-key fallback before any polyfills exist.
            // Diagnostics belong only to this restricted heap and distinguish failure recovery from native probing.
            const diagnostics: unknown[][] = []
            const restricted = createContext({ console: { error: (...args: unknown[]) => diagnostics.push(args) } })
            runInContext('delete this.globalThis; delete this.Symbol; Object.freeze(Object.prototype);', restricted)
            runInContext(`(function(exports) {\n${provider.code}\n})({})`, restricted)
            assert.equal(diagnostics.length, 1)
            assert.equal(
                runInContext('Object["vpt.fake.global"].globalThis === Object["vpt.fake.global"]', restricted),
                true
            )
            assert.equal(runInContext('typeof globalThis', restricted), 'undefined')

            const map = result.output.find((output) => output.fileName === 'common/vpt-global.js.map')
            if (sourcemap === false || sourcemap === 'inline') {
                assert.equal(map, undefined)
            } else {
                assert.ok(map?.type === 'asset')
                const parsed: { mappings: string; sources: string[]; sourcesContent: string[] } = JSON.parse(
                    String(map.source)
                )
                assert.ok(parsed.mappings.length > 0)
                assert.ok(parsed.sources.some((source) => source.endsWith('/global/vpt-global.ts')))
                assert.ok(parsed.sourcesContent.some((source) => source.includes('typeof globalThis')))
            }
            if (sourcemap === 'inline') {
                assert.match(provider.code, /sourceMappingURL=data:application\/json;.*base64,/)
            } else if (sourcemap === true) {
                assert.match(provider.code, /sourceMappingURL=vpt-global\.js\.map/)
            } else {
                assert.doesNotMatch(provider.code, /sourceMappingURL=/)
            }
        })
    }
}
