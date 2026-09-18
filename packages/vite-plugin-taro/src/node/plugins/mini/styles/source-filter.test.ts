import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'rolldown'
import { isCSSRequest, normalizePath, type Plugin } from 'vite'
import { wrapPluginTransform } from '../../../utils/vite.ts'
import { createMiniStylePlugin } from './plugins.ts'

const contract = { styles: { appFileName: 'app.wxss', globalFileName: 'assets/global.wxss' } }

test('native stylesheet dispatch matches Vite for extensions, virtual styles, and query modes', async () => {
    const extensions = ['css', 'less', 'sass', 'scss', 'styl', 'stylus', 'pcss', 'postcss', 'sss']
    const ignoredIds = new Set(
        ['direct', 'inline', 'inline-css', 'raw', 'style-attr', 'transform-only', 'url'].map(
            (mode) => `/fixture/app.css?${mode}#fragment`
        )
    )
    const ids = [
        ...extensions.flatMap((extension) => [
            `/fixture/app.${extension}`,
            `/fixture/app.module.${extension}`,
            `/fixture/app.${extension}?v=1`,
            `/fixture/app.${extension}?value=line1\nline2`
        ]),
        ...ignoredIds,
        '/fixture/app.css?module#fragment',
        '/fixture/component.vue?vue&type=style&lang.scss',
        '\0virtual:style.css',
        '/fixture/app.js',
        '/fixture/app.tsx',
        '/fixture/app.json',
        '/fixture/app.html',
        '/fixture/app.css.map',
        '/fixture/app.scssx',
        '/fixture/app.CSS',
        '/fixture/app.css#fragment'
    ]
    const sourceIds = new Set(ids)
    const styles = createMiniStylePlugin(contract, [])
    assert.ok(styles.transform && typeof styles.transform === 'object')
    assert.equal(styles.transform.order, 'pre')
    // Record real JS dispatches without emulating Rolldown's filter evaluation.
    const calls: string[] = []
    wrapPluginTransform(
        styles,
        (transform) =>
            async function (code, id, options) {
                calls.push(id)
                assert.equal(await transform.call(this, code, id, options), undefined)
            }
    )
    const result = await build({
        input: Object.fromEntries(ids.map((id, index) => [`source-${index}`, id])),
        plugins: [
            {
                name: 'test:virtual-stylesheets',
                resolveId: (id) => (sourceIds.has(id) ? id : undefined),
                load(id) {
                    assert.ok(sourceIds.has(id))
                    // All IDs carry JS to test dispatch without preprocessors. Ignored requests deliberately contain a
                    // Tailwind marker: entering compilation would fail because this plain Rolldown context has no Vite root.
                    const marker = ignoredIds.has(id) ? '/* @import "tailwindcss"; */' : ''
                    return { code: `${marker}\nglobalThis.styleFixture = true`, moduleType: 'js' }
                }
            },
            { name: styles.name, transform: styles.transform }
        ],
        output: { format: 'es' },
        write: false
    })

    assert.deepEqual(calls.toSorted(), ids.filter(isCSSRequest).toSorted())
    assert.equal(result.output.filter((chunk) => chunk.type === 'chunk' && chunk.isEntry).length, ids.length)
})

test('ordinary CSS clears retained Tailwind candidates while raw requests leave them intact', async () => {
    const root = normalizePath(fileURLToPath(new URL('.', import.meta.url)))
    const entryId = `${root}source-filter-entry.js`
    const styleId = `${root}source-filter-fixture.css`
    const styles = createMiniStylePlugin(contract, [entryId])
    // Model Vite's successful post-CSS boundary without materializing source files or browser output.
    const cssPost: Plugin = { name: 'vite:css-post', transform: (code) => ({ code, map: null }) }
    const configResolved = styles.configResolved
    const buildStart = styles.buildStart
    const transform = styles.transform
    assert.ok(typeof configResolved === 'function' && typeof buildStart === 'function')
    assert.ok(transform && typeof transform === 'object')
    await Reflect.apply(configResolved, {}, [{ build: { minify: false }, plugins: [cssPost] }])
    const capture = cssPost.transform
    assert.ok(typeof capture === 'function')
    const graph = new Map([
        [entryId, { importedIds: [styleId], dynamicallyImportedIds: [] }],
        [styleId, { importedIds: [], dynamicallyImportedIds: [] }]
    ])
    const context = {
        environment: { config: { root } },
        resolve: async (id: string) => ({ id }),
        getModuleInfo: (id: string) => graph.get(id),
        addWatchFile() {}
    }
    await Reflect.apply(buildStart, context, [])
    // Inline candidates and source(none) avoid scanning or writing a fixture project.
    const tailwind = '@import "tailwindcss" source(none);\n@source inline("py-5.5");'
    const compiled: unknown = await Reflect.apply(transform.handler, context, [tailwind, styleId])
    assert.ok(compiled && typeof compiled === 'object' && 'code' in compiled && typeof compiled.code === 'string')
    await Reflect.apply(capture, context, [compiled.code, styleId])
    const artifact = { code: "export const className = 'py-5.5'", filename: 'factory.js', seq: 1 }
    // Publication is captured in memory; no stylesheet writer or watcher is started by this test.
    const published: string[] = []
    const publish = async (css: string) => {
        published.push(css)
    }
    const initial = await styles.finalizeUpdate([artifact], publish)
    assert.match(initial[0].code, /py-5_d5/)
    assert.match(published[0], /\.py-5_d5/)

    const ordinary = '.plain { color: red; }'
    const rawId = `${styleId}?raw#fragment`
    assert.equal(await Reflect.apply(transform.handler, context, [ordinary, rawId]), undefined)
    await Reflect.apply(capture, context, [ordinary, rawId])
    assert.deepEqual(await styles.finalizeUpdate([artifact], publish), initial)
    assert.equal(published.length, 1)

    const updateId = `${styleId}?v=2`
    assert.equal(await Reflect.apply(transform.handler, context, [ordinary, updateId]), undefined)
    await Reflect.apply(capture, context, [ordinary, updateId])
    assert.deepEqual(await styles.finalizeUpdate([artifact], publish), [artifact])
    assert.equal(published.length, 2)
    assert.match(published[1], /\.plain/)
    assert.doesNotMatch(published[1], /py-5_d5/)
})
