import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test, { type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { type BuildOptions, createLogger, normalizePath, type Plugin } from 'vite'
import { createMiniStyleEntries } from '../../../tests/create-mini-style-entries.ts'
import type { createMiniTransformer } from './create-mini-transformer.ts'
import { miniHtmlBase } from './mini-html-base.ts'
import type { projectMiniStyles } from './project-mini-styles.ts'

const contract = { styles: { appFileName: 'app.wxss', globalFileName: 'assets/global.wxss' } }
const root = normalizePath(fileURLToPath(new URL('.', import.meta.url)))
const { createMiniStylePlugin, transformers, projections } = await importObservedPlugin()

/** Observe real projections and transformers at their module boundaries, without a production injection API. */
async function importObservedPlugin() {
    const pluginUrl = new URL('./plugins.ts', import.meta.url).href
    const transformerUrl = new URL('./create-mini-transformer.ts', import.meta.url).href
    const projectorUrl = new URL('./project-mini-styles.ts', import.meta.url).href
    // These test-only journals expose ownership snapshots and transformer instances for assertions and one-shot failures.
    const observerUrl = `data:text/javascript,${encodeURIComponent(`
        import { createMiniTransformer as create } from ${JSON.stringify(transformerUrl)}
        import { projectMiniStyles as project } from ${JSON.stringify(projectorUrl)}
        export const transformers = []
        export const projections = []
        export function createMiniTransformer() {
            const transformer = create()
            transformers.push(transformer)
            return transformer
        }
        export function projectMiniStyles(entries, styles, context, cssCodeSplit) {
            const projection = project(entries, styles, context, cssCodeSplit)
            projections.push({ entries, projection })
            return projection
        }
    `)}`
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (
                context.parentURL === pluginUrl &&
                (specifier === './create-mini-transformer.ts' || specifier === './project-mini-styles.ts')
            ) {
                return { url: observerUrl, shortCircuit: true }
            }
            return nextResolve(specifier, context)
        }
    })
    try {
        const plugin: typeof import('./plugins.ts') = await import(pluginUrl)
        const observer: {
            transformers: ReturnType<typeof createMiniTransformer>[]
            projections: {
                entries: Parameters<typeof projectMiniStyles>[0]
                projection: ReturnType<typeof projectMiniStyles>
            }[]
        } = await import(observerUrl)
        return {
            createMiniStylePlugin: plugin.createMiniStylePlugin,
            transformers: observer.transformers,
            projections: observer.projections
        }
    } finally {
        hooks.deregister()
    }
}

