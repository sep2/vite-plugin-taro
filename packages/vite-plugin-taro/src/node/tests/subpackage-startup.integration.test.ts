import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { build } from 'vite'
import vpt from '../../index.ts'
import { createMemoryBuildProject } from './create-memory-build-project.ts'

for (const target of ['wx', 'tt'] as const) {
    test(`${target} registers subpackage pages synchronously and resolves lazy imports through the main transport`, async () => {
        using project = createMemoryBuildProject({
            'src/app.tsx': 'export default function App({ children }) { return children }',
            'src/shared.ts': 'export const shared = {}',
            'src/lazy.ts': 'import { shared } from "./shared"; export const value = shared',
            'src/popup.ts':
                'import { shared } from "./shared"; export const popup = { shared, open: () => import("./lazy").then(m => m.value) }',
            'src/home.tsx': `import { shared } from "./shared"; ${target}.observe('shared', shared); ${target}.observe('open', () => import('./lazy').then(m => m.value)); export default () => null`,
            'src/detail.tsx': `import { popup } from "./popup"; ${target}.observe('detail', popup); export default () => null`,
            'src/list.tsx': `import { popup } from "./popup"; ${target}.observe('list', popup); export default () => null`
        })
        const result = await build({
            root: project.root,
            configFile: false,
            logLevel: 'silent',
            plugins: [
                project.plugin,
                vpt({
                    target,
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
            build: { write: false, minify: true }
        })
        assert.ok(!Array.isArray(result) && 'output' in result)
        const sources = new Map(
            result.output.map((file) => [file.fileName, file.type === 'chunk' ? file.code : String(file.source)])
        )
        const popupChunk = result.output.find(
            (file) => file.type === 'chunk' && file.moduleIds.some((id) => id.endsWith('/src/popup.ts'))
        )
        assert.ok(popupChunk)
        assert.match(popupChunk.fileName, /^orders\/common\//)
        const lazyChunk = result.output.find(
            (file) => file.type === 'chunk' && file.moduleIds.some((id) => id.endsWith('/src/lazy.ts'))
        )
        assert.ok(lazyChunk)
        const manifest = JSON.parse(sources.get('app.json')!)
        const commonRoot =
            target === 'tt' ? manifest.subPackages.find((pkg: { common?: boolean }) => pkg.common)?.root : undefined
        if (target === 'tt') {
            assert.equal(typeof commonRoot, 'string')
        }
        // Each test host owns its CommonJS cache, module observations and synchronous registration count.
        const modules = new Map<string, { exports: unknown }>()
        const observations = new Map<string, unknown>()
        const asyncReads: string[] = []
        let registrations = 0
        const context = createContext({
            global: {},
            performance,
            console: { ...console, info() {} },
            [target]: {
                onBeforePageLoad() {},
                observe(key: string, value: unknown) {
                    observations.set(key, value)
                }
            },
            Page() {
                registrations++
            },
            setTimeout() {},
            clearTimeout() {},
            getCurrentPages() {
                return []
            }
        })
        function load(fileName: string): unknown {
            const cached = modules.get(fileName)
            if (cached) {
                return cached.exports
            }
            const source = sources.get(fileName)
            assert.ok(source, fileName)
            const module: { exports: unknown } = { exports: {} }
            modules.set(fileName, module)
            const execute: unknown = runInContext(`(function(require, module, exports) {\n${source}\n})`, context, {
                filename: fileName
            })
            assert.ok(typeof execute === 'function')
            execute(
                Object.assign(
                    (request: string) => {
                        const target = path.posix.join(path.posix.dirname(fileName), request)
                        assert.ok(
                            !target.startsWith('orders/') || fileName.startsWith('orders/'),
                            `Cross-package sync read: ${fileName} → ${target}`
                        )
                        return load(target)
                    },
                    {
                        async: async (request: string) => {
                            const target = path.posix.join(path.posix.dirname(fileName), request)
                            assert.ok(
                                !commonRoot || target.startsWith(`${commonRoot}/`),
                                `Not a TT common package: ${target}`
                            )
                            asyncReads.push(target)
                            return load(target)
                        }
                    }
                ),
                module,
                module.exports
            )
            return module.exports
        }
        if (target === 'tt') {
            load('home.js')
            const open = observations.get('open')
            assert.equal(registrations, 1)
            assert.deepEqual(asyncReads, [])
            assert.ok(typeof open === 'function')
            assert.strictEqual(await open(), observations.get('shared'))
            assert.deepEqual(asyncReads, [lazyChunk.fileName])
            assert.equal(modules.has(popupChunk.fileName), false)
        }
        load('orders/detail.js')
        assert.equal(registrations, target === 'tt' ? 2 : 1)
        assert.ok(modules.has(popupChunk.fileName))
        load('home.js')
        load('orders/list.js')
        assert.equal(registrations, 3)
        const shared = observations.get('shared')
        const popup = observations.get('detail')
        assert.ok(popup && typeof popup === 'object' && 'shared' in popup)
        assert.strictEqual(popup.shared, shared)
        assert.strictEqual(popup, observations.get('list'))
        assert.deepEqual(
            asyncReads,
            target === 'tt' ? [lazyChunk.fileName] : [],
            'page startup must not add async reads'
        )
        assert.ok('open' in popup && typeof popup.open === 'function')
        assert.strictEqual(await popup.open(), shared)
        assert.deepEqual(asyncReads, [lazyChunk.fileName], 'dynamic import keeps using the main transport')
    })
}
