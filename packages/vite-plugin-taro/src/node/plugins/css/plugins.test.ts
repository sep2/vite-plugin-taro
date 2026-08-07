import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build } from 'vite'
import { createCssPlugins } from './plugins.ts'

test('finalizes Tailwind imports as one global WXSS asset', async () => {
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

        await build({
            root,
            logLevel: 'silent',
            plugins: createCssPlugins('wx'),
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
        assert.deepEqual(styleFileNames, ['app.wxss'])

        const wxss = (
            await Promise.all(styleFileNames.map((fileName) => readFile(path.join(outputRoot, fileName), 'utf8')))
        ).join('\n')
        assert.match(wxss, /\.mt-2_d5\s*\{/)
        // Proves upstream generation ran before VPT's finalizer rather than appending dynamic CSS afterward.
        assert.match(wxss, /\.page-marker\s*\{/)
        assert.doesNotMatch(wxss, /\drem\b/)
        assert.doesNotMatch(wxss, /@property|:where|::file-selector-button|\\\.|\*,/)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
