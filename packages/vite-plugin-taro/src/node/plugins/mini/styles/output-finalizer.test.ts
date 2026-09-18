import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test, { type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { type BuildOptions, normalizePath, type Plugin } from 'vite'
import type { createMiniTransformer } from './create-mini-transformer.ts'

const contract = { styles: { appFileName: 'app.wxss', globalFileName: 'assets/global.wxss' } }
const root = normalizePath(fileURLToPath(new URL('.', import.meta.url)))
const { createMiniStylePlugin, transformers } = await importObservedPlugin()

/** Observe real transformer instances at their module boundary, without adding a production injection API. */
async function importObservedPlugin() {
    const pluginUrl = new URL('./plugins.ts', import.meta.url).href
    const transformerUrl = new URL('./create-mini-transformer.ts', import.meta.url).href
    // This test-only journal exposes created instances so node:test can observe calls and inject one-shot failures.
    const observerUrl = `data:text/javascript,${encodeURIComponent(`
        import { createMiniTransformer as create } from ${JSON.stringify(transformerUrl)}
        export const transformers = []
        export function createMiniTransformer() {
            const transformer = create()
            transformers.push(transformer)
            return transformer
        }
    `)}`
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (specifier === './create-mini-transformer.ts' && context.parentURL === pluginUrl) {
                return { url: observerUrl, shortCircuit: true }
            }
            return nextResolve(specifier, context)
        }
    })
    try {
        const plugin: typeof import('./plugins.ts') = await import(pluginUrl)
        const observer: { transformers: ReturnType<typeof createMiniTransformer>[] } = await import(observerUrl)
        return { createMiniStylePlugin: plugin.createMiniStylePlugin, transformers: observer.transformers }
    } finally {
        hooks.deregister()
    }
}

/** Drive the real plugin hooks with an in-memory Rolldown graph, Vite CSS boundary, and stylesheet writer. */
async function createStyleFixture(
    testContext: TestContext,
    cssMinify: BuildOptions['cssMinify'],
    entries: readonly string[]
) {
    const plugin = createMiniStylePlugin(contract, entries)
    const cssPost: Plugin = { name: 'vite:css-post', transform: (code) => ({ code, map: null }) }
    const config = plugin.config
    const configResolved = plugin.configResolved
    const buildStart = plugin.buildStart
    const transform = plugin.transform
    assert.ok(config && typeof config === 'object')
    assert.ok(typeof configResolved === 'function' && typeof buildStart === 'function')
    assert.ok(transform && typeof transform === 'object')
    await Reflect.apply(config.handler, {}, [{ build: { cssMinify } }])
    await Reflect.apply(configResolved, {}, [{ build: { minify: false }, plugins: [cssPost] }])
    const transformer = transformers.at(-1)!
    const css = testContext.mock.method(transformer, 'transformStylesheet')
    const javaScript = testContext.mock.method(transformer, 'transformJavaScript')
    const capture = cssPost.transform
    assert.ok(typeof capture === 'function')

    // Tests mutate only the compiler-owned graph; retained CSS must never override its current reachability or order.
    const graph = new Map<
        string,
        Readonly<{ importedIds: readonly string[]; dynamicallyImportedIds: readonly string[] }>
    >([
        ['/app.js', { importedIds: ['/app.css'], dynamicallyImportedIds: [] }],
        ['/app.css', { importedIds: [], dynamicallyImportedIds: [] }]
    ])
    const context = {
        environment: { config: { root } },
        resolve: async (id: string) => ({ id }),
        getModuleInfo(id: string) {
            assert.equal(this, context, 'Graph reads must retain their plugin context')
            return graph.get(id)
        },
        addWatchFile() {}
    }
    await Reflect.apply(buildStart, context, [])
    // Capture publication in memory; these tests never create source fixtures, output files, or watchers.
    const published: string[] = []
    const publish = async (stylesheet: string) => {
        published.push(stylesheet)
    }
    return {
        plugin,
        context,
        graph,
        css,
        javaScript,
        published,
        publish,
        update: (code: string) => plugin.finalizeUpdate([{ code, filename: 'app.js', seq: 1 }], publish),
        async capture(id: string, source: string) {
            await Reflect.apply(capture, context, [source, id])
        },
        async transform(id: string, source: string) {
            const result: unknown = await Reflect.apply(transform.handler, context, [source, id])
            if (result === undefined) {
                await Reflect.apply(capture, context, [source, id])
            } else {
                assert.ok(result && typeof result === 'object' && 'code' in result && typeof result.code === 'string')
                await Reflect.apply(capture, context, [result.code, id])
            }
        }
    }
}

/** Inline candidates disable project discovery while exercising the actual Tailwind root transform. */
function tailwind(candidates: readonly string[]): string {
    return `@import "tailwindcss" source(none);\n@source inline(${JSON.stringify(candidates.join(' '))});`
}

