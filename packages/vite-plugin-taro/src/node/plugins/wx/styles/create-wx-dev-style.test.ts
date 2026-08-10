import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build, type ModuleInfo } from 'rolldown'
import { createServer, type Plugin } from 'vite'
import { createWxDevStyle } from './create-wx-dev-style.ts'

test('refreshes tracked roots after a JavaScript HMR parse', async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), 'vpt-wx-dev-style-'))
    const rootId = path.join(projectRoot, 'app.css')
    const scriptId = path.join(projectRoot, 'component.tsx')
    const rootSource = `@import 'tailwindcss';`
    await Promise.all([writeFile(rootId, rootSource), writeFile(scriptId, 'export const component = true')])

    // This models the live registry owned and updated by the root tracker.
    const rootIds = new Set([rootId])
    const getTailwindRoots = () => rootIds
    const plugin = createWxDevStyle(getTailwindRoots)
    const api = plugin.api
    if (!api) throw new Error('Expected the WX development style API')
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
    // The capture supplies a real Rolldown ModuleInfo for the incremental moduleParsed invocation below.
    let parsedScript: ModuleInfo | undefined
    const captureParsedScript: Plugin = {
        name: 'test:capture-parsed-script',
        moduleParsed(moduleInfo) {
            parsedScript = moduleInfo
        }
    }

    try {
        await build({
            input: scriptId,
            output: { format: 'es' },
            plugins: [plugin, captureParsedScript],
            write: false
        })

        assert.deepEqual(requests, [])
        assert.deepEqual([...api.getTailwindCss()], [])

        const moduleParsed = plugin.moduleParsed
        if (typeof moduleParsed !== 'function' || parsedScript === undefined) {
            throw new Error('Expected a parsed script and a moduleParsed handler')
        }
        await Reflect.apply(moduleParsed, undefined, [parsedScript])

        assert.equal(plugin.apply, 'serve')
        assert.equal(api.getTailwindRoots, getTailwindRoots)
        assert.equal(api.getTailwindRoots(), rootIds)
        assert.deepEqual([...api.getTailwindCss()], [[rootId, generatedCss]])
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
