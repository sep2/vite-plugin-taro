import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build, createServer, type Rolldown } from 'vite'
import { createTestProject } from '../../tests/create-test-project.ts'
import { publishSourceGeneration } from '../../tests/publish-source-generation.ts'
import vpt from '../../vpt.ts'
import { miniAppShellId, miniBootstrapId } from './module/module.ts'

test('builds the App and infrastructure with an omitted page list', async () => {
    const root = await createTestProject('mini-empty-app-')
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, 'src/app.tsx'), 'export default function App({ children }) { return children }')
    const result = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vpt({ target: 'wx', app: 'src/app.tsx', appJson: {}, projectConfigJson: {} })],
        build: { write: false, minify: false }
    })
    assert.ok(!Array.isArray(result) && 'output' in result)
    const app = result.output.find((file) => file.fileName === 'app.json')
    assert.ok(app?.type === 'asset')
    assert.deepEqual(JSON.parse(String(app.source)).pages, [])
    for (const fileName of ['app.js', 'app-capsule.js', 'comp.js', 'component-capsule.js', 'custom-wrapper.js']) {
        assert.ok(
            result.output.some((file) => file.type === 'chunk' && file.fileName === fileName),
            fileName
        )
    }
})

test('serve registers configured pages before publishing startup output', { timeout: 20_000 }, async (context) => {
    const root = await createTestProject('mini-app-session-')
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, 'src/app.tsx'), 'export default function App({ children }) { return children }')
    await writeFile(path.join(root, 'src/home.tsx'), 'export default function Home() { return null; }')
    // Verify that server initialization captures pages before the App entry is loaded.
    let pageReads = 0
    const completed = Promise.withResolvers<void>()
    const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
            vpt({
                target: 'wx',
                app: 'src/app.tsx',
                get pages() {
                    pageReads += 1
                    return [{ path: 'home', config: { navigationBarTitleText: 'Home' } }]
                },
                appJson: {},
                projectConfigJson: {}
            }),
            {
                name: 'test:app-session-output',
                generateBundle: {
                    order: 'post',
                    handler(_options, bundle) {
                        const home = bundle['home.json']
                        assert.ok(home?.type === 'asset')
                        assert.equal(JSON.parse(String(home.source)).navigationBarTitleText, 'Home')
                        completed.resolve()
                    }
                }
            }
        ],
        server: { host: '127.0.0.1', port: 0 }
    })
    context.after(() => server.close())
    assert.equal(pageReads, 1)
    await server.listen()
    await completed.promise
    assert.equal(pageReads, 1)
})