test('reuses unchanged CSS and candidate tables while rewriting each current patch', async (context) => {
    const fixture = await createStyleFixture(context, false, ['/app.js'])
    await fixture.transform('/app.css', tailwind(['py-5.5']))
    const first = await fixture.update("const first = 'py-5.5'")
    const unchanged = await fixture.update("const next = 'py-5.5'")
    assert.deepEqual(first, [{ code: "const first = 'py-5_d5'", filename: 'app.js', seq: 1 }])
    assert.deepEqual(unchanged, [{ code: "const next = 'py-5_d5'", filename: 'app.js', seq: 1 }])
    assert.match(fixture.published[0]!, /\.py-5_d5/)
    assert.equal(fixture.published.length, 1)
    assert.equal(fixture.css.mock.callCount(), 1)
    assert.strictEqual(
        fixture.javaScript.mock.calls[0]!.arguments[0].classSet,
        fixture.javaScript.mock.calls[1]!.arguments[0].classSet
    )

    // Model byte-identical postprocessed CSS with changed raw candidates, which must invalidate only the replacement table.
    const capturedCss = fixture.css.mock.calls[0]!.arguments[0]
    await fixture.transform('/app.css', tailwind(['mr-4.5']))
    await fixture.capture('/app.css', capturedCss)
    const changed = await fixture.update("const changed = 'py-5.5 mr-4.5'")
    assert.equal(changed[0]!.code, "const changed = 'py-5.5 mr-4_d5'")
    assert.notStrictEqual(
        fixture.javaScript.mock.calls[1]!.arguments[0].classSet,
        fixture.javaScript.mock.calls[2]!.arguments[0].classSet
    )
    assert.equal(fixture.css.mock.callCount(), 1)

    await fixture.transform('/app.css', capturedCss)
    const cleared = await fixture.update("const cleared = 'py-5.5 mr-4.5'")
    await fixture.update("const empty = 'py-5.5'")
    assert.equal(cleared[0]!.code, "const cleared = 'py-5.5 mr-4.5'")
    assert.notStrictEqual(
        fixture.javaScript.mock.calls[2]!.arguments[0].classSet,
        fixture.javaScript.mock.calls[3]!.arguments[0].classSet
    )
    assert.strictEqual(
        fixture.javaScript.mock.calls[3]!.arguments[0].classSet,
        fixture.javaScript.mock.calls[4]!.arguments[0].classSet
    )
    assert.equal(fixture.css.mock.callCount(), 1)
    assert.equal(fixture.published.length, 1)
})

test('retains only the latest conversion and keeps each plugin minification policy independent', async (context) => {
    const fixture = await createStyleFixture(context, false, ['/app.js'])
    const firstCss = '.first { padding: 1px; }'
    const secondCss = '.second { padding: 2px; }'
    for (const source of [firstCss, firstCss, secondCss, firstCss]) {
        await fixture.capture('/app.css', source)
        await fixture.update('export {}')
    }
    assert.deepEqual(
        fixture.css.mock.calls.map((call) => call.arguments[0]),
        [firstCss, secondCss, firstCss]
    )
    assert.match(fixture.published.at(-1)!, /\.first \{ padding: 1rpx; \}/)

    const minified = await createStyleFixture(context, true, ['/app.js'])
    await minified.capture('/app.css', firstCss)
    await minified.update('export {}')
    await minified.update('export {}')
    assert.equal(minified.css.mock.callCount(), 1)
    assert.match(minified.published[0]!, /\.first\{padding:1rpx\}/)
    assert.notEqual(minified.published[0], fixture.published.at(-1))
})

