import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build, normalizePath, type Plugin } from 'vite'
import { createWxTransformer } from './create-wx-transformer.ts'
import { createWxStylePlugin, finalizeOutput, generateTailwindRoot } from './plugins.ts'

test('propagates Tailwind generation failures from the authoritative source scan', async () => {
    const failure = new Error('Tailwind generation failed')
    const generator = {
        async generate(): Promise<never> {
            throw failure
        }
    }

    await assert.rejects(generateTailwindRoot(generator), (error) => error === failure)
})

test('handles physical and ignored query fragments before watcher cleanup', async () => {
    const styles = createWxStylePlugin(['/src/app.js'])
    const transformHook = styles.transform
    assert.ok(transformHook)
    const transform = typeof transformHook === 'function' ? transformHook : transformHook.handler

    assert.equal(await Reflect.apply(transform, {}, ['.module {}', '/src/app.css?module#fragment']), undefined)
    assert.equal(await Reflect.apply(transform, {}, ['.module {}', '/src/app.css?module']), undefined)
    assert.equal(await Reflect.apply(transform, {}, ['.raw {}', '/src/app.css?raw#fragment']), undefined)
    assert.equal(await Reflect.apply(transform, {}, ['export {}', '/src/app.ts']), undefined)

    const closeWatcherHook = styles.closeWatcher
    assert.ok(closeWatcherHook)
    const closeWatcher = typeof closeWatcherHook === 'function' ? closeWatcherHook : closeWatcherHook.handler

    await Reflect.apply(closeWatcher, {}, [])
    await Reflect.apply(closeWatcher, {}, [])
})

