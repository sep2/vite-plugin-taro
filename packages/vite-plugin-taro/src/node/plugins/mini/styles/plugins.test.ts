import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { access, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { type BuildOptions, build, normalizePath, type Plugin } from 'vite'
import { createMiniStyleEntries } from '../../../tests/create-mini-style-entries.ts'
import { projectTempDir } from '../../../tests/project-temp-dir.ts'
import type { MiniContract } from '../mini-contract.ts'
import { createMiniTransformer } from './create-mini-transformer.ts'
import { miniHtmlBase } from './mini-html-base.ts'
import { createMiniStylePlugin } from './plugins.ts'

const contract = {
    styles: {
        appFileName: 'app.wxss',
        globalFileName: 'assets/global.wxss'
    }
} satisfies Pick<MiniContract, 'styles'>

/** Serve ordinary absolute module IDs from memory so the real Vite/CSS transforms still run, without creating source files. */
function createSourceFixture(files: Readonly<Record<string, string>>, entryName: string) {
    const root = path.join(projectTempDir, `vpt-memory-styles-${randomUUID()}`)
    const sources: ReadonlyMap<string, string> = new Map(
        Object.entries(files).map(([file, source]) => [normalizePath(path.join(root, file)), source])
    )
    const plugin: Plugin = {
        name: 'test:memory-style-sources',
        resolveId(id, importer) {
            const resolved = normalizePath(
                importer && id.startsWith('.') ? path.resolve(path.dirname(importer), id) : id
            )
            return sources.has(resolved) ? resolved : undefined
        },
        load(id) {
            return sources.get(normalizePath(id))
        }
    }
    return { root, entry: path.join(root, entryName), plugin }
}

test('handles physical and ignored query fragments before watcher cleanup', async () => {
    const styles = createMiniStylePlugin(contract, createMiniStyleEntries('/src/app.js', []))
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
    const root = await realpath(await mkdtemp(path.join(projectTempDir, 'vpt-style-hot-update-')))

    try {
        const styleId = path.join(root, 'app.css')
        const themeId = path.join(root, 'theme.css')
        const source = ['@import "tailwindcss";', '@import "./theme.css";', '@source inline("bg-brand");'].join('\n')
        await writeFile(themeId, '@theme { --color-brand: #123456; }')
        const styles = createMiniStylePlugin(contract, createMiniStyleEntries(path.join(root, 'app.ts'), []))
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

test('minifies the complete compiler stylesheet before later WX output hooks', async () => {
    const {
        root,
        entry: applicationEntry,
        plugin
    } = createSourceFixture(
        {
            'src/app.ts':
                "import './app.css';\nimport styles from './card.module.css';\nconsole.log({ className: 'mt-2.5', module: styles.card });\nvoid import('./pages/example/index.ts')\n",
            'src/app.css': [
                '@import "tailwindcss/theme.css";',
                '@import "tailwindcss/preflight.css";',
                '@import "tailwindcss/utilities.css";',
                '@source inline("mt-2.5");',
                '.app { margin: 1rem; }'
            ].join('\n'),
            'src/card.module.css': '.card { padding: 1px; }\n',
            'src/pages/example/index.ts': "import './index.css'\n",
            'src/pages/example/index.css': '.page-marker { color: red; }\n'
        },
        'src/app.ts'
    )
    const styles = createMiniStylePlugin(contract, createMiniStyleEntries(applicationEntry, []))
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
        plugins: [plugin, styles, verifyAssetOwnership],
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
    await assert.rejects(access(root), { code: 'ENOENT' })
})

for (const extension of ['wxss', 'acss', 'ttss']) {
    for (const cssCodeSplit of [undefined, true, false]) {
        test(`emits ${extension} with cssCodeSplit=${cssCodeSplit ?? 'default'}`, async () => {
            const css = [
                '.app { color: purple; }',
                '.shared { color: blue; }',
                '.first { color: red; }',
                '.second { color: green; }'
            ]
            const {
                root,
                entry: appId,
                plugin
            } = createSourceFixture(
                {
                    'app.ts': "import './app.css'; console.log('app')",
                    'app.css': css[0]!,
                    'shared.css': css[1]!,
                    'pages/first.ts': "import '../shared.css'; import './first.css'; console.log('first')",
                    'pages/first.css': css[2]!,
                    'pages/second.ts': "import './second.css'; import '../shared.css'; console.log('second')",
                    'pages/second.css': css[3]!
                },
                'app.ts'
            )
            const firstId = path.join(root, 'pages/first.ts')
            const secondId = path.join(root, 'pages/second.ts')
            const globalFileName = `assets/global.${extension}`
            const result = await build({
                root,
                configFile: false,
                logLevel: 'silent',
                plugins: [
                    plugin,
                    createMiniStylePlugin(
                        { styles: { appFileName: `app.${extension}`, globalFileName } },
                        createMiniStyleEntries(appId, [firstId, secondId])
                    )
                ],
                build: {
                    write: false,
                    minify: false,
                    cssCodeSplit,
                    rolldownOptions: { input: { app: appId, first: firstId, second: secondId } }
                }
            })
            assert.ok(!Array.isArray(result) && 'output' in result)
            const styles = result.output.filter((asset) => asset.type === 'asset')
            assert.deepEqual(styles.map((asset) => asset.fileName).sort(), [
                globalFileName,
                `pages/page-0/index.${extension}`,
                `pages/page-1/index.${extension}`
            ])
            const byName = new Map(styles.map((asset) => [asset.fileName, String(asset.source)]))
            const transformer = createMiniTransformer()
            if (cssCodeSplit === false) {
                assert.equal(
                    byName.get(globalFileName),
                    `${miniHtmlBase}\n${await transformer.transformStylesheet(css.join('\n'))}`
                )
                assert.equal(byName.get(`pages/page-0/index.${extension}`), '')
                assert.equal(byName.get(`pages/page-1/index.${extension}`), '')
            } else {
                assert.equal(
                    byName.get(globalFileName),
                    `${miniHtmlBase}\n${await transformer.transformStylesheet(css[0]!)}`
                )
                assert.equal(
                    byName.get(`pages/page-0/index.${extension}`),
                    await transformer.transformStylesheet(`${css[1]}\n${css[2]}`)
                )
                assert.equal(
                    byName.get(`pages/page-1/index.${extension}`),
                    await transformer.transformStylesheet(`${css[3]}\n${css[1]}`)
                )
                assert.doesNotMatch(byName.get(globalFileName)!, /\.(?:shared|first|second)\b/)
                assert.doesNotMatch(byName.get(`pages/page-0/index.${extension}`)!, /\.h5-span|\.app\b|\.second\b/)
                assert.doesNotMatch(byName.get(`pages/page-1/index.${extension}`)!, /\.h5-span|\.app\b|\.first\b/)
            }
            await assert.rejects(access(root), { code: 'ENOENT' })
        })
    }
}

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
            const {
                root,
                entry: appPath,
                plugin
            } = createSourceFixture(
                {
                    'app.ts': "import './app.css'\nconsole.log('application')\n",
                    'app.css': [
                        '.global-marker { margin: 16px; }',
                        '.native-rpx { padding: 12.5rpx; margin-left: -0.5rpx; width: calc(100% - 32rpx); }',
                        '.converted-rem { margin: 1rem; }'
                    ].join('\n')
                },
                'app.ts'
            )
            const globalFileName = `assets/global.${extension}`
            const nativeFileName = `components/counter/index.${extension}`
            const nativeStyle = '.native-counter { padding: 1px; }\n'

            const styles = createMiniStylePlugin(
                { styles: { appFileName: `app.${extension}`, globalFileName } },
                createMiniStyleEntries(appPath, [])
            )
            const result = await build({
                root,
                configFile: false,
                logLevel: 'silent',
                plugins: [
                    plugin,
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
            await assert.rejects(access(root), { code: 'ENOENT' })
        })
    }
}

test('captures CSS minification and splitting configured by a later ordinary plugin', async () => {
    const {
        root,
        entry: appPath,
        plugin
    } = createSourceFixture(
        {
            'app.ts': 'export {}\n',
            'page.ts': "import './page.css'; console.log('page')",
            'page.css': '.page { padding: 4px; }'
        },
        'app.ts'
    )
    const pagePath = path.join(root, 'page.ts')
    const result = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
            plugin,
            createMiniStylePlugin(contract, createMiniStyleEntries(appPath, [pagePath])),
            {
                name: 'test:configure-css-output',
                config() {
                    return { build: { cssMinify: true, cssCodeSplit: false } }
                }
            }
        ],
        build: {
            minify: false,
            cssCodeSplit: true,
            write: false,
            rolldownOptions: { input: { app: appPath, page: pagePath } }
        }
    })
    assert.ok(!Array.isArray(result) && 'output' in result)
    const globalStyle = result.output.find((asset) => asset.fileName === contract.styles.globalFileName)
    const pageStyle = result.output.find((asset) => asset.fileName === 'pages/page-0/index.wxss')
    assert.equal(globalStyle?.type, 'asset')
    assert.equal(pageStyle?.type, 'asset')
    assert.match(String(globalStyle.source), /\.h5-span,\.h5-a\{display:inline\}/)
    assert.match(String(globalStyle.source), /\.page\{padding:4rpx\}/)
    assert.equal(String(pageStyle.source), '')
    await assert.rejects(access(root), { code: 'ENOENT' })
})

test('emits the HTML base once even when the application has no styles', async () => {
    const { root, entry: appPath, plugin } = createSourceFixture({ 'app.ts': 'export {}\n' }, 'app.ts')

    const styles = createMiniStylePlugin(contract, createMiniStyleEntries(appPath, []))
    const result = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin, styles],
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
    await assert.rejects(access(root), { code: 'ENOENT' })
})
