import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { normalizePath, resolveConfig } from 'vite'
import vpt from '../../../../index.ts'
import type { VptOptions } from '../../../../options.ts'
import { packageRequire } from '../../../utils/packages.ts'
import { createMiniGlobalPlugin } from '../global/create-mini-global-plugin.ts'
import {
    createMiniReactRefreshTransforms,
    injectReactRefreshRendererDependency,
    transformRefreshRuntime
} from './react-refresh.ts'

const preambleGuard = `if (!window.$RefreshReg$) { throw new Error("@vitejs/plugin-react can't detect preamble. Something is wrong.") }`
const refreshProperties = [
    '$RefreshReg$',
    '$RefreshSig$',
    '__registerBeforePerformReactRefresh',
    '__getReactRefreshIgnoredExports'
]

function resolveRefreshConfig(target: VptOptions['target'], command: 'serve' | 'build') {
    return resolveConfig(
        {
            configFile: false,
            plugins: vpt({
                target,
                app: 'src/app.tsx',
                pages: [{ path: 'pages/home/index' }],
                appJson: {},
                projectConfigJson: {}
            })
        },
        command
    )
}

for (const target of ['wx', 'zfb', 'tt', 'h5'] as const) {
    for (const command of ['serve', 'build'] as const) {
        test(`${target} ${command}: only Mini development redirects Refresh globals`, async () => {
            const config = await resolveRefreshConfig(target, command)
            for (const name of refreshProperties) {
                assert.equal(
                    config.define?.[`window.${name}`],
                    target !== 'h5' && command === 'serve' ? `globalThis.${name}` : undefined
                )
            }
            assert.equal(
                config.define?.queueMicrotask,
                target !== 'h5' && command === 'serve' ? 'globalThis.queueMicrotask' : undefined
            )
            assert.equal(config.define?.window, undefined)
            assert.equal(config.build.rolldownOptions.transform?.inject?.window, undefined)
        })
    }
}

