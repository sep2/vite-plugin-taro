import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { createServer, normalizePath, resolveConfig } from 'vite'
import vpt from '../../../../index.ts'
import { projectTempDir } from '../../../tests/project-temp-dir.ts'
import { toViteFileImportPath } from '../../../utils/modules.ts'
import { packageRequire, resolveVptRuntime } from '../../../utils/packages.ts'
import { createMiniViteClientPlugin } from './create-mini-vite-client-plugin.ts'
import type { BundledDev } from './mini-dev-options.ts'

const viteClientId = normalizePath(
    path.join(path.dirname(packageRequire.resolve('vite/package.json')), 'dist/client/client.mjs')
)
const miniViteClientId = resolveVptRuntime('mini/dev/vite-client')

for (const base of ['/', '/native/']) {
    test(`bundles inert style exports through Vite client resolution with base=${base}`, async (t) => {
        const entry = '\0test:mini-vite-client'
        const requests = [
            path.posix.join(base, '/@vite/client'),
            '/@vite/client',
            viteClientId,
            toViteFileImportPath(viteClientId),
            normalizePath(toViteFileImportPath(viteClientId))
        ].flatMap((request) => [request, `${request}?v=1`])
        const server = await createServer({
            root: projectTempDir,
            configFile: false,
            logLevel: 'silent',
            base,
            experimental: { bundledDev: true },
            optimizeDeps: { noDiscovery: true, include: [] },
            server: { watch: null },
            plugins: [
                createMiniViteClientPlugin(),
                {
                    name: 'test:mini-vite-client-source',
                    resolveId(id) {
                        return id === entry ? entry : undefined
                    },
                    load(id) {
                        if (id === entry) {
                            return [
                                ...requests.map(
                                    (request, index) => `import * as client${index} from ${JSON.stringify(request)};`
                                ),
                                ...requests.map(
                                    (_, index) =>
                                        `if (client${index}.updateStyle !== client0.updateStyle || client${index}.removeStyle !== client0.removeStyle) throw new Error('Client identity differs');`
                                ),
                                `export * from ${JSON.stringify(requests[0])};`
                            ].join('\n')
                        }
                    }
                }
            ],
            build: { rolldownOptions: { input: entry } }
        })
        t.after(() => server.close())
        const bundledDev: unknown = server.environments.client.bundledDev
        assert.ok(hasBundledOptions(bundledDev))
        // Exercise Vite's actual native aliases and bundled-client resolver while executing only the helper module.
        const options = await bundledDev.getRolldownOptions()
        const result = await build({
            ...options,
            preserveEntrySignatures: 'strict',
            experimental: {},
            output: { format: 'cjs', exports: 'named' },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        assert.deepEqual(chunk.imports, [])
        assert.equal(chunk.moduleIds.filter((id) => id === miniViteClientId).length, 1)
        assert.ok(
            chunk.moduleIds.every((id) => !normalizePath(id).includes('/vite/dist/client/')),
            chunk.moduleIds.join('\n')
        )

        // This isolated CommonJS namespace supplies neither DOM globals nor a browser HMR runtime.
        const exports: Record<string, unknown> = {}
        runInNewContext(chunk.code, { exports })
        assert.deepEqual(Object.keys(exports).sort(), ['removeStyle', 'updateStyle'])
        for (const helper of Object.values(exports)) {
            assert.ok(typeof helper === 'function')
            assert.equal(Reflect.apply(helper, undefined, ['style.css', '.page { color: red; }']), undefined)
        }
    })
}

function hasBundledOptions(value: unknown): value is Pick<BundledDev, 'getRolldownOptions'> {
    return (
        value !== null &&
        typeof value === 'object' &&
        'getRolldownOptions' in value &&
        typeof value.getRolldownOptions === 'function'
    )
}

test('leaves other module requests and server environments to their own resolvers', () => {
    const plugin = createMiniViteClientPlugin()
    assert.equal(plugin.enforce, 'pre')
    assert.equal(plugin.apply, 'serve')
    assert.ok(typeof plugin.applyToEnvironment === 'function')
    assert.equal(Reflect.apply(plugin.applyToEnvironment, {}, [{ name: 'client' }]), true)
    assert.equal(Reflect.apply(plugin.applyToEnvironment, {}, [{ name: 'ssr' }]), false)
    const hook = plugin.resolveId
    assert.ok(hook && typeof hook === 'object')
    const context = { environment: { config: { base: '/native/' } } }
    assert.equal(Reflect.apply(hook.handler, context, ['/other/@vite/client']), undefined)
    assert.equal(Reflect.apply(hook.handler, context, ['/src/client.ts']), undefined)
})

for (const target of ['wx', 'zfb', 'tt', 'h5'] as const) {
    for (const command of ['serve', 'build'] as const) {
        test(`scopes the native Vite client for ${target} ${command}`, async () => {
            const config = await resolveConfig(
                {
                    configFile: false,
                    logLevel: 'silent',
                    plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
                },
                command
            )
            assert.equal(
                config.plugins.some((plugin) => plugin.name === 'vpt:mini-vite-client'),
                target !== 'h5' && command === 'serve'
            )
        })
    }
}
