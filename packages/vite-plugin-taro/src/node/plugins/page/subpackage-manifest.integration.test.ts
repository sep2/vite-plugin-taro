import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'vite'
import { createMemoryBuildProject } from '../../tests/create-memory-build-project.ts'
import vpt from '../../vpt.ts'

for (const target of ['wx', 'zfb', 'tb', 'tt', 'xhs'] as const) {
    test(`${target}: places page entries and their dependencies according to the subpackage manifest`, async () => {
        using project = createMemoryBuildProject({
            'src/app.tsx': 'export default function App({ children }) { return children }',
            'src/home.tsx':
                'import {shared} from "./shared"; export default function Home() { return <button onClick={() => import("./lazy").then(m => m.open())}>{shared}</button> }',
            'src/lazy.ts': 'export function open() { console.log("lazy") }',
            'src/popup.ts': 'export const popup = Math.random()',
            'src/shared.ts': 'export const shared = Math.random()',
            'src/detail.tsx':
                'import {popup} from "./popup"; import {shared} from "./shared"; export default function Detail() { return popup + shared }',
            'src/history/list.tsx': 'import {popup} from "../popup"; export default function List() { return popup }',
            'src/profile.tsx': 'export default function Profile() { return null }'
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
                        { path: 'detail', subpackage: 'orders' },
                        { path: 'profile', subpackage: 'account' },
                        { path: 'home', entry: true },
                        { path: 'history/list', subpackage: 'orders' }
                    ],
                    appJson: {},
                    projectConfigJson: {}
                })
            ],
            build: { write: false }
        })
        assert.ok(!Array.isArray(result) && 'output' in result)
        const app = result.output.find((file) => file.fileName === 'app.json')
        assert.ok(app?.type === 'asset')
        const manifest = JSON.parse(String(app.source))
        assert.deepEqual(manifest.pages, ['home'])
        const chunks = result.output.filter((file) => file.type === 'chunk')
        function moduleFile(name: string): string {
            const chunk = chunks.find((file) => file.moduleIds.some((id) => id.endsWith(`/src/${name}.ts`)))
            assert.ok(chunk, name)
            return chunk.fileName
        }
        assert.match(moduleFile('popup'), /^orders\/common\//)
        assert.match(moduleFile('shared'), /^common\//)
        assert.match(moduleFile('lazy'), target === 'xhs' ? /^common\// : /^(orders|account)\/common\//)
        const files = new Set(chunks.map((chunk) => chunk.fileName))
        for (const route of ['home', 'orders/detail', 'orders/history/list', 'account/profile']) {
            assert.ok(files.has(`${route}.js`), route)
            assert.ok(files.has(`${route}-capsule.js`), route)
        }
        const transport = result.output.find((file) => file.fileName === 'common/vpt-transport.js')
        assert.ok(transport?.type === 'asset')
        assert.ok(String(transport.source).includes('case "orders/detail-capsule.js":'))
        assert.deepEqual(manifest.subPackages, [
            { root: 'orders', pages: ['detail', 'history/list'] },
            { root: 'account', pages: ['profile'] }
        ])
    })
}
