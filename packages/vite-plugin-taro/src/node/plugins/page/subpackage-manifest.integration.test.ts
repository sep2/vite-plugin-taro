import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'vite'
import { createMemoryBuildProject } from '../../tests/create-memory-build-project.ts'
import vpt from '../../vpt.ts'

for (const target of ['wx', 'zfb', 'tb', 'tt', 'xhs'] as const) {
    test(`${target}: declares page routes relative to each named subpackage`, async () => {
        using project = createMemoryBuildProject({
            'src/app.tsx': 'export default function App({ children }) { return children }',
            'src/home.tsx':
                'export default function Home() { return <button onClick={() => import("./lazy").then(m => m.open())} /> }',
            'src/lazy.ts': 'export function open() { console.log("lazy") }',
            'src/detail.tsx': 'export default function Detail() { return null }',
            'src/history/list.tsx': 'export default function List() { return null }',
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
        const lazy = result.output.find(
            (file) => file.type === 'chunk' && file.moduleIds.some((id) => id.endsWith('/src/lazy.ts'))
        )
        assert.ok(lazy)
        const root = /^(sub\/p_[a-f0-9]{8})\//.exec(lazy.fileName)?.[1]
        assert.equal(Boolean(root), target !== 'xhs')
        assert.deepEqual(manifest.subPackages, [
            { root: 'orders', pages: ['detail', 'history/list'] },
            { root: 'account', pages: ['profile'] },
            ...(root
                ? [
                      {
                          root,
                          pages: [],
                          ...(target === 'wx' ? { name: root.split('/')[1] } : {}),
                          ...(target === 'tt' ? { common: true } : {})
                      }
                  ]
                : [])
        ])
    })
}