/** Drive the real plugin hooks with an in-memory Rolldown graph, Vite CSS boundary, and stylesheet writer. */
async function createStyleFixture(
    testContext: TestContext,
    cssMinify: BuildOptions['cssMinify'],
    entries: Parameters<typeof createMiniStylePlugin>[1],
    build?: Pick<BuildOptions, 'cssCodeSplit'>
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
    await Reflect.apply(config.handler, {}, [{ build: { cssMinify, ...build } }])
    // Retain diagnostics so tests can distinguish tolerated native CSS errors from rejected transactions.
    const errors: string[] = []
    const logger = createLogger('silent')
    logger.error = (message) => {
        errors.push(message)
    }
    await Reflect.apply(configResolved, {}, [{ build: { minify: false }, plugins: [cssPost], logger }])
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
        addWatchFile() {},
        emitFile: testContext.mock.fn()
    }
    await Reflect.apply(buildStart, context, [])
    // Capture publication in memory; these tests never create source fixtures, output files, or watchers.
    const published: { fileName: string; source: string }[] = []
    const publish = async (fileName: string, source: string) => {
        published.push({ fileName, source })
    }
    return {
        plugin,
        context,
        graph,
        css,
        javaScript,
        errors,
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

test('resolves App/Page capsules in cascade order without mutating their entry metadata', async (context) => {
    const entries = createMiniStyleEntries('/app.js', ['/z-page.js', '/a-page.js'])
    const originalEntries = structuredClone(entries)
    const fixture = await createStyleFixture(context, false, entries)
    const resolve = context.mock.method(fixture.context, 'resolve', async (id: string) => ({ id: `resolved:${id}` }))
    const sources = [
        ['/app.js', '.app { color: red; }'],
        ['/z-page.js', '.first-page { color: blue; }'],
        ['/a-page.js', '.second-page { color: green; }']
    ] as const
    fixture.graph.clear()
    for (const [id, css] of sources) {
        const styleId = `${id}.css`
        fixture.graph.set(`resolved:${id}`, { importedIds: [styleId], dynamicallyImportedIds: [] })
        fixture.graph.set(styleId, { importedIds: [], dynamicallyImportedIds: [] })
        await fixture.capture(styleId, css)
    }
    assert.ok(typeof fixture.plugin.buildStart === 'function')
    await Reflect.apply(fixture.plugin.buildStart, fixture.context, [])
    await fixture.update('export {}')

    assert.deepEqual(
        resolve.mock.calls.map((call) => call.arguments[0]),
        sources.map(([id]) => id)
    )
    assert.deepEqual(
        fixture.css.mock.calls.map((call) => call.arguments[0]),
        sources.map(([, css]) => css)
    )
    assert.deepEqual(
        fixture.published.map((file) => file.fileName),
        ['assets/global.wxss', 'pages/page-0/index.wxss', 'pages/page-1/index.wxss']
    )
    const observed = projections.at(-1)!
    assert.deepEqual(observed.entries, {
        appEntries: { ...entries.appEntries, capsuleId: 'resolved:/app.js' },
        pageEntries: entries.pageEntries.map((entry) => ({ ...entry, capsuleId: `resolved:${entry.capsuleId}` }))
    })
    assert.equal(observed.projection.appEntries.css, sources[0][1])
    assert.deepEqual(
        observed.projection.pageEntries.map((entry) => entry.css),
        sources.slice(1).map(([, css]) => css)
    )
    assert.deepEqual(entries, originalEntries)
})

test('keeps the previous resolved ownership snapshot when a Page resolution fails', async (context) => {
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', ['/page.js']))
    fixture.graph.set('/page.js', { importedIds: ['/app.css'], dynamicallyImportedIds: [] })
    await fixture.capture('/app.css', '.app { color: red; }')
    await fixture.update('export {}')
    const previousEntries = projections.at(-1)!.entries
    context.mock.method(fixture.context, 'resolve', async (id: string) => {
        if (id === '/page.js') {
            throw new Error('Page resolution failed')
        }
        return { id: `new:${id}` }
    })
    assert.ok(typeof fixture.plugin.buildStart === 'function')
    await assert.rejects(Reflect.apply(fixture.plugin.buildStart, fixture.context, []), /Page resolution failed/)
    await fixture.update('export {}')

    assert.strictEqual(projections.at(-1)!.entries, previousEntries)
    assert.equal(fixture.css.mock.callCount(), 2)
    assert.equal(fixture.published.length, 2)
})

test('moves styles from App to Page during HMR without changing JavaScript candidate identities', async (context) => {
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', ['/page.js']))
    fixture.graph.set('/page.js', { importedIds: ['/app.css'], dynamicallyImportedIds: [] })
    await fixture.transform('/app.css', tailwind(['py-5.5']))
    const code = "const name = 'py-5.5'"
    const initial = await fixture.update(code)
    const before = projections.at(-1)!.projection
    assert.deepEqual(before.appEntries.classSet, new Set(['py-5.5']))
    assert.equal(before.pageEntries[0]!.css, '')

    fixture.graph.set('/app.js', { importedIds: [], dynamicallyImportedIds: [] })
    const updated = await fixture.update(code)
    const after = projections.at(-1)!.projection
    assert.equal(after.appEntries.css, '')
    assert.deepEqual(after.appEntries.classSet, new Set())
    assert.equal(after.pageEntries[0]!.css, before.appEntries.css)
    assert.deepEqual(after.pageEntries[0]!.classSet, before.appEntries.classSet)
    assert.deepEqual(updated, initial)
    assert.equal(fixture.css.mock.callCount(), 4)
    assert.equal(fixture.published.length, 4)
    assert.equal(fixture.published[2]!.fileName, 'assets/global.wxss')
    assert.equal(fixture.published[2]!.source, `${miniHtmlBase}\n`)
    assert.equal(fixture.published[3]!.fileName, 'pages/page-0/index.wxss')
    assert.match(fixture.published[3]!.source, /\.py-5_d5/)
    assert.doesNotMatch(fixture.published[3]!.source, /\.h5-span/)
    assert.strictEqual(
        fixture.javaScript.mock.calls[0]!.arguments[0].classSet,
        fixture.javaScript.mock.calls[1]!.arguments[0].classSet
    )
})

test('emits HTML display defaults only in App CSS and leaves empty Page styles empty', async (context) => {
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', ['/page.js']))
    await fixture.update('export {}')
    assert.deepEqual(fixture.published, [
        { fileName: 'assets/global.wxss', source: `${miniHtmlBase}\n` },
        { fileName: 'pages/page-0/index.wxss', source: '' }
    ])
    const css = fixture.published[0]!.source
    assert.match(css, /\.h5-span,\s*\.h5-a\s*\{\s*display:\s*inline/)
    assert.match(css, /\.h5-button,\s*\.h5-input,\s*\.h5-textarea,\s*\.h5-progress\s*\{\s*display:\s*inline-block/)
    assert.match(css, /\.h5-template,\s*\.h5-datalist\s*\{\s*display:\s*none/)
    assert.deepEqual(
        Array.from(css.matchAll(/([\w-]+)\s*:/g), (match) => match[1]),
        ['display', 'display', 'display']
    )
    assert.doesNotMatch(css, /@layer|!important|\.h5-(?:li|meter|br|ins|select|table|tr|td|h[1-6])\b/)
    await fixture.update('export {}')
    assert.equal(fixture.published.length, 2)
})

test('caches each Page independently, rewrites the shared candidate union, and clears removed styles', async (context) => {
    const fixture = await createStyleFixture(
        context,
        true,
        createMiniStyleEntries('/app.js', ['/first.js', '/second.js'])
    )
    fixture.graph.set('/first.js', { importedIds: ['/first.css'], dynamicallyImportedIds: [] })
    fixture.graph.set('/second.js', { importedIds: ['/second.css'], dynamicallyImportedIds: [] })
    fixture.graph.set('/first.css', { importedIds: [], dynamicallyImportedIds: [] })
    fixture.graph.set('/second.css', { importedIds: [], dynamicallyImportedIds: [] })
    await fixture.capture('/app.css', '.app { color: red; }')
    await fixture.transform('/first.css', tailwind(['py-5.5']))
    await fixture.transform('/second.css', tailwind(['mr-4.5']))
    const code = "const classes = 'py-5.5 mr-4.5'"
    const initial = await fixture.update(code)
    assert.equal(initial[0]!.code, "const classes = 'py-5_d5 mr-4_d5'")
    assert.doesNotMatch(fixture.published[0]!.source, /py-5|mr-4/)
    assert.match(fixture.published[1]!.source, /\.py-5_d5\{/)
    assert.doesNotMatch(fixture.published[1]!.source, /mr-4|\.h5-span/)
    assert.match(fixture.published[2]!.source, /\.mr-4_d5\{/)
    assert.doesNotMatch(fixture.published[2]!.source, /py-5|\.h5-span/)

    await fixture.capture('/app.css', '.app { color: blue; }')
    await fixture.update(code)
    assert.equal(fixture.css.mock.callCount(), 4)
    assert.equal(fixture.published.at(-1)!.fileName, 'assets/global.wxss')
    fixture.graph.set('/first.js', { importedIds: [], dynamicallyImportedIds: [] })
    const removed = await fixture.update(code)
    assert.equal(removed[0]!.code, "const classes = 'py-5.5 mr-4_d5'")
    assert.deepEqual(fixture.published.at(-1), { fileName: 'pages/page-0/index.wxss', source: '' })
    assert.equal(fixture.published.length, 5)
    assert.equal(fixture.css.mock.callCount(), 5)
    await fixture.update(code)
    assert.equal(fixture.published.length, 5)
})

test('cssCodeSplit:false publishes Page Tailwind updates globally and prunes removed imports without rewriting Page companions', async (context) => {
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', ['/page.js']), {
        cssCodeSplit: false
    })
    fixture.graph.set('/page.js', { importedIds: ['/page.css'], dynamicallyImportedIds: [] })
    await fixture.capture('/app.css', '.app { color: red; }')
    await fixture.transform('/page.css', tailwind(['py-5.5']))
    fixture.graph.set('/page.css', { importedIds: [], dynamicallyImportedIds: [] })
    const code = "const classes = 'py-5.5 mr-4.5'"
    const initial = await fixture.update(code)
    assert.equal(initial[0]!.code, "const classes = 'py-5_d5 mr-4.5'")
    assert.match(fixture.published[0]!.source, /\.app/)
    assert.match(fixture.published[0]!.source, /\.py-5_d5/)
    assert.deepEqual(fixture.published[1], { fileName: 'pages/page-0/index.wxss', source: '' })

    await fixture.transform('/page.css', tailwind(['mr-4.5']))
    const updated = await fixture.update(code)
    assert.equal(updated[0]!.code, "const classes = 'py-5.5 mr-4_d5'")
    assert.equal(fixture.published[2]!.fileName, 'assets/global.wxss')
    assert.match(fixture.published[2]!.source, /\.mr-4_d5/)
    assert.doesNotMatch(fixture.published[2]!.source, /\.py-5_d5/)

    fixture.graph.set('/page.js', { importedIds: [], dynamicallyImportedIds: [] })
    assert.equal((await fixture.update(code))[0]!.code, code)
    assert.equal(fixture.published.length, 4)
    assert.deepEqual(fixture.published[3], {
        fileName: 'assets/global.wxss',
        source: `${miniHtmlBase}\n.app { color: red; }`
    })
    await fixture.update(code)
    assert.equal(fixture.published.length, 4, 'Identical global CSS and empty Page companions must not be rewritten')
})

for (const cssCodeSplit of [undefined, true, false]) {
    test(`defaults to split native styles and respects cssCodeSplit=${cssCodeSplit ?? 'default'}`, async (context) => {
        const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', ['/page.js']), {
            cssCodeSplit
        })
        fixture.graph.set('/page.js', { importedIds: ['/page.css'], dynamicallyImportedIds: [] })
        fixture.graph.set('/page.css', { importedIds: [], dynamicallyImportedIds: [] })
        await fixture.capture('/page.css', '.page { color: red; }')
        await fixture.update('export {}')
        assert.equal(fixture.published[0]!.source.includes('.page'), cssCodeSplit === false)
        assert.equal(fixture.published[1]!.source.includes('.page'), cssCodeSplit !== false)
    })
}

test('retries a failed Page write without rewriting durable App CSS or delivering partial JavaScript', async (context) => {
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', ['/page.js']))
    fixture.graph.set('/page.js', { importedIds: ['/page.css'], dynamicallyImportedIds: [] })
    fixture.graph.set('/page.css', { importedIds: [], dynamicallyImportedIds: [] })
    await fixture.capture('/app.css', '.app { color: red; }')
    await fixture.transform('/page.css', tailwind(['py-5.5']))
    const artifact = { code: "const name = 'py-5.5'", filename: 'page.js', seq: 7 }
    await assert.rejects(
        fixture.plugin.finalizeUpdate([artifact], async (fileName, source) => {
            if (fileName === 'pages/page-0/index.wxss') {
                throw new Error('Page write failed')
            }
            await fixture.publish(fileName, source)
        }),
        /Page write failed/
    )
    assert.equal(fixture.published.length, 1)
    assert.equal(fixture.published[0]!.fileName, 'assets/global.wxss')
    assert.equal(artifact.code, "const name = 'py-5.5'")

    const retried = await fixture.plugin.finalizeUpdate([artifact], fixture.publish)
    assert.deepEqual(retried, [{ ...artifact, code: "const name = 'py-5_d5'" }])
    assert.equal(fixture.published.length, 2)
    assert.equal(fixture.published[1]!.fileName, 'pages/page-0/index.wxss')
    assert.equal(fixture.css.mock.callCount(), 2)
})

test('a Page conversion failure keeps its last valid CSS while publishing healthy App CSS and JavaScript', async (context) => {
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', ['/page.js']))
    fixture.graph.set('/page.js', { importedIds: ['/page.css'], dynamicallyImportedIds: [] })
    fixture.graph.set('/page.css', { importedIds: [], dynamicallyImportedIds: [] })
    await fixture.capture('/app.css', '.app { color: red; }')
    await fixture.capture('/page.css', '.page { color: red; }')
    await fixture.update('export {}')
    await fixture.capture('/app.css', '.app { color: blue; }')
    await fixture.capture('/page.css', '.page {')
    const updated = await fixture.update('export const generation = 2')
    assert.deepEqual(updated, [{ code: 'export const generation = 2', filename: 'app.js', seq: 1 }])
    assert.equal(fixture.published.length, 3)
    assert.equal(fixture.published[2]!.fileName, 'assets/global.wxss')
    assert.match(fixture.published[2]!.source, /color: blue/)
    assert.equal(fixture.errors.length, 1)
    assert.match(fixture.errors[0]!, /pages\/page-0\/index\.wxss[\s\S]*Unclosed block/)
    await fixture.capture('/page.css', '.page { color: blue; }')
    await fixture.update('export {}')
    assert.equal(fixture.published.length, 4)
    assert.equal(fixture.published[3]!.fileName, 'pages/page-0/index.wxss')
    assert.match(fixture.published[3]!.source, /color: blue/)
    assert.equal(fixture.css.mock.callCount(), 5)
})

test('reuses unchanged CSS and candidate tables while rewriting each current patch', async (context) => {
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', []))
    await fixture.transform('/app.css', tailwind(['py-5.5']))
    const first = await fixture.update("const first = 'py-5.5'")
    const unchanged = await fixture.update("const next = 'py-5.5'")
    assert.deepEqual(first, [{ code: "const first = 'py-5_d5'", filename: 'app.js', seq: 1 }])
    assert.deepEqual(unchanged, [{ code: "const next = 'py-5_d5'", filename: 'app.js', seq: 1 }])
    assert.match(fixture.published[0]!.source, /\.py-5_d5/)
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
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', []))
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
    assert.match(fixture.published.at(-1)!.source, /\.first \{ padding: 1rpx; \}/)

    const minified = await createStyleFixture(context, true, createMiniStyleEntries('/app.js', []))
    await minified.capture('/app.css', firstCss)
    await minified.update('export {}')
    await minified.update('export {}')
    assert.equal(minified.css.mock.callCount(), 1)
    assert.match(minified.published[0]!.source, /\.first\{padding:1rpx\}/)
    assert.notEqual(minified.published[0]!.source, fixture.published.at(-1)!.source)
})

test('reprojects cyclic multi-entry graphs, deduplicates styles, and prunes removed imports and candidates', async (context) => {
    const fixture = await createStyleFixture(
        context,
        false,
        createMiniStyleEntries('/app.js', ['/page.js', '/missing.js'])
    )
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
        [`${a}\n${b}`, '', '']
    )

    fixture.graph.set('/app.js', { importedIds: ['/b.css'], dynamicallyImportedIds: ['/a.css?one', '/lazy.js'] })
    await fixture.update(code)
    assert.equal(fixture.css.mock.calls[3]!.arguments[0], `${b}\n${a}`)
    assert.strictEqual(
        fixture.javaScript.mock.calls[0]!.arguments[0].classSet,
        fixture.javaScript.mock.calls[1]!.arguments[0].classSet
    )

    fixture.graph.set('/app.js', { importedIds: [], dynamicallyImportedIds: ['/a.css?one'] })
    const pruned = await fixture.update(code)
    assert.equal(pruned[0]!.code, "const classes = 'py-5_d5 mr-4.5 px-1.5'")
    assert.equal(fixture.css.mock.calls[4]!.arguments[0], a)

    fixture.graph.delete('/a.css?one')
    fixture.graph.delete('/a.css?two')
    const missing = await fixture.update(code)
    assert.equal(missing[0]!.code, code)
    assert.equal(fixture.css.mock.calls[5]!.arguments[0], '')
    assert.doesNotMatch(fixture.published.at(-1)!.source, /\.[ab] \{/)
    fixture.graph.clear()
    await fixture.update(code)
    assert.equal(fixture.css.mock.callCount(), 6)
    assert.strictEqual(
        fixture.javaScript.mock.calls[3]!.arguments[0].classSet,
        fixture.javaScript.mock.calls[4]!.arguments[0].classSet
    )
})

for (const failureStage of ['conversion', 'minification'] as const) {
    test(`HMR logs CSS ${failureStage} failure and retains valid styles without rejecting JavaScript`, async (context) => {
        const fixture = await createStyleFixture(context, true, createMiniStyleEntries('/app.js', []))
        const code = "const classes = 'py-5.5 mr-4.5'"
        await fixture.transform('/app.css', tailwind(['py-5.5']))
        await fixture.update(code)
        await fixture.transform('/app.css', tailwind(['mr-4.5']))
        if (failureStage === 'conversion') {
            await fixture.capture('/app.css', '.broken {')
        } else {
            await fixture.capture('/app.css', '.next { color: blue; }')
            // Return invalid native output twice to exercise repeated Lightning CSS failures, not PostCSS failures.
            const invalidNativeCss = async () => '.broken { color: red; } }'
            fixture.css.mock.mockImplementationOnce(invalidNativeCss, 1)
            fixture.css.mock.mockImplementationOnce(invalidNativeCss, 2)
        }
        for (const generation of [1, 2]) {
            const updated = await fixture.update(code)
            assert.equal(updated[0]!.code, "const classes = 'py-5.5 mr-4_d5'")
            assert.equal(fixture.published.length, 1, 'Failed CSS must never replace the last valid stylesheet')
            assert.equal(fixture.css.mock.callCount(), generation + 1, 'Failed CSS must be retried, not cached')
            assert.equal(fixture.errors.length, generation)
            assert.match(fixture.errors.at(-1)!, /Native CSS update failed.*assets\/global\.wxss/)
        }
        await fixture.transform('/app.css', tailwind(['mr-4.5']))
        const repaired = await fixture.update(code)
        assert.equal(repaired[0]!.code, "const classes = 'py-5.5 mr-4_d5'")
        assert.equal(fixture.published.length, 2)
        assert.match(fixture.published[1]!.source, /\.mr-4_d5/)
        assert.equal(fixture.css.mock.callCount(), 4)
        assert.strictEqual(
            fixture.javaScript.mock.calls[1]!.arguments[0].classSet,
            fixture.javaScript.mock.calls[3]!.arguments[0].classSet
        )
        await fixture.update(code)
        assert.equal(fixture.css.mock.callCount(), 4)
        assert.equal(fixture.published.length, 2)
    })
}

test('HMR retains the last valid stylesheet when Lightning CSS rejects a native media query', async (context) => {
    const fixture = await createStyleFixture(context, true, createMiniStyleEntries('/app.js', []))
    await fixture.capture('/app.css', '.units { padding: 4px; }')
    await fixture.update('export {}')
    await fixture.capture('/app.css', '@media (min-width: 375rpx) { .units { padding: 16px; } }')
    const updated = await fixture.update('export {}')
    assert.equal(updated[0]!.code, 'export {}')
    assert.equal(fixture.published.length, 1)
    assert.match(fixture.published[0]!.source, /padding:4rpx/)
    assert.doesNotMatch(fixture.published[0]!.source, /@media|16rpx/)
    assert.match(fixture.errors[0]!, /assets\/global\.wxss[\s\S]*Invalid media query/)
})

test('HMR skips an invalid stylesheet without a previous conversion and recovers after import removal', async (context) => {
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', ['/page.js']))
    fixture.graph.set('/page.js', { importedIds: ['/page.css'], dynamicallyImportedIds: [] })
    fixture.graph.set('/page.css', { importedIds: [], dynamicallyImportedIds: [] })
    await fixture.capture('/page.css', '.broken {')
    const updated = await fixture.update('export {}')
    assert.equal(updated[0]!.code, 'export {}')
    assert.equal(fixture.published.length, 1)
    assert.equal(fixture.published[0]!.fileName, 'assets/global.wxss')
    assert.match(fixture.errors[0]!, /pages\/page-0\/index\.wxss[\s\S]*Unclosed block/)
    fixture.graph.set('/page.js', { importedIds: [], dynamicallyImportedIds: [] })
    await fixture.update('export {}')
    assert.deepEqual(fixture.published[1], { fileName: 'pages/page-0/index.wxss', source: '' })
    assert.equal(fixture.errors.length, 1)
})

test('reverting failed CSS to the previous source reuses the last valid conversion without rewriting it', async (context) => {
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', []))
    const previousCss = '.app { padding: 4px; }'
    await fixture.capture('/app.css', previousCss)
    await fixture.update('export {}')
    await fixture.capture('/app.css', '.app { padding: 8px;')
    await fixture.update('export {}')
    assert.equal(fixture.published.length, 1)
    await fixture.capture('/app.css', previousCss)
    await fixture.update('export {}')
    assert.equal(fixture.published.length, 1)
    assert.match(fixture.published[0]!.source, /padding: 4rpx/)
    assert.equal(fixture.css.mock.callCount(), 2)
})

test('a complete build rejects invalid CSS that HMR logged and kept out of publication', async (context) => {
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', []))
    await fixture.capture('/app.css', '.app { padding: 4px; }')
    await fixture.update('export {}')
    await fixture.capture('/app.css', '.app {')
    await fixture.update('export {}')
    assert.equal(fixture.errors.length, 1)
    assert.equal(fixture.published.length, 1)

    const generate = fixture.plugin.generateBundle
    assert.ok(generate && typeof generate === 'object')
    await assert.rejects(Reflect.apply(generate.handler, fixture.context, [{}, {}]), /Unclosed block/)
    assert.equal(fixture.errors.length, 1, 'Build errors must not enter the HMR-only error logger')
    assert.equal(fixture.context.emitFile.mock.callCount(), 0)
    assert.equal(fixture.published.length, 1)
})

for (const failureStage of ['conversion', 'minification', 'JavaScript'] as const) {
    test(`failed ${failureStage === 'JavaScript' ? 'HMR JavaScript' : `build CSS ${failureStage}`} stays strict and retryable`, async (context) => {
        const fixture = await createStyleFixture(context, true, createMiniStyleEntries('/app.js', []))
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
        if (failureStage === 'JavaScript') {
            await assert.rejects(fixture.update("const = 'mr-4.5'"), Error)
        } else {
            const generate = fixture.plugin.generateBundle
            assert.ok(generate && typeof generate === 'object')
            const bundle = { 'app.js': { type: 'chunk', fileName: 'app.js', code, map: null } }
            const originalBundle = structuredClone(bundle)
            await assert.rejects(Reflect.apply(generate.handler, fixture.context, [{}, bundle]), Error)
            assert.deepEqual(bundle, originalBundle)
            assert.equal(fixture.context.emitFile.mock.callCount(), 0)
        }
        assert.equal(fixture.errors.length, 0, 'Strict failures must reject rather than log and continue')
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
    const fixture = await createStyleFixture(context, false, createMiniStyleEntries('/app.js', []))
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
