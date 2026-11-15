import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { createTestProject } from '../../tests/create-test-project.ts'
import vpt from '../../vpt.ts'
import { resolvePages } from './resolve-pages.ts'

/** Creates source fixtures in the test process's disposable plugin workspace. */
async function createProject(files: Record<string, string>): Promise<string> {
    const root = await createTestProject('automatic-pages-')
    await Promise.all(
        Object.entries(files).map(async ([name, source]) => {
            const filename = path.join(root, name)
            await mkdir(path.dirname(filename), { recursive: true })
            await writeFile(filename, source)
        })
    )
    return root
}

for (const pages of [[], [{ path: 'pages/manual', entry: true, config: { title: 'Manual' } }]]) {
    test(`uses an explicit list of ${pages.length} pages independently of discovered declarations`, async () => {
        const root = await createProject({
            'src/pages/discovered.tsx': `
                import { defineVptPage } from 'virtual:vpt';
                throw new Error('Discovered module evaluated');
                defineVptPage(() => { throw new Error('Discovered factory evaluated'); });
            `
        })
        Object.freeze(pages)
        const result = await resolvePages({ pages, root, target: 'wx' })
        assert.deepEqual(result, pages)
        assert.equal(result[0], pages[0])
    })
}

test('discovers declarations and applies entry ordering after evaluation', async () => {
    const root = await createProject({
        'src/pages/a.tsx': `import { defineVptPage } from 'virtual:vpt'; defineVptPage(() => ({ config: { title: 'A' } }));`,
        'src/pages/b.tsx': `import * as api from 'virtual:vpt'; api.defineVptPage(async ({ target }) => ({ entry: target === 'wx', config: { title: 'B' } }));`,
        'src/pages/c.tsx': `import { defineVptPage } from 'virtual:vpt'; defineVptPage(() => ({ prerender: true }));`,
        'src/pages/unused.tsx': `import { defineVptPage } from 'virtual:vpt'; export default () => null;`,
        'src/components/draft.tsx': 'export default <div>'
    })
    assert.deepEqual(await resolvePages({ pages: undefined, root, target: 'wx' }), [
        { path: 'pages/b', entry: true, config: { title: 'B' } },
        { path: 'pages/a', config: { title: 'A' } },
        { path: 'pages/c', prerender: true }
    ])
    assert.deepEqual(await resolvePages({ pages: undefined, root, target: 'h5' }), [
        { path: 'pages/a', config: { title: 'A' } },
        { path: 'pages/b', entry: false, config: { title: 'B' } },
        { path: 'pages/c', prerender: true }
    ])
})

test('validates entry selection in discovered page configurations', async () => {
    const source = `import { defineVptPage } from 'virtual:vpt'; defineVptPage(() => ({ entry: true }));`
    const root = await createProject({ 'src/pages/first.tsx': source, 'src/pages/second.tsx': source })
    await assert.rejects(
        resolvePages({ pages: undefined, root, target: 'wx' }),
        /Only one page may set entry: true.*pages\/first, pages\/second/
    )
})

for (const target of ['wx', 'zfb', 'tb', 'tt', 'xhs', 'h5'] as const) {
    test(`${target}: builds discovered page routes and configuration through the public plugin`, async () => {
        const root = await createProject({
            'index.html': '<html><body><div id="app"></div></body></html>',
            'src/app.tsx': 'export default function App({ children }) { return children }',
            'src/settings.ts': 'export const homeTitle = __HOME_TITLE__;',
            'src/pages/home.tsx': `
                import { defineVptPage } from 'virtual:vpt';
                import { homeTitle } from '@settings';
                defineVptPage(async ({ target }) => ({
                    entry: true,
                    config: { navigationBarTitleText: homeTitle + target }
                }));
                export default function Home() { return null; }
            `,
            'src/pages/detail.tsx': `
                import { defineVptPage } from 'virtual:vpt';
                defineVptPage(() => ({ config: { navigationBarTitleText: 'Detail' } }));
                export default function Detail() { return null; }
            `,
            'src/pages/unused.tsx': `import { defineVptPage } from 'virtual:vpt'; export default () => null;`,
            'src/components/draft.tsx': 'export default <div>'
        })
        const options: VptOptions = { target, app: 'src/app.tsx', appJson: {}, projectConfigJson: {} }
        const original = structuredClone(options)
        Object.freeze(options)
        const result = await build({
            root,
            configFile: false,
            logLevel: 'silent',
            define: { __HOME_TITLE__: JSON.stringify('Home-') },
            resolve: { alias: { '@settings': path.join(root, 'src/settings.ts') } },
            plugins: [vpt(options)],
            build: { write: false, minify: false }
        })
        assert.ok(!Array.isArray(result) && 'output' in result)
        assert.deepEqual(options, original)
        const javascript = result.output.flatMap((file) => (file.type === 'chunk' ? [file.code] : [])).join('\n')
        assert.match(javascript, /pages\/home/)
        assert.match(javascript, /pages\/detail/)
        assert.match(javascript, new RegExp(`Home-${target}`))
        assert.doesNotMatch(javascript, /pages\/unused|defineVptPage|virtual:vpt/)
        if (target === 'h5') {
            assert.match(javascript, /"?pages"?:\s*\[\s*"pages\/home",\s*"pages\/detail"\s*\]/)
            return
        }
        const app = result.output.find((file) => file.fileName === 'app.json')
        assert.ok(app?.type === 'asset')
        assert.deepEqual(JSON.parse(String(app.source)).pages, ['pages/home', 'pages/detail'])
        const home = result.output.find((file) => file.fileName === 'pages/home.json')
        assert.ok(home?.type === 'asset')
        assert.equal(JSON.parse(String(home.source)).navigationBarTitleText, `Home-${target}`)
    })
}
