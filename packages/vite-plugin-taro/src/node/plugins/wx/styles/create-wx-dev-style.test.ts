import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { createWxDevStyle } from './create-wx-dev-style.ts'

test('transforms one tracked root for WX development', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'vpt-wx-dev-style-'))
    const rootId = path.join(projectRoot, 'app.css')
    const rootSource = `@import 'tailwindcss';`
    await writeFile(rootId, rootSource)

    // This models the live registry owned and updated by the root tracker.
    const rootIds = new Set([rootId])
    const getTailwindRoots = () => rootIds
    const plugin = createWxDevStyle(getTailwindRoots)
    const server = await createServer({ configFile: false, logLevel: 'silent', plugins: [plugin] })
    const pluginContainer = server.environments.client.pluginContainer
    const originalTransform = pluginContainer.transform
    const generatedCss = '.generated { content: "\\n"; }\n.next {}'
    // The mock records the exact synthetic request while isolating this unit from Vite's unrelated CSS implementation.
    const requests: Array<Readonly<{ code: string; id: string }>> = []
    pluginContainer.transform = async (code, id) => {
        requests.push({ code, id })
        return {
            code: `const __vite__css = ${JSON.stringify(generatedCss)}\nexport default __vite__css`,
            map: null
        }
    }

    try {
        assert.equal(plugin.apply, 'serve')
        assert.equal(plugin.api?.getTailwindRoots, getTailwindRoots)
        assert.equal(plugin.api.getTailwindRoots(), rootIds)
        assert.equal(await plugin.api.transformTailwindRoot(rootId), generatedCss)
        assert.deepEqual([...plugin.api.getTailwindCss()], [[rootId, generatedCss]])
        assert.deepEqual(requests, [
            {
                code: rootSource,
                id: `${rootId}?weapp-vite-sidecar=style`
            }
        ])
    } finally {
        pluginContainer.transform = originalTransform
        await server.close()
        await rm(projectRoot, { recursive: true })
    }
})
