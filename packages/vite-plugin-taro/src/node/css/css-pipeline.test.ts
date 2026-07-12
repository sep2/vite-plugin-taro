import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import type { Plugin, PluginOption } from 'vite'
import { CssPipeline } from './css-pipeline.ts'

test('incrementally detects added WX candidates while preserving removed development CSS', async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), '.css-pipeline-test-'))
    const sourceDirectory = path.join(root, 'src')
    const cssFile = path.join(sourceDirectory, 'app.css')
    const sourceFile = path.join(sourceDirectory, 'index.tsx')
    const css = [
        '@import "tailwindcss/theme.css";',
        '@import "tailwindcss/preflight.css";',
        '@import "tailwindcss/utilities.css";',
        '@source ".";',
        ''
    ].join('\n')

    try {
        await fs.mkdir(sourceDirectory)
        await fs.writeFile(cssFile, css)
        await fs.writeFile(sourceFile, 'export const view = <div className="flex" />\n')

        const pipeline = new CssPipeline('wx')
        const plugin = getWxPlugin(pipeline)
        resolvePlugin(plugin, root)
        await transformCss(plugin, css, cssFile)
        const wxss = await pipeline.transformWxss('*, *::before, *::after { box-sizing: border-box; }')
        assert.doesNotMatch(wxss, /(^|[,{])\s*\*/)
        assert.match(wxss, /view,text/)
        await pipeline.captureFullBuild()

        await fs.writeFile(sourceFile, 'export const view = <div className="flex outline-[31px]" />\n')
        assert.deepEqual(await pipeline.transformNativePatch('', 'update.js', [sourceFile]), {
            requiresFullBuild: true
        })

        await pipeline.captureFullBuild()
        const codeOnly = await pipeline.transformNativePatch('const className = "outline-[31px]";', 'update.js', [
            sourceFile
        ])
        assert.ok('code' in codeOnly)
        assert.match(codeOnly.code, /outline-_b31px_B/)

        await fs.writeFile(sourceFile, 'export const view = <div className="flex" />\n')
        const removal = await pipeline.transformNativePatch('const className = "flex";', 'update.js', [sourceFile])
        assert.ok('code' in removal)
    } finally {
        await fs.rm(root, { recursive: true, force: true })
    }
})

function getWxPlugin(pipeline: CssPipeline): Plugin {
    const plugin = pipeline.plugins.find((item) => isNamedPlugin(item, 'vite-plugin-taro:wx-tailwind-pipeline'))
    if (!plugin) throw new Error('Expected WX CSS pipeline plugin.')
    return plugin
}

function isNamedPlugin(item: PluginOption, name: string): item is Plugin {
    return (
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        !('then' in item) &&
        'name' in item &&
        item.name === name
    )
}

function resolvePlugin(plugin: Plugin, root: string): void {
    if (typeof plugin.configResolved !== 'function') throw new Error('Expected configResolved hook.')
    Reflect.apply(plugin.configResolved, undefined, [{ root }])
}

async function transformCss(plugin: Plugin, code: string, id: string): Promise<void> {
    if (typeof plugin.transform !== 'function') throw new Error('Expected transform hook.')
    await Reflect.apply(plugin.transform, undefined, [code, id])
}
