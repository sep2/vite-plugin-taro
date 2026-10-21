import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { build, createServer } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { createTestProject } from '../../tests/create-test-project.ts'
import vpt from '../../vpt.ts'

const authoredFiles = {
    axml: '<view>Application tab bar</view>',
    acss: 'view { color: green; }',
    js: 'Component({ data: { authored: true } })',
    json: '{"component":true,"usingComponents":{}}'
} as const

function createOptions(): VptOptions {
    return {
        target: 'zfb',
        app: 'src/app.tsx',
        pages: [{ path: 'pages/home/index' }, { path: 'pages/about/index' }],
        appJson: {
            tabBar: {
                customize: true,
                items: [
                    { pagePath: 'pages/home/index', name: 'Home' },
                    { pagePath: 'pages/about/index', name: 'About' }
                ]
            }
        },
        projectConfigJson: { appid: 'tab-bar-fixture', format: 2 }
    }
}

async function createProject(): Promise<string> {
    const root = await createTestProject('zfb-custom-tab-bar-')
    const sources = {
        'src/app.tsx': `
            import type { PropsWithChildren } from 'react'
            export default function App({ children }: PropsWithChildren) { return children }
        `,
        'src/pages/home/index.tsx': `
            import { View } from 'virtual:taro/components'
            export default function Home() { return <View>Home</View> }
        `,
        'src/pages/about/index.tsx': `
            import { View } from 'virtual:taro/components'
            export default function About() { return <View>About</View> }
        `
    }
    for (const [name, source] of Object.entries(sources)) {
        const file = path.join(root, name)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, source)
    }
    return root
}

async function readEntry(output: string): Promise<Record<string, string>> {
    const files = Object.fromEntries(
        await Promise.all(
            ['axml', 'acss', 'js', 'json'].map(
                async (extension) =>
                    [
                        extension,
                        await readFile(path.join(output, `customize-tab-bar/index.${extension}`), 'utf8')
                    ] as const
            )
        )
    )
    const config: { component: boolean } = JSON.parse(files.json)
    assert.equal(config.component, true)
    return files
}

for (const authored of [false, true]) {
    test(`builds the Alipay custom tab entry with authored native files ${authored}`, async () => {
        const root = await createProject()
        if (authored) {
            const publicDir = path.join(root, 'public/customize-tab-bar')
            await mkdir(publicDir, { recursive: true })
            for (const [extension, source] of Object.entries(authoredFiles)) {
                await writeFile(path.join(publicDir, `index.${extension}`), source)
            }
        }
        const output = path.join(root, 'dist')
        await build({
            root,
            configFile: false,
            logLevel: 'silent',
            plugins: vpt(createOptions()),
            build: { outDir: output }
        })
        const files = await readEntry(output)
        if (authored) {
            assert.deepEqual(files, authoredFiles)
        } else {
            assert.equal(files.js, 'Component({})\n')
            assert.match(files.acss, /display: none/)
            assert.match(files.axml, /vpt-tab-bar-placeholder/)
        }
    })
}

test('publishes the Alipay placeholder on development startup and restart', { timeout: 25_000 }, async () => {
    const root = await createProject()
    const output = path.join(root, 'dist')
    for (const generation of ['startup', 'restart']) {
        await rm(path.join(output, 'customize-tab-bar'), { recursive: true, force: true })
        const publication = Promise.withResolvers<void>()
        const server = await createServer({
            root,
            configFile: false,
            logLevel: 'silent',
            plugins: [
                vpt(createOptions()),
                {
                    name: 'test:zfb-custom-tab-bar-publication',
                    enforce: 'post',
                    writeBundle: {
                        order: 'post',
                        handler() {
                            publication.resolve()
                        }
                    }
                }
            ],
            build: { outDir: output },
            server: { host: '127.0.0.1', port: 0 }
        })
        try {
            await server.listen()
            await publication.promise
            const files = await readEntry(output)
            assert.equal(files.js, 'Component({})\n', generation)
            assert.match(files.acss, /display: none/, generation)
        } finally {
            await server.close()
        }
    }
})
