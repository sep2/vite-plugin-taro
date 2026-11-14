import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { build, normalizePath, type ResolvedConfig } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { createMemoryBuildProject } from '../../tests/create-memory-build-project.ts'
import type { resolvePages } from './resolve-pages.ts'

const { vpt, calls } = await importObservedPlugin()

/** Supply asynchronously resolved pages at the module boundary while exercising the real public plugin chain. */
async function importObservedPlugin() {
    const resolverUrl = new URL('./resolve-pages.ts', import.meta.url).href
    const consumerUrls = new Set([
        new URL('../mini/resolve/resolver.ts', import.meta.url).href,
        new URL('../h5/resolver/module-resolver.ts', import.meta.url).href
    ])
    const observerUrl = `data:text/javascript,${encodeURIComponent(`
        import { resolvePages as resolve } from ${JSON.stringify(resolverUrl)}
        // This test-owned journal records the target, configured root and input pages supplied by each compiler.
        export const calls = []
        const pages = Object.freeze([
            Object.freeze({ path: 'pages/resolved/index', prerender: true, config: { marker: 'resolved-page' } })
        ])
        export async function resolvePages(context) {
            calls.push(context)
            await new Promise((resolve) => setImmediate(resolve))
            return resolve({ ...context, pages })
        }
    `)}`
    const contractObserverUrl = `data:text/javascript,${encodeURIComponent(`
        import assert from 'node:assert/strict'
        import { createMiniTargetPlugins as create } from ${JSON.stringify(new URL('../mini/plugins.ts', import.meta.url).href)}
        export function createMiniTargetPlugins(contract) {
            // Install the output assertion before registration, then keep the contract fixed throughout compilation.
            const generate = contract.output.generateProjectSkeleton
            contract.output.generateProjectSkeleton = (input, current) => {
                assert.equal(current, contract, 'Native output must receive the contract supplied before Mini plugin creation')
                return generate.call(contract.output, input, current)
            }
            Object.freeze(contract.options)
            Object.freeze(contract.output)
            return create(Object.freeze(contract))
        }
    `)}`
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (specifier === '../mini/plugins.ts') {
                return { url: contractObserverUrl, shortCircuit: true }
            }
            if (
                context.parentURL &&
                consumerUrls.has(context.parentURL) &&
                specifier === '../../page/resolve-pages.ts'
            ) {
                return { url: observerUrl, shortCircuit: true }
            }
            return nextResolve(specifier, context)
        }
    })
    try {
        const plugin: typeof import('../../vpt.ts') = await import(new URL('../../vpt.ts', import.meta.url).href)
        const observer: { calls: Parameters<typeof resolvePages>[0][] } = await import(observerUrl)
        return { vpt: plugin.default, calls: observer.calls }
    } finally {
        hooks.deregister()
    }
}

for (const [target, styleExtension] of [
    ['wx', 'wxss'],
    ['zfb', 'acss'],
    ['tb', 'acss'],
    ['tt', 'ttss'],
    ['xhs', 'css'],
    ['h5', 'css']
] as const) {
    test(`${target}: resolved pages reach entries, routes and styles with fixed platform configuration`, async () => {
        using project = createMemoryBuildProject({
            'index.html': '<!doctype html><html><body><div id="app"></div></body></html>',
            'src/app.tsx': 'export default function App({ children }) { return children }',
            'src/pages/resolved/index.tsx': `
                import { View } from '@tarojs/components'
                import './index.css'
                export default function ResolvedPage() {
                    return <View className="resolved-page">Resolved page</View>
                }
            `,
            'src/pages/resolved/index.css': '.resolved-page { color: red; }'
        })
        const input: VptOptions = {
            target,
            app: 'src/app.tsx',
            pages: [{ path: 'pages/stale/index' }],
            appJson: {},
            projectConfigJson: {}
        }
        const original = structuredClone(input)
        const previousCalls = calls.length
        const plugins = vpt(input)
        // Capture the resolved configuration to verify compiler inputs preserve Vite's original configuration references.
        const configured = Promise.withResolvers<ResolvedConfig>()
        assert.equal(calls.length, previousCalls, 'Page resolution belongs to compiler initialization')
        const result = await build({
            root: project.root,
            configFile: false,
            logLevel: 'silent',
            define: { __PROJECT_CONFIG__: JSON.stringify('resolver-config') },
            resolve: { alias: { '@configured': `${project.root}/src` } },
            plugins: [
                project.plugin,
                plugins,
                {
                    name: 'test:resolver-project-config',
                    configResolved(config) {
                        configured.resolve(config)
                    }
                }
            ],
            build: { write: false, minify: false, cssMinify: false, cssCodeSplit: true }
        })
        assert.ok(!Array.isArray(result) && 'output' in result)
        assert.equal(calls.length, previousCalls + 1)
        const config = await configured.promise
        assert.deepEqual(calls.at(-1), {
            target,
            root: normalizePath(project.root),
            pages: original.pages,
            define: config.define,
            resolve: config.resolve
        })
        assert.equal(calls.at(-1)?.define, config.define)
        assert.equal(calls.at(-1)?.resolve, config.resolve)
        assert.deepEqual(input, original)
        const chunks = result.output.filter((file) => file.type === 'chunk')
        assert.ok(chunks.some((chunk) => chunk.code.includes('Resolved page')))
        assert.ok(chunks.some((chunk) => chunk.code.includes('pages/resolved/index')))
        assert.ok(chunks.every((chunk) => !chunk.code.includes('pages/stale/index')))

        if (target === 'h5') {
            assert.ok(
                result.output.some(
                    (file) =>
                        file.type === 'asset' &&
                        file.fileName.endsWith('.css') &&
                        String(file.source).includes('resolved-page')
                )
            )
            return
        }

        const app = result.output.find((file) => file.fileName === 'app.json')
        assert.ok(app?.type === 'asset')
        assert.deepEqual(JSON.parse(String(app.source)).pages, ['pages/resolved/index'])
        const page = result.output.find((file) => file.fileName === 'pages/resolved/index.json')
        assert.ok(page?.type === 'asset')
        assert.equal(JSON.parse(String(page.source)).marker, 'resolved-page')
        const style = result.output.find((file) => file.fileName === `pages/resolved/index.${styleExtension}`)
        assert.ok(style?.type === 'asset')
        assert.match(String(style.source), /resolved-page/)
        const capsule = chunks.find((chunk) => chunk.fileName === 'pages/resolved/index-capsule.js')
        assert.ok(capsule)
        assert.match(capsule.code, target === 'tt' || target === 'xhs' ? /"prerender":\s*false/ : /"prerender":\s*true/)
    })
}
