import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import type { Plugin, PluginOption } from 'vite'
import { CssPipeline } from './css-pipeline.ts'

test('transforms materialized WXSS with the registered Tailwind design system', async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), '.css-pipeline-test-'))
    const sourceDirectory = path.join(root, 'src')
    const cssFile = path.join(sourceDirectory, 'app.css')
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

        const pipeline = new CssPipeline('wx')
        const plugin = getWxPlugin(pipeline)
        resolvePlugin(plugin, root)
        await transformCss(plugin, css, cssFile)

        const wxss = await pipeline.transformWxss('*, *::before, *::after { box-sizing: border-box; }')
        assert.doesNotMatch(wxss, /(^|[,{])\s*\*/)
        assert.match(wxss, /view,text/)
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