test('reprojects cyclic multi-entry graphs, deduplicates styles, and prunes removed imports and candidates', async (context) => {
    const fixture = await createStyleFixture(context, false, ['/app.js', '/page.js', '/missing.js'])
    fixture.graph.clear()
    fixture.graph.set('/app.js', { importedIds: ['/a.css?one'], dynamicallyImportedIds: ['/lazy.js'] })
    fixture.graph.set('/lazy.js', { importedIds: ['/b.css'], dynamicallyImportedIds: ['/app.js'] })
    fixture.graph.set('/page.js', { importedIds: ['/a.css?two', '/uncaptured.css'], dynamicallyImportedIds: [] })
    for (const id of ['/a.css?one', '/a.css?two', '/b.css', '/uncaptured.css']) {
        fixture.graph.set(id, { importedIds: [], dynamicallyImportedIds: [] })
    }
    const a = '.a { color: red; }'
    const b = '.b { color: blue; }'
    await fixture.transform('/a.css', tailwind(['py-5.5']))
    await fixture.transform('/b.css', tailwind(['mr-4.5']))
    await fixture.transform('/unreachable.css', tailwind(['px-1.5']))
    await fixture.capture('/a.css', a)
    await fixture.capture('/b.css', b)
    const code = "const classes = 'py-5.5 mr-4.5 px-1.5'"
    const first = await fixture.update(code)
    assert.equal(first[0]!.code, "const classes = 'py-5_d5 mr-4_d5 px-1.5'")
    assert.deepEqual(
        fixture.css.mock.calls.map((call) => call.arguments[0]),
        [`${a}\n${b}`]
    )

    fixture.graph.set('/app.js', { importedIds: ['/b.css'], dynamicallyImportedIds: ['/a.css?one', '/lazy.js'] })
    await fixture.update(code)
    assert.equal(fixture.css.mock.calls[1]!.arguments[0], `${b}\n${a}`)
    assert.strictEqual(
        fixture.javaScript.mock.calls[0]!.arguments[0].classSet,
        fixture.javaScript.mock.calls[1]!.arguments[0].classSet
    )

    fixture.graph.set('/app.js', { importedIds: [], dynamicallyImportedIds: ['/a.css?one'] })
    const pruned = await fixture.update(code)
    assert.equal(pruned[0]!.code, "const classes = 'py-5_d5 mr-4.5 px-1.5'")
    assert.equal(fixture.css.mock.calls[2]!.arguments[0], a)

    fixture.graph.delete('/a.css?one')
    fixture.graph.delete('/a.css?two')
    const missing = await fixture.update(code)
    assert.equal(missing[0]!.code, code)
    assert.equal(fixture.css.mock.calls[3]!.arguments[0], '')
    assert.doesNotMatch(fixture.published.at(-1)!, /\.[ab] \{/)
    fixture.graph.clear()
    await fixture.update(code)
    assert.equal(fixture.css.mock.callCount(), 4)
    assert.strictEqual(
        fixture.javaScript.mock.calls[3]!.arguments[0].classSet,
        fixture.javaScript.mock.calls[4]!.arguments[0].classSet
    )
})

for (const failureStage of ['conversion', 'minification', 'JavaScript'] as const) {
    test(`failed ${failureStage} stays retryable without replacing the last successful snapshot`, async (context) => {
        const fixture = await createStyleFixture(context, true, ['/app.js'])
        const previousCss = '.previous { color: red; }'
        const nextCss = '.next { color: blue; }'
        const code = "const classes = 'py-5.5 mr-4.5'"
        await fixture.transform('/app.css', tailwind(['py-5.5']))
        await fixture.capture('/app.css', previousCss)
        await fixture.update(code)
        await fixture.transform('/app.css', tailwind(['mr-4.5']))
        await fixture.capture('/app.css', nextCss)
        if (failureStage === 'conversion') {
            fixture.css.mock.mockImplementationOnce(async () => {
                throw new Error('simulated CSS conversion failure')
            })
        } else if (failureStage === 'minification') {
            fixture.css.mock.mockImplementationOnce(async () => '.broken { color: red; } }')
        }
        await assert.rejects(fixture.update(failureStage === 'JavaScript' ? "const = 'mr-4.5'" : code), Error)
        assert.equal(fixture.published.length, 1, 'Failed conversion must not publish newer CSS')
        assert.equal(fixture.javaScript.mock.callCount(), failureStage === 'JavaScript' ? 2 : 1)

        await fixture.transform('/app.css', tailwind(['py-5.5']))
        await fixture.capture('/app.css', previousCss)
        await fixture.update(code)
        assert.strictEqual(
            fixture.javaScript.mock.calls[0]!.arguments[0].classSet,
            fixture.javaScript.mock.calls.at(-1)!.arguments[0].classSet
        )
        assert.deepEqual(
            fixture.css.mock.calls.map((call) => call.arguments[0]),
            [previousCss, nextCss]
        )
        assert.equal(fixture.published.length, 1)

        await fixture.transform('/app.css', tailwind(['mr-4.5']))
        await fixture.capture('/app.css', nextCss)
        const retried = await fixture.update(code)
        await fixture.update(code)
        assert.equal(retried[0]!.code, "const classes = 'py-5.5 mr-4_d5'")
        assert.deepEqual(
            fixture.css.mock.calls.map((call) => call.arguments[0]),
            [previousCss, nextCss, nextCss]
        )
        assert.equal(fixture.published.length, 2)
    })
}

test('retries a failed stylesheet publication without repeating successful conversion', async (context) => {
    const fixture = await createStyleFixture(context, false, ['/app.js'])
    await fixture.transform('/app.css', tailwind(['py-5.5']))
    const artifact = { code: "const name = 'py-5.5'", filename: 'app.js', seq: 1 }
    await assert.rejects(
        fixture.plugin.finalizeUpdate([artifact], async () => {
            throw new Error('simulated stylesheet write failure')
        }),
        /simulated stylesheet write failure/
    )
    assert.equal(fixture.published.length, 0)
    const retried = await fixture.plugin.finalizeUpdate([artifact], fixture.publish)
    assert.equal(retried[0]!.code, "const name = 'py-5_d5'")
    assert.equal(retried[0]!.seq, artifact.seq)
    assert.equal(artifact.code, "const name = 'py-5.5'")
    assert.equal(fixture.css.mock.callCount(), 1)
    assert.equal(fixture.published.length, 1)
})
