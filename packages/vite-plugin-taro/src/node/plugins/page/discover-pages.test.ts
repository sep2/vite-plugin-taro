import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createTestProject } from '../../tests/create-test-project.ts'
import { discoverPages } from './discover-pages.ts'

const declaration = `import { defineVptPage } from 'virtual:vpt'; defineVptPage(() => ({}));`

/** Creates source-only fixtures in the test process's disposable plugin workspace. */
async function createProject(files: Record<string, string>): Promise<string> {
    const root = await createTestProject('page-discovery-')
    await Promise.all(
        Object.entries(files).map(async ([name, source]) => {
            const filename = path.join(root, name)
            await mkdir(path.dirname(filename), { recursive: true })
            await writeFile(filename, source)
        })
    )
    return root
}

test('discovers only TSX candidates under src in lexical route order', async () => {
    const root = await createProject({
        'src/pages/z.tsx': declaration,
        'src/pages/nested/index.tsx': declaration,
        'src/pages/a.tsx': declaration,
        'src/pages/a-child.tsx': declaration,
        'src/pages/B.tsx': declaration,
        'src/pages/with space.tsx': declaration,
        'src/pages/detail.test.tsx': declaration,
        'src/home.tsx': declaration,
        'src/nested/src/home.tsx': declaration,
        'src/pages/helper.ts': declaration,
        'src/pages/legacy.jsx': declaration,
        'src/pages/style.css': '',
        'src/components/helper.tsx': 'export default () => <div/>',
        'src/components/draft.tsx': 'export default <div>',
        'src/app.tsx': `import App from 'unavailable'; export default App;`,
        'src/node_modules/ignored/page.tsx': declaration,
        'src/pages/node_modules/ignored/page.tsx': declaration,
        'outside.tsx': declaration,
        'client/home.tsx': declaration
    })
    await mkdir(path.join(root, 'src/pages/directory.tsx'))
    assert.deepEqual(await discoverPages(root), [
        'home',
        'nested/src/home',
        'pages/B',
        'pages/a',
        'pages/a-child',
        'pages/detail.test',
        'pages/nested/index',
        'pages/with space',
        'pages/z'
    ])
})

for (const count of [0, 1, 15, 16, 17, 32, 40]) {
    test(`discovers candidates from ${count} source files`, async () => {
        const routes = Array.from({ length: count }, (_, index) => `screens/page-${String(index).padStart(2, '0')}`)
        const root = await createProject(
            Object.fromEntries(
                routes.map((route, index) => [
                    `src/${route}.tsx`,
                    index % 2 === 0 ? declaration : 'export default () => null'
                ])
            )
        )
        await mkdir(path.join(root, 'src/screens'), { recursive: true })
        assert.deepEqual(
            await discoverPages(root),
            routes.filter((_, index) => index % 2 === 0)
        )
    })
}

for (const directory of ['client', 'app[client]', 'space app']) {
    test(`scans src relative to Vite root ${directory}`, async () => {
        const project = await createProject({
            [`${directory}/src/screens/home.tsx`]: declaration,
            [`${directory}/src/node_modules/ignored/page.tsx`]: declaration,
            'src/outside.tsx': declaration
        })
        assert.deepEqual(await discoverPages(path.join(project, directory)), ['screens/home'])
    })
}

test('returns no candidates when src is absent', async () => {
    const root = await createProject({ 'outside.tsx': declaration })
    assert.deepEqual(await discoverPages(root), [])
})

for (const [name, source, selected] of [
    ['named binding', declaration, true],
    ['aliased binding', `import { defineVptPage as page } from 'virtual:vpt'; page(() => ({}));`, true],
    ['namespace binding', `import * as api from 'virtual:vpt'; api.defineVptPage(() => ({}));`, true],
    ['unused runtime binding', `import { defineVptPage } from 'virtual:vpt'; export default () => null;`, true],
    ['mixed type and runtime bindings', `import { type Context, defineVptPage } from 'virtual:vpt';`, true],
    ['multiline import', `import {\n defineVptPage\n} from\n "virtual:vpt";`, true],
    ['type-only declaration', `import type { defineVptPage } from 'virtual:vpt';`, false],
    ['type-only binding', `import { type defineVptPage } from 'virtual:vpt';`, false],
    ['type-only namespace', `import type * as api from 'virtual:vpt';`, false],
    ['type query', `type Api = typeof import('virtual:vpt');`, false],
    ['side-effect import', `import 'virtual:vpt';`, false],
    ['named re-export', `export { defineVptPage } from 'virtual:vpt';`, false],
    ['namespace re-export', `export * from 'virtual:vpt';`, false],
    ['dynamic import', `const api = await import('virtual:vpt');`, false],
    ['indirect import', `import { defineVptPage } from './api'; defineVptPage(() => ({}));`, false],
    ['comment', `// import { defineVptPage } from 'virtual:vpt';`, false],
    ['string', `const example = "import { defineVptPage } from 'virtual:vpt';";`, false],
    ['JSX text', `export default () => <div>virtual:vpt</div>;`, false],
    ['different module', `import { defineVptPage } from 'virtual:vpt-other';`, false],
    ['escaped module name', `import { defineVptPage } from 'virtual\\u003avpt';`, false],
    ['unfinished unrelated TSX', 'export default <div>', false]
] as const) {
    test(`selects direct runtime API imports: ${name}`, async () => {
        const root = await createProject({ 'src/home.tsx': source })
        assert.deepEqual(await discoverPages(root), selected ? ['home'] : [])
    })
}

test('finds imports without loading dependencies or evaluating module and factory effects', async () => {
    const root = await createProject({
        'src/home.tsx': `
            import './missing-dependency';
            import { defineVptPage } from 'virtual:vpt';
            defineVptPage(() => { throw new Error('Factory executed'); });
            document.body.textContent = 'Browser effect';
            throw new Error('Module executed');
        `
    })
    assert.deepEqual(await discoverPages(root), ['home'])
})

test('discovers valid candidates alongside malformed sources', async () => {
    const root = await createProject({
        'src/a-valid.tsx': declaration,
        'src/broken.tsx': `import { defineVptPage } from 'virtual:vpt'; export default <div>`,
        'src/broken-import.tsx': `import { from 'virtual:vpt';`,
        'src/z-valid.tsx': declaration
    })
    assert.deepEqual(await discoverPages(root), ['a-valid', 'z-valid'])
})