for (const target of ['wx', 'zfb', 'tt'] as const) {
    test(`${target}: runtime preamble satisfies cold and repeated boundary evaluation without removing guards`, async () => {
        const config = await resolveRefreshConfig(target, 'serve')
        const runtimePath = path.join(
            path.dirname(packageRequire.resolve('@vitejs/plugin-react')),
            'refresh-runtime.js'
        )
        const runtime = transformRefreshRuntime(await readFile(runtimePath, 'utf8'))
        const entry = path.join(path.dirname(runtimePath), 'preamble-test.js')
        const [globalPlugin] = createMiniGlobalPlugin({
            getPhysicalChunkId(chunk) {
                assert.ok(typeof chunk !== 'string')
                return chunk.fileName
            }
        })
        const result = await build({
            input: entry,
            plugins: [
                {
                    name: 'test:refresh-preamble',
                    load(id) {
                        if (id === runtimePath) {
                            return runtime
                        }
                        if (id === entry) {
                            return `
import { validateRefreshBoundaryAndEnqueueUpdate } from './refresh-runtime.js'
export { validateRefreshBoundaryAndEnqueueUpdate }
export function nativeWindowType() { return typeof window }
export function readNativeWindow() { return window }
export function readNativeDocument() { return window.document }
export function localWindow(window) { return [${refreshProperties.map((name) => `window.${name}`).join(',')}] }
${preambleGuard}
export function evaluateBoundary() {
    ${preambleGuard}
    const Component = () => null
    window.$RefreshReg$(Component, 'Component')
    return window.$RefreshSig$()(Component) === Component
}
`
                        }
                    },
                    resolveId(id) {
                        if (id === entry) {
                            return entry
                        }
                    }
                },
                {
                    name: globalPlugin.name,
                    resolveId: globalPlugin.resolveId,
                    load: globalPlugin.load,
                    renderChunk: globalPlugin.renderChunk,
                    generateBundle: globalPlugin.generateBundle
                }
            ],
            transform: {
                ...config.build.rolldownOptions.transform,
                define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify('development') }
            },
            output: { format: 'cjs', exports: 'named' },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        assert.match(chunk.code, /can't detect preamble/)
        // Isolate the shared protocol state from Node and from the other target's runtime.
        const provider = result.output.find((chunk) => chunk.fileName === 'common/vpt-global.js')
        assert.ok(provider?.type === 'chunk')
        const context = {
            exports: {},
            global: {},
            setTimeout,
            clearTimeout,
            console,
            require(request: string) {
                assert.equal(request, './common/vpt-global.js')
                return globalExports
            }
        }
        const globalExports: unknown = runInNewContext(
            `(function(exports) { ${provider.code}; return exports; })({})`,
            context
        )
        runInNewContext(chunk.code, context)
        assert.equal(config.define?.__REACT_DEVTOOLS_GLOBAL_HOOK__, undefined)
        assert.equal(runInNewContext('typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.inject', context), 'function')
        assert.equal(
            runInNewContext('__REACT_DEVTOOLS_GLOBAL_HOOK__ === globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__', context),
            true
        )
        for (const name of refreshProperties.slice(0, 3)) {
            assert.equal(runInNewContext(`typeof globalThis.${name}`, context), 'function')
        }
        assert.equal(runInNewContext('exports.nativeWindowType()', context), 'undefined')
        assert.throws(() => runInNewContext('exports.readNativeWindow()', context), { name: 'ReferenceError' })
        assert.throws(() => runInNewContext('exports.readNativeDocument()', context), { name: 'ReferenceError' })
        const localValues = refreshProperties.map((name) => `local:${name}`)
        const localWindow = Object.fromEntries(refreshProperties.map((name, index) => [name, localValues[index]]))
        assert.equal(
            runInNewContext(`JSON.stringify(exports.localWindow(${JSON.stringify(localWindow)}))`, context),
            JSON.stringify(localValues)
        )
        // The host may also expose a real window. Only the reserved Refresh properties belong on globalThis.
        runInNewContext('globalThis.window = { document: "native-document" }', context)
        assert.equal(runInNewContext('exports.nativeWindowType()', context), 'object')
        assert.equal(runInNewContext('exports.readNativeWindow() === window', context), true)
        assert.equal(runInNewContext('exports.readNativeDocument()', context), 'native-document')
        assert.equal(runInNewContext('typeof window.$RefreshReg$', context), 'undefined')
        assert.equal(runInNewContext('exports.evaluateBoundary()', context), true)
        assert.equal(runInNewContext('exports.evaluateBoundary()', context), true)
        assert.equal(
            runInNewContext("exports.validateRefreshBoundaryAndEnqueueUpdate('fixture', { removed: 1 }, {})", context),
            'Could not Fast Refresh (export removed)'
        )
        // Record the optional upstream hook's invocation in this isolated realm, not in Node's global state.
        runInNewContext(
            `
            globalThis.__getReactRefreshIgnoredExports = ({ id }) => {
                globalThis.ignoredRefreshId = id;
                return [];
            };
        `,
            context
        )
        assert.equal(
            runInNewContext(
                "exports.validateRefreshBoundaryAndEnqueueUpdate('with-hook', { removed: 1 }, {})",
                context
            ),
            'Could not Fast Refresh (export removed)'
        )
        assert.equal(runInNewContext('ignoredRefreshId', context), 'with-hook')
        // Prove that the guard is still active rather than erased by a transform.
        runInNewContext('delete globalThis.$RefreshReg$', context)
        assert.throws(() => runInNewContext('exports.evaluateBoundary()', context), /can't detect preamble/)
    })
}

test('appends the preamble without rewriting existing runtime code', () => {
    const code = 'window.__registerBeforePerformReactRefresh = callback'
    const transformed = transformRefreshRuntime(code)
    assert.ok(transformed.code.startsWith(`${code}\ninjectIntoGlobalHook(globalThis);`))
    assert.match(transformed.code, /globalThis\.\$RefreshReg\$ = \(\) => \{\};/)
    assert.match(transformed.code, /globalThis\.\$RefreshSig\$ = \(\) => \(type\) => type;/)
    assert.equal(transformed.map, null)
})

test('routes the runtime bootstrap by exact module ID without a guard-removal plugin', async () => {
    const plugins = createMiniReactRefreshTransforms()
    assert.equal(plugins.length, 2)
    const plugin = plugins[0]
    assert.ok(plugin)
    assert.equal(plugin.apply, 'serve')
    const hook = plugin.transform
    assert.ok(hook && typeof hook === 'object')
    assert.equal(hook.order, 'post')
    const filter = hook.filter?.id
    assert.ok(filter instanceof RegExp)
    assert.equal(filter.test('/@react-refresh'), true)
    assert.equal(filter.test('/@react-refresh?v=1'), true)
    assert.equal(filter.test('/src/@react-refresh.js'), false)
    const code = 'window.__registerBeforePerformReactRefresh = callback'
    assert.deepEqual(await Reflect.apply(hook.handler, {}, [code, '/@react-refresh']), transformRefreshRuntime(code))
})

test('orders React Refresh before renderer injection', async () => {
    const hook = createMiniReactRefreshTransforms()[1]?.transform
    assert.ok(hook && typeof hook === 'object')
    const filter = hook.filter?.id
    assert.ok(filter instanceof RegExp)
    const rendererId = normalizePath(
        path.join(
            path.dirname(packageRequire.resolve('react-reconciler/package.json')),
            'cjs/react-reconciler.development.js'
        )
    )
    assert.equal(filter.test(rendererId), true)
    assert.equal(filter.test(`${rendererId}?v=1`), true)
    assert.equal(filter.test('/project/other-renderer.js'), false)
    const code = 'const rendererID = hook.inject(internals)'
    const result = injectReactRefreshRendererDependency(code)
    assert.deepEqual(result, { code: `import '/@react-refresh'\n${code}`, map: null })
    assert.deepEqual(await Reflect.apply(hook.handler, {}, [code, rendererId]), result)
    assert.throws(() => injectReactRefreshRendererDependency('export const renderer = {}'), /must inject its renderer/)
})