test('transforms WXSS and JavaScript from one supplied class set without source discovery', async () => {
    const transformer = createWxTransformer()
    const classSet = new Set(['py-5.5'])
    const style = await transformer.transformStylesheet('.py-5\\.5 { padding: 1px; }')
    const javaScript = transformer.transformJavaScript({
        classSet,
        code: "export const className = 'py-5.5'",
        filename: 'entry.js'
    })

    assert.match(style, /\.py-5_d5\s*\{/)
    assert.equal(javaScript, "export const className = 'py-5_d5'")
})

test('finalizes the current graph into WXSS and JavaScript with one projected class set', async () => {
    const entryId = '/src/app.js'
    const styleId = '/src/app.css'
    const output = await finalizeOutput(
        [entryId],
        new Map([
            [
                styleId,
                {
                    css: '.py-5\\.5 { padding-top: 1px; }',
                    tailwind: { classSet: new Set(['py-5.5']) }
                }
            ]
        ]),
        (moduleId) => {
            if (moduleId === entryId) {
                return { importedIds: [styleId], dynamicallyImportedIds: [] }
            }
            if (moduleId === styleId) {
                return { importedIds: [], dynamicallyImportedIds: [] }
            }
        },
        createWxTransformer(),
        [{ code: "export const className = 'py-5.5'", filename: 'entry.js' }]
    )

    assert.match(output.wxss, /\.py-5_d5\s*\{/)
    assert.deepEqual(output.javaScript, ["export const className = 'py-5_d5'"])
})

test('projects cyclic multi-entry graphs in dependency-first order without duplicate or unreachable styles', async () => {
    const moduleGraph = new Map<
        string,
        Readonly<{ importedIds: readonly string[]; dynamicallyImportedIds: readonly string[] }>
    >([
        ['/entry-a.js', { importedIds: ['/shared.css?from=a'], dynamicallyImportedIds: ['/lazy.js'] }],
        ['/shared.css?from=a', { importedIds: [], dynamicallyImportedIds: [] }],
        ['/lazy.js', { importedIds: ['/lazy.css'], dynamicallyImportedIds: ['/entry-a.js'] }],
        ['/lazy.css', { importedIds: [], dynamicallyImportedIds: [] }],
        ['/entry-b.js', { importedIds: ['/shared.css?from=b', '/page.css'], dynamicallyImportedIds: [] }],
        ['/shared.css?from=b', { importedIds: [], dynamicallyImportedIds: [] }],
        ['/page.css', { importedIds: [], dynamicallyImportedIds: [] }]
    ])
    const output = await finalizeOutput(
        ['/entry-a.js', '/entry-b.js', '/missing-entry.js'],
        new Map([
            [
                '/shared.css',
                {
                    css: '.shared-order { color: red; } .py-5\\.5 { padding: 1px; }',
                    tailwind: { classSet: new Set(['py-5.5']) }
                }
            ],
            ['/lazy.css', { css: '.lazy-order { color: blue; }', tailwind: undefined }],
            ['/page.css', { css: '.page-order { color: green; }', tailwind: undefined }],
            [
                '/unreachable.css',
                {
                    css: '.unreachable { color: black; }',
                    tailwind: { classSet: new Set(['mr-4.5']) }
                }
            ]
        ]),
        (moduleId) => moduleGraph.get(moduleId),
        createWxTransformer(),
        [{ code: "export const classes = 'py-5.5 mr-4.5'", filename: 'entry.js' }]
    )

    const sharedIndex = output.wxss.indexOf('.shared-order')
    const lazyIndex = output.wxss.indexOf('.lazy-order')
    const pageIndex = output.wxss.indexOf('.page-order')
    assert.ok(sharedIndex >= 0)
    assert.ok(lazyIndex > sharedIndex)
    assert.ok(pageIndex > lazyIndex)
    assert.equal((output.wxss.match(/\.shared-order/g) ?? []).length, 1)
    assert.doesNotMatch(output.wxss, /\.unreachable/)
    assert.match(output.javaScript[0] ?? '', /py-5_d5/)
    assert.match(output.javaScript[0] ?? '', /mr-4\.5/)
})

test('rejects the complete style transaction when JavaScript conversion fails', async () => {
    const source = "export const = 'py-5.5'"

    await assert.rejects(
        () =>
            finalizeOutput(
                ['/entry.js'],
                new Map([
                    [
                        '/entry.js',
                        {
                            css: '.py-5\\.5 { padding: 1px; }',
                            tailwind: { classSet: new Set(['py-5.5']) }
                        }
                    ]
                ]),
                (moduleId) => (moduleId === '/entry.js' ? { importedIds: [], dynamicallyImportedIds: [] } : undefined),
                createWxTransformer(),
                [{ code: source, filename: 'entry.js' }]
            ),
        Error
    )

    assert.equal(source, "export const = 'py-5.5'")
})

test('finalizes the complete compiler stylesheet before later WX output hooks', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vpt-wxss-'))

    try {
        const sourceRoot = path.join(root, 'src')
        const pageRoot = path.join(sourceRoot, 'pages/example')
        await mkdir(pageRoot, { recursive: true })
        await writeFile(
            path.join(sourceRoot, 'app.ts'),
            "import './app.css';\nconsole.log({ className: 'mt-2.5' });\nvoid import('./pages/example/index.ts')\n"
        )
        await writeFile(
            path.join(sourceRoot, 'app.css'),
            [
                '@import "tailwindcss/theme.css";',
                '@import "tailwindcss/preflight.css";',
                '@import "tailwindcss/utilities.css";',
                '@source inline("mt-2.5");',
                '.app { margin: 1rem; }'
            ].join('\n')
        )
        await writeFile(path.join(pageRoot, 'index.ts'), "import './index.css'\n")
        await writeFile(path.join(pageRoot, 'index.css'), '.page-marker { color: red; }\n')

        const applicationEntry = path.join(sourceRoot, 'app.ts')
        const styles = createWxStylePlugin([applicationEntry])
        const verifyAssetOwnership: Plugin = {
            name: 'test:verify-wx-style-ownership',
            generateBundle: {
                order: 'post',
                handler(_, bundle) {
                    const globalStyle = bundle['assets/global.wxss']
                    assert.equal(globalStyle?.type, 'asset')
                }
            }
        }

        await build({
            root,
            logLevel: 'silent',
            plugins: [styles, verifyAssetOwnership],
            build: {
                cssCodeSplit: false,
                cssMinify: false,
                outDir: 'dist',
                rolldownOptions: {
                    input: applicationEntry
                }
            }
        })

        const outputRoot = path.join(root, 'dist')
        const styleFileNames = (await readdir(outputRoot, { recursive: true }))
            .filter((fileName) => fileName.endsWith('.wxss'))
            .map(normalizePath)
            .sort()
        assert.deepEqual(styleFileNames, ['assets/global.wxss'])

        const globalStyle = await readFile(path.join(outputRoot, 'assets/global.wxss'), 'utf8')
        assert.match(globalStyle, /\.app\s*\{\s*margin:\s*32rpx;/)
        assert.match(globalStyle, /\.mt-2_d5\s*\{/)
        assert.match(globalStyle, /\.page-marker\s*\{/)
        assert.doesNotMatch(globalStyle, /\drem\b/)

        const javaScript = (
            await Promise.all(
                (
                    await readdir(outputRoot, { recursive: true })
                )
                    .filter((fileName) => fileName.endsWith('.js'))
                    .map((fileName) => readFile(path.join(outputRoot, fileName), 'utf8'))
            )
        ).join('\n')
        assert.match(javaScript, /mt-2_d5/)
        assert.doesNotMatch(javaScript, /mt-2\.5/)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('emits an empty global stylesheet when the application has no styles', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vpt-empty-wxss-'))

    try {
        const appPath = path.join(root, 'app.ts')
        await writeFile(appPath, 'export {}\n')

        const styles = createWxStylePlugin([appPath])
        await build({
            root,
            logLevel: 'silent',
            plugins: [styles],
            build: {
                outDir: 'dist',
                rolldownOptions: {
                    input: appPath
                }
            }
        })

        assert.equal(await readFile(path.join(root, 'dist/assets/global.wxss'), 'utf8'), '')
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
