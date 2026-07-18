import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build } from 'vite'
import { packageRequire } from '../../utils/packages.ts'
import { createCssPlugins } from './plugins.ts'

test('finalizes split Tailwind imports as WXSS', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-wxss-'))

    try {
        const nodeModules = path.join(root, 'node_modules')
        await mkdir(nodeModules)
        await symlink(
            path.dirname(packageRequire.resolve('tailwindcss/package.json')),
            path.join(nodeModules, 'tailwindcss'),
            'dir'
        )
        await writeFile(path.join(root, 'app.ts'), "import './app.css';\n")
        await writeFile(
            path.join(root, 'app.css'),
            [
                '@import "tailwindcss/theme.css";',
                '@import "tailwindcss/preflight.css";',
                '@import "tailwindcss/utilities.css";',
                '@source inline("mt-2.5");'
            ].join('\n')
        )

        await build({
            root,
            logLevel: 'silent',
            plugins: createCssPlugins('wx'),
            build: {
                cssCodeSplit: false,
                cssMinify: false,
                outDir: 'dist',
                rolldownOptions: {
                    input: path.join(root, 'app.ts'),
                    output: {
                        assetFileNames: 'src/[name].wxss'
                    }
                }
            }
        })

        const wxss = await readFile(path.join(root, 'dist/app.wxss'), 'utf8')
        assert.match(wxss, /\.mt-2_d5\s*\{/)
        assert.doesNotMatch(wxss, /\drem\b/)
        assert.doesNotMatch(wxss, /@property|:where|::file-selector-button|\\\./)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
