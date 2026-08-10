import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build, type Plugin } from 'vite'
import { createWxStylePlugins } from './plugins.ts'

test('renames the compiler stylesheet behind an emitted app wrapper', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vpt-wxss-'))

    try {
        const sourceRoot = path.join(root, 'src')
        const pageRoot = path.join(sourceRoot, 'pages/example')
        await mkdir(pageRoot, { recursive: true })
        // The dynamic module is deliberate: its marker disappears when VPT finalizes before upstream's post output hook.
        await writeFile(
            path.join(sourceRoot, 'app.ts'),
            "import './app.css';\nvoid import('./pages/example/index.ts')\n"
        )
        await writeFile(
            path.join(sourceRoot, 'app.css'),
            [
                '@import "tailwindcss/theme.css";',
                '@import "tailwindcss/preflight.css";',
                '@import "tailwindcss/utilities.css";',
                '@source inline("mt-2.5");',
                '*, ::before, ::after { box-sizing: border-box; }'
            ].join('\n')
        )
        await writeFile(path.join(pageRoot, 'index.ts'), "import './index.css'\n")
        await writeFile(path.join(pageRoot, 'index.css'), '.page-marker { color: red; }\n')

        const verifyAssetOwnership: Plugin = {
            name: 'test:verify-wx-style-ownership',
            generateBundle: {
                order: 'post',
                handler(_, bundle) {
                    const globalStyle = bundle['assets/global.wxss']
                    const appStyle = bundle['app.wxss']
                    assert.equal(globalStyle?.type, 'asset')
                    assert.equal(appStyle?.type, 'asset')
                    assert.ok(globalStyle.names.length > 0)
                    assert.deepEqual(appStyle.names, [])
                }
            }
        }

        await build({
            root,
            logLevel: 'silent',
            plugins: [...createWxStylePlugins(), verifyAssetOwnership],
            build: {
                cssCodeSplit: false,
                cssMinify: false,
                outDir: 'dist',
                rolldownOptions: {
                    input: path.join(sourceRoot, 'app.ts')
                }
            }
        })

        const outputRoot = path.join(root, 'dist')
        const styleFileNames = (await readdir(outputRoot, { recursive: true }))
            .filter((fileName) => fileName.endsWith('.wxss'))
            .sort()
        assert.deepEqual(styleFileNames, ['app.wxss', 'assets/global.wxss'])

        const appStyle = await readFile(path.join(outputRoot, 'app.wxss'), 'utf8')
        assert.equal(appStyle, '@import "./assets/global.wxss";\n')

        const globalStyle = await readFile(path.join(outputRoot, 'assets/global.wxss'), 'utf8')
        assert.match(globalStyle, /\.mt-2_d5\s*\{/)
        // Proves upstream generation ran before VPT's finalizer rather than appending dynamic CSS afterward.
        assert.match(globalStyle, /\.page-marker\s*\{/)
        assert.doesNotMatch(globalStyle, /\drem\b/)
        assert.doesNotMatch(globalStyle, /@property|:where|::file-selector-button|\\\.|\*,/)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
