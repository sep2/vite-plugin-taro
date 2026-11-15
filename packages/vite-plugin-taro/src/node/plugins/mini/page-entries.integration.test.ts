import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build, type Rolldown } from 'vite'
import { createTestProject } from '../../tests/create-test-project.ts'
import { publishSourceGeneration } from '../../tests/publish-source-generation.ts'
import vpt from '../../vpt.ts'

for (const [target, styleExtension] of [
    ['wx', 'wxss'],
    ['zfb', 'acss'],
    ['tb', 'acss'],
    ['tt', 'ttss'],
    ['xhs', 'css']
] as const) {
    test(`${target}: emits Page entries and styles on successive watch builds`, {
        timeout: 20_000
    }, async (context) => {
        const root = await createTestProject('mini-page-entries-')
        const sources = {
            'src/app.tsx': 'export default function App({ children }) { return children }',
            'src/pages/home.tsx': `
                import { View } from '@tarojs/components'
                import './home.css'
                export default function Home() { return <View className="home">first-home</View> }
            `,
            'src/pages/home.css': '.home { color: red; }',
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
        const watcher = await build({
            root,
            configFile: false,
            logLevel: 'silent',
            plugins: [
                vpt({
                    target,
                    app: 'src/app.tsx',
                    pages: [{ path: 'pages/detail' }, { path: 'pages/home', entry: true }],
                    appJson: {},
                    projectConfigJson: {}
                }),
                {
                    name: 'test:page-entry-output',
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

        for (const marker of ['first-home', 'second-home']) {
            if (marker === 'second-home') {
                completed = Promise.withResolvers<void>()
                await publishSourceGeneration(
                    path.join(root, 'src/pages/home.tsx'),
                    sources['src/pages/home.tsx'].replace('first-home', marker)
                )
            }
            await completed.promise
            const app = JSON.parse(await readFile(path.join(root, 'dist/app.json'), 'utf8'))
            assert.deepEqual(app.pages, ['pages/home', 'pages/detail'])
            for (const page of ['home', 'detail']) {
                for (const suffix of ['.js', '-capsule.js']) {
                    const fileName = `pages/${page}${suffix}`
                    const chunk = output[fileName]
                    assert.ok(chunk?.type === 'chunk' && chunk.isEntry, fileName)
                    assert.equal(await readFile(path.join(root, 'dist', fileName), 'utf8'), chunk.code)
                }
                const style = await readFile(path.join(root, `dist/pages/${page}.${styleExtension}`), 'utf8')
                assert.match(style, page === 'home' ? /red/ : /blue/)
            }
            const javascript = Object.values(output)
                .flatMap((file) => (file.type === 'chunk' ? [file.code] : []))
                .join('\n')
            assert.ok(javascript.includes(marker))
            assert.ok(javascript.includes('detail-page'))
        }
    })
}
