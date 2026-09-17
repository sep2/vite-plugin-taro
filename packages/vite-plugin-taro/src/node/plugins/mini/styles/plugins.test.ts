import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { type BuildOptions, build, normalizePath, type Plugin } from 'vite'
import type { MiniContract } from '../mini-contract.ts'
import { createMiniTransformer } from './create-mini-transformer.ts'
import { createMiniStylePlugin, finalizeOutput } from './plugins.ts'

const contract = {
    styles: {
        appFileName: 'app.wxss',
        globalFileName: 'assets/global.wxss'
    }
} satisfies Pick<MiniContract, 'styles'>

test('handles physical and ignored query fragments before watcher cleanup', async () => {
    const styles = createMiniStylePlugin(contract, ['/src/app.js'])
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

test('invalidates Tailwind compiler dependencies through the HMR hook', async () => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'vpt-style-hot-update-')))

    try {
        const styleId = path.join(root, 'app.css')
        const themeId = path.join(root, 'theme.css')
        const source = ['@import "tailwindcss";', '@import "./theme.css";', '@source inline("bg-brand");'].join('\n')
        await writeFile(themeId, '@theme { --color-brand: #123456; }')
        const styles = createMiniStylePlugin(contract, [path.join(root, 'app.ts')])
        const transformHook = styles.transform
        const hotUpdateHook = styles.hotUpdate
        assert.ok(transformHook)
        assert.ok(hotUpdateHook)
        const transform = typeof transformHook === 'function' ? transformHook : transformHook.handler
        const hotUpdate = typeof hotUpdateHook === 'function' ? hotUpdateHook : hotUpdateHook.handler
        // Collect compiler inputs to verify the changed theme is a registered dependency.
        const watchedFiles = new Set<string>()
        const context = {
            environment: { config: { root } },
            addWatchFile(file: string) {
                watchedFiles.add(normalizePath(file))
            }
        }

        const initial = await Reflect.apply(transform, context, [source, styleId])
        assert.match(initial.code, /#123456/)
        assert.ok(watchedFiles.has(normalizePath(themeId)))

        await writeFile(themeId, '@theme { --color-brand: #654321; }')
        await Reflect.apply(hotUpdate, context, [{ file: themeId }])
        const updated = await Reflect.apply(transform, context, [source, styleId])
        assert.match(updated.code, /#654321/)
        assert.doesNotMatch(updated.code, /#123456/)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('transforms WXSS and JavaScript from one supplied class set without source discovery', async () => {
    const transformer = createMiniTransformer()
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

test('finalizes the current graph into native CSS and JavaScript with one projected class set', async () => {
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
        createMiniTransformer(),
        [{ code: "export const className = 'py-5.5'", filename: 'entry.js' }],
        { filename: contract.styles.globalFileName, minify: false }
    )

    assert.match(output.stylesheet, /\.py-5_d5\s*\{/)
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
        createMiniTransformer(),
        [{ code: "export const classes = 'py-5.5 mr-4.5'", filename: 'entry.js' }],
        { filename: contract.styles.globalFileName, minify: false }
    )

    const sharedIndex = output.stylesheet.indexOf('.shared-order')
    const lazyIndex = output.stylesheet.indexOf('.lazy-order')
    const pageIndex = output.stylesheet.indexOf('.page-order')
    assert.ok(sharedIndex >= 0)
    assert.ok(lazyIndex > sharedIndex)
    assert.ok(pageIndex > lazyIndex)
    assert.equal((output.stylesheet.match(/\.shared-order/g) ?? []).length, 1)
    assert.doesNotMatch(output.stylesheet, /\.unreachable/)
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
                createMiniTransformer(),
                [{ code: source, filename: 'entry.js' }],
                { filename: contract.styles.globalFileName, minify: false }
            ),
        Error
    )

    assert.equal(source, "export const = 'py-5.5'")
})

test('rejects the complete style transaction when final native minification fails', async () => {
    await assert.rejects(
        () =>
            finalizeOutput(
                ['/entry.js'],
                new Map(),
                () => ({ importedIds: [], dynamicallyImportedIds: [] }),
                {
                    async transformStylesheet() {
                        return '.broken { color: red; } }'
                    },
                    transformJavaScript() {
                        return assert.fail('JavaScript must not be finalized after failed CSS minification')
                    }
                },
                [{ code: 'export {}', filename: 'entry.js' }],
                { filename: contract.styles.globalFileName, minify: true }
            ),
        Error
    )
})

test('minifies the complete compiler stylesheet before later WX output hooks', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vpt-wxss-'))

    try {
        const sourceRoot = path.join(root, 'src')
        const pageRoot = path.join(sourceRoot, 'pages/example')
        await mkdir(pageRoot, { recursive: true })
        await writeFile(
            path.join(sourceRoot, 'app.ts'),
            "import './app.css';\nimport styles from './card.module.css';\nconsole.log({ className: 'mt-2.5', module: styles.card });\nvoid import('./pages/example/index.ts')\n"
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
        await writeFile(path.join(sourceRoot, 'card.module.css'), '.card { padding: 1px; }\n')
        await writeFile(path.join(pageRoot, 'index.ts'), "import './index.css'\n")
        await writeFile(path.join(pageRoot, 'index.css'), '.page-marker { color: red; }\n')

        const applicationEntry = path.join(sourceRoot, 'app.ts')
        const styles = createMiniStylePlugin(contract, [applicationEntry])
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

        const result = await build({
            root,
            configFile: false,
            logLevel: 'silent',
            plugins: [styles, verifyAssetOwnership],
            build: {
                cssCodeSplit: false,
                cssMinify: true,
                write: false,
                rolldownOptions: {
                    input: applicationEntry
                }
            }
        })

        // Output ownership and contents are build results, not filesystem behavior.
        assert.ok(!Array.isArray(result) && 'output' in result)
        await assert.rejects(access(path.join(root, 'dist')), { code: 'ENOENT' })
        const styleFileNames = result.output
            .filter((asset) => asset.fileName.endsWith('.wxss'))
            .map((asset) => asset.fileName)
            .sort()
        assert.deepEqual(styleFileNames, ['assets/global.wxss'])

        const styleAsset = result.output.find((asset) => asset.fileName === 'assets/global.wxss')
        assert.ok(styleAsset?.type === 'asset')
        const globalStyle = String(styleAsset.source)
        assert.match(globalStyle, /\.app\{margin:32rpx\}/)
        assert.match(globalStyle, /\.mt-2_d5\{/)
        assert.match(globalStyle, /\.page-marker\{/)
        assert.doesNotMatch(globalStyle, /\drem\b/)
        const moduleClassName = /\.([\w-]+)\{padding:1rpx\}/.exec(globalStyle)?.[1]
        assert.ok(moduleClassName)

        const javaScript = result.output
            .filter((chunk) => chunk.type === 'chunk')
            .map((chunk) => chunk.code)
            .join('\n')
        assert.match(javaScript, /mt-2_d5/)
        assert.doesNotMatch(javaScript, /mt-2\.5/)
        assert.ok(javaScript.includes(moduleClassName))
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

const minificationCases = [
    { name: 'default build', build: {}, minified: true },
    { name: 'JavaScript opt-out', build: { minify: false }, minified: false },
    { name: 'CSS opt-out', build: { cssMinify: false }, minified: false },
    { name: 'independent CSS opt-in', build: { minify: false, cssMinify: true }, minified: true },
    { name: 'explicit Lightning CSS', build: { cssMinify: 'lightningcss' }, minified: true }
] as const satisfies readonly Readonly<{ name: string; build: BuildOptions; minified: boolean }>[]

for (const extension of ['wxss', 'acss']) {
    for (const scenario of minificationCases) {
        test(`preserves authored rpx while minifying only global.${extension}: ${scenario.name}`, async () => {
            const root = await mkdtemp(path.join(os.tmpdir(), 'vpt-global-minify-'))
            const appPath = path.join(root, 'app.ts')
            const globalFileName = `assets/global.${extension}`
            const nativeFileName = `components/counter/index.${extension}`
            const nativeStyle = '.native-counter { padding: 1px; }\n'

            try {
                await writeFile(appPath, "import './app.css'\nconsole.log('application')\n")
                await writeFile(
                    path.join(root, 'app.css'),
                    [
                        '.global-marker { margin: 16px; }',
                        '.native-rpx { padding: 12.5rpx; margin-left: -0.5rpx; width: calc(100% - 32rpx); }',
                        '.converted-rem { margin: 1rem; }'
                    ].join('\n')
                )
                const styles = createMiniStylePlugin({ styles: { appFileName: `app.${extension}`, globalFileName } }, [
                    appPath
                ])
                const result = await build({
                    root,
                    configFile: false,
                    logLevel: 'silent',
                    plugins: [
                        {
                            name: 'test:intermediate-css',
                            generateBundle: {
                                order: 'post',
                                handler(_, bundle) {
                                    const intermediate = Object.values(bundle).find(
                                        (asset) => asset.type === 'asset' && asset.fileName.endsWith('.css')
                                    )
                                    assert.equal(intermediate?.type, 'asset')
                                    assert.match(String(intermediate.source), /\.global-marker \{ margin: 16px; \}/)
                                }
                            }
                        },
                        styles,
                        {
                            name: 'test:later-native-output',
                            generateBundle: {
                                order: 'post',
                                handler() {
                                    this.emitFile({ type: 'asset', fileName: nativeFileName, source: nativeStyle })
                                }
                            }
                        }
                    ],
                    build: {
                        ...scenario.build,
                        write: false,
                        cssCodeSplit: false,
                        rolldownOptions: { input: appPath }
                    }
                })
                assert.ok(!Array.isArray(result) && 'output' in result)
                const globalStyle = result.output.find((asset) => asset.fileName === globalFileName)
                const nativeOutput = result.output.find((asset) => asset.fileName === nativeFileName)
                assert.equal(globalStyle?.type, 'asset')
                assert.equal(nativeOutput?.type, 'asset')
                const css = String(globalStyle.source)
                assert.equal(css.includes('.global-marker{margin:16rpx}'), scenario.minified)
                assert.equal(css.includes('.h5-span,.h5-a{display:inline}'), scenario.minified)
                assert.equal(css.includes('.global-marker { margin: 16rpx; }'), !scenario.minified)
                // Authored rpx must survive both conversion and minification, alongside newly converted px/rem values.
                assert.match(css, /\.native-rpx\s*\{\s*padding:\s*12\.5rpx;\s*margin-left:\s*-0?\.5rpx;/)
                assert.match(css, /width:\s*calc\(100% - 32rpx\)/)
                assert.match(css, /\.converted-rem\s*\{\s*margin:\s*32rpx[;}]/)
                assert.doesNotMatch(css, /[\d.](?:px|rem)\b/)
                assert.equal(String(nativeOutput.source), nativeStyle)
                assert.ok(!result.output.some((asset) => asset.fileName.endsWith('.css')))
            } finally {
                await rm(root, { recursive: true, force: true })
            }
        })
    }
}

test('captures CSS minification configured by a later ordinary plugin', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vpt-style-minify-config-'))
    const appPath = path.join(root, 'app.ts')

    try {
        await writeFile(appPath, 'export {}\n')
        const result = await build({
            root,
            configFile: false,
            logLevel: 'silent',
            plugins: [
                createMiniStylePlugin(contract, [appPath]),
                {
                    name: 'test:configure-css-minify',
                    config() {
                        return { build: { cssMinify: true } }
                    }
                }
            ],
            build: { minify: false, write: false, rolldownOptions: { input: appPath } }
        })
        assert.ok(!Array.isArray(result) && 'output' in result)
        const globalStyle = result.output.find((asset) => asset.fileName === contract.styles.globalFileName)
        assert.equal(globalStyle?.type, 'asset')
        assert.match(String(globalStyle.source), /\.h5-span,\.h5-a\{display:inline\}/)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('emits the HTML base once even when the application has no styles', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vpt-empty-wxss-'))

    try {
        const appPath = path.join(root, 'app.ts')
        await writeFile(appPath, 'export {}\n')

        const styles = createMiniStylePlugin(contract, [appPath])
        const result = await build({
            root,
            configFile: false,
            logLevel: 'silent',
            plugins: [styles],
            build: {
                write: false,
                rolldownOptions: {
                    input: appPath
                }
            }
        })

        assert.ok(!Array.isArray(result) && 'output' in result)
        await assert.rejects(access(path.join(root, 'dist')), { code: 'ENOENT' })
        const styleAsset = result.output.find((asset) => asset.fileName === 'assets/global.wxss')
        assert.ok(styleAsset?.type === 'asset')
        const css = String(styleAsset.source)
        assert.equal((css.match(/\.h5-span/g) ?? []).length, 1)
        assert.match(css, /display:\s*inline/)
        assert.doesNotMatch(css, /@layer/)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