for (const [target, styleExtension] of [
    ['wx', 'wxss'],
    ['zfb', 'acss'],
    ['tb', 'acss'],
    ['tt', 'ttss'],
    ['xhs', 'css']
] as const) {
    test(`${target}: retains App-owned entries and styles across watch builds and App reloads`, {
        timeout: 20_000
    }, async (context) => {
        const root = await createTestProject('mini-app-entries-')
        const titleKey = target === 'zfb' || target === 'tb' ? 'defaultTitle' : 'navigationBarTitleText'
        const sources = {
            'app-input.txt': 'initial',
            'src/app.tsx': 'export default function App({ children }) { return children }',
            'src/pages/home.tsx': `
                import { View } from '@tarojs/components'
                import { lazy } from 'react'
                import './home.css'
                const Feature = lazy(() => import('../feature'))
                export default function Home() { return <View className="home">first-home<Feature /></View> }
            `,
            'src/pages/home.css': '.home { color: red; }',
            'src/pages/updated-home.css': '.home { color: green; }',
            'src/feature.tsx': 'export default function Feature() { return "lazy-feature" }',
            'src/pages/detail.tsx': `
                import { View } from '@tarojs/components'
                import './detail.css'
                export default function Detail() { return <View className="detail">detail-page</View> }
            `,
            'src/pages/detail.css': '.detail { color: blue; }'
        }
        await Promise.all(
            Object.entries(sources).map(async ([file, source]) => {
                const filename = path.join(root, file)
                await mkdir(path.dirname(filename), { recursive: true })
                await writeFile(filename, source)
            })
        )

        // Each completed build publishes its bundle; the next save gets a fresh completion promise.
        let output: Rolldown.OutputBundle = {}
        let completed = Promise.withResolvers<void>()
        // The fixture-owned dependency forces an App shell reload independently of Page edits.
        let appLoads = 0
        const watcher = await build({
            root,
            configFile: false,
            logLevel: 'silent',
            plugins: [
                vpt({
                    target,
                    app: 'src/app.tsx',
                    pages: [
                        { path: 'pages/detail' },
                        { path: 'pages/home', entry: true, config: { [titleKey]: 'Home' } }
                    ],
                    appJson: {},
                    projectConfigJson: {}
                }),
                {
                    name: 'test:app-entry-output',
                    options(options) {
                        assert.deepEqual(options.input, { 'app.js': miniAppShellId })
                    },
                    load(id) {
                        if (id === miniAppShellId) {
                            appLoads += 1
                            this.addWatchFile(path.join(root, 'app-input.txt'))
                        }
                    },
                    generateBundle: {
                        order: 'post',
                        handler(_options, bundle) {
                            output = bundle
                        }
                    }
                }
            ],
            build: { watch: {}, outDir: 'dist', minify: false, cssMinify: false }
        })
        assert.ok(!Array.isArray(watcher) && 'on' in watcher)
        context.after(() => watcher.close())
        watcher.on('event', (event) => {
            if (event.code === 'ERROR') {
                completed.reject(event.error)
            } else if (event.code === 'END') {
                completed.resolve()
            }
        })

        for (const change of [
            undefined,
            {
                file: 'src/pages/home.tsx',
                source: sources['src/pages/home.tsx']
                    .replaceAll('first-home', 'second-home')
                    .replace('./home.css', './updated-home.css')
            },
            { file: 'app-input.txt', source: 'reload' }
        ]) {
            if (change) {
                completed = Promise.withResolvers<void>()
                await publishSourceGeneration(path.join(root, change.file), change.source)
            }
            const marker = change ? 'second-home' : 'first-home'
            await completed.promise
            const app = JSON.parse(await readFile(path.join(root, 'dist/app.json'), 'utf8'))
            assert.deepEqual(app.pages, ['pages/home', 'pages/detail'])
            const home = JSON.parse(await readFile(path.join(root, 'dist/pages/home.json'), 'utf8'))
            assert.equal(home[titleKey], 'Home')
            const bootstrap = Object.values(output).find(
                (file) => file.type === 'chunk' && file.facadeModuleId === miniBootstrapId
            )
            assert.ok(bootstrap?.type === 'chunk' && bootstrap.exports.includes('System'))
            for (const fileName of [
                'app.js',
                'app-capsule.js',
                bootstrap.fileName,
                'comp.js',
                'component-capsule.js',
                'custom-wrapper.js'
            ]) {
                const chunk = output[fileName]
                assert.ok(chunk?.type === 'chunk' && chunk.isEntry, fileName)
                assert.equal(await readFile(path.join(root, 'dist', fileName), 'utf8'), chunk.code)
            }
            for (const page of ['home', 'detail']) {
                for (const suffix of ['.js', '-capsule.js']) {
                    const fileName = `pages/${page}${suffix}`
                    const chunk = output[fileName]
                    assert.ok(chunk?.type === 'chunk' && chunk.isEntry, fileName)
                    assert.equal(await readFile(path.join(root, 'dist', fileName), 'utf8'), chunk.code)
                }
                const style = await readFile(path.join(root, `dist/pages/${page}.${styleExtension}`), 'utf8')
                if (page === 'home') {
                    assert.match(style, change ? /green/ : /red/)
                    if (change) {
                        assert.doesNotMatch(style, /red/)
                    }
                } else {
                    assert.match(style, /blue/)
                }
            }
            const javascript = Object.values(output)
                .flatMap((file) => (file.type === 'chunk' ? [file.code] : []))
                .join('\n')
            assert.ok(javascript.includes(marker))
            assert.ok(javascript.includes('detail-page'))
            assert.ok(javascript.includes('lazy-feature'))
        }
        assert.ok(appLoads >= 2, 'The App dependency change reloads its owning shell')
    })
}
