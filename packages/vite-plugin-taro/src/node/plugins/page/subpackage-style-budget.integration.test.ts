import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build } from 'vite'
import { createMemoryBuildProject } from '../../tests/create-memory-build-project.ts'
import { createTestProject } from '../../tests/create-test-project.ts'
import { publishSourceGeneration } from '../../tests/publish-source-generation.ts'
import vpt from '../../vpt.ts'
import { pageStyleBytesKey } from '../mini/styles/page-style-bytes.ts'

for (const [cssCodeSplit, characters, pinnedOverBudget] of [
    [true, 300_000, false],
    [true, 320_000, true],
    [false, 320_000, false]
] as const) {
    test(`WX budgets emitted page CSS: ${characters} multibyte characters, split=${cssCodeSplit}`, async () => {
        // Both pages own the same stylesheet. Only split mode emits both copies into orders.
        using project = createMemoryBuildProject({
            'src/app.tsx': 'export default ({children}) => children',
            'src/home.tsx': 'export default () => null',
            'src/list.tsx': 'import "./shared.css"; export default () => null',
            'src/detail.tsx':
                'import "./shared.css"; export default () => <button onClick={() => import("./lazy").then(m => m.open())} />',
            'src/shared.css': `.order::before { content: "${'单'.repeat(characters)}"; }`,
            'src/lazy.ts': `export function open() { console.log("${'a'.repeat(150_000)}") }`
        })
        // Collect placement diagnostics independently of Vite's console filtering.
        const warnings: string[] = []
        const result = await build({
            root: project.root,
            configFile: false,
            logLevel: 'silent',
            plugins: [
                project.plugin,
                vpt({
                    target: 'wx',
                    app: 'src/app.tsx',
                    pages: [
                        { path: 'home' },
                        { path: 'detail', subpackage: 'orders' },
                        { path: 'list', subpackage: 'orders' }
                    ],
                    appJson: {},
                    projectConfigJson: {}
                })
            ],
            build: {
                write: false,
                cssCodeSplit,
                rolldownOptions: {
                    onLog(level, log, handler) {
                        if (level === 'warn') {
                            warnings.push(log.message)
                        }
                        handler(level, log)
                    }
                }
            }
        })
        assert.ok(!Array.isArray(result) && 'output' in result)
        const pageBytes = result.output.reduce(
            (bytes, file) =>
                bytes +
                (file.type === 'asset' && /^orders\/.*\.wxss$/.test(file.fileName)
                    ? Buffer.byteLength(file.source)
                    : 0),
            0
        )
        assert.equal(pageBytes > 1_900_000, pinnedOverBudget)
        assert.equal(
            warnings.some((message) => message.includes('Page subpackage "orders"')),
            pinnedOverBudget
        )
        const lazy = result.output.find(
            (file) => file.type === 'chunk' && file.moduleIds.some((id) => id.endsWith('/src/lazy.ts'))
        )
        assert.ok(lazy)
        assert.match(lazy.fileName, cssCodeSplit ? /^sub\/p_\w+\// : /^orders\//)
    })
}

test('CSS-only rebuilds refresh Page shell metadata before placement', { timeout: 20_000 }, async (t) => {
    const root = await createTestProject('page-style-budget-')
    const cssFile = path.join(root, 'src/detail.css')
    await mkdir(path.dirname(cssFile))
    await Promise.all(
        Object.entries({
            'app.tsx': 'export default ({children}) => children',
            'home.tsx': 'export default () => null',
            'detail.tsx':
                'import "./detail.css"; export default () => <button onClick={() => import("./lazy").then(m => m.open())} />',
            'lazy.ts': `export function open() { console.log("${'a'.repeat(150_000)}") }`,
            'detail.css': '.order { color: red }'
        }).map(([name, source]) => writeFile(path.join(root, 'src', name), source))
    )
    // Each completed watch output supplies the lazy chunk location for that exact CSS generation.
    let completed = Promise.withResolvers<void>()
    let lazyFile = ''
    const watcher = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
            vpt({
                target: 'wx',
                app: 'src/app.tsx',
                pages: [{ path: 'home' }, { path: 'detail', subpackage: 'orders' }],
                appJson: {},
                projectConfigJson: {}
            }),
            {
                name: 'test:page-style-budget',
                generateBundle: {
                    order: 'post',
                    handler(_, bundle) {
                        const files = Object.values(bundle)
                        const shell = bundle['orders/detail.js']
                        const css = bundle['orders/detail.wxss']
                        assert.ok(shell?.type === 'chunk' && shell.facadeModuleId && css?.type === 'asset')
                        assert.equal(
                            this.getModuleInfo(shell.facadeModuleId)?.meta[pageStyleBytesKey],
                            Buffer.byteLength(css.source)
                        )
                        const lazy = files.find(
                            (file) => file.type === 'chunk' && file.moduleIds.some((id) => id.endsWith('/lazy.ts'))
                        )
                        assert.ok(lazy)
                        lazyFile = lazy.fileName
                    }
                }
            }
        ],
        build: { watch: {}, write: false }
    })
    assert.ok(!Array.isArray(watcher) && 'on' in watcher)
    t.after(() => watcher.close())
    watcher.on('event', (event) => {
        if (event.code === 'ERROR') {
            completed.reject(event.error)
        } else if (event.code === 'END') {
            completed.resolve()
        }
    })
    await completed.promise
    assert.match(lazyFile, /^orders\//)
    for (const [source, location] of [
        [`.order::before { content: "${'单'.repeat(600_000)}" }`, /^sub\/p_/],
        ['', /^orders\//]
    ] as const) {
        completed = Promise.withResolvers<void>()
        await publishSourceGeneration(cssFile, source)
        await completed.promise
        assert.match(lazyFile, location)
    }
})
