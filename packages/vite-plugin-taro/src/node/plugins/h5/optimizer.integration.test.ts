import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { optimizeDeps, resolveConfig } from 'vite'
import { packageRequire } from '../../utils/packages.ts'
import { createH5TargetPlugins } from './plugins.ts'

const packageRoot = path.dirname(packageRequire.resolve('vite-plugin-taro/package.json'))
const runtimeRequire = createRequire(packageRequire.resolve('vite-plugin-taro-runtime/components'))

type TestWindow = Pick<Window, 'document' | 'navigator' | 'location' | 'customElements'> & {
    HTMLElement: typeof HTMLElement
    Element: typeof Element
    Node: typeof Node
}

// Stencil's own DOM implementation executes the real optimized component classes without requiring a browser install.
const { MockWindow } = runtimeRequire('@stencil/core/mock-doc') as { MockWindow: new () => TestWindow }

/** Runs Vite's separate optimizer with both a consumer and the H5 backend as physical dependency entries. */
async function bundleOptimizedNavigator(root: string): Promise<string> {
    const entry = path.join(root, 'entry.js')
    await writeFile(
        entry,
        `
            export { default as consumerApi } from '@tarojs/taro'
            export { default as backendApi } from 'vite-plugin-taro-runtime/plugin-platform-h5/runtime/apis'
            export { default as upstreamBackendApi } from '@tarojs/plugin-platform-h5/dist/runtime/apis'
            export { TaroNavigatorCore } from 'vite-plugin-taro-runtime/components/dist/components'
            export { TaroNavigatorCore as upstreamNavigator } from '@tarojs/components/dist/components'
            export { options } from 'vite-plugin-taro-runtime/runtime/h5'
            export { options as upstreamOptions } from '@tarojs/runtime'
            export { createHashHistory } from 'vite-plugin-taro-runtime/router'
            export { createHashHistory as upstreamHistory } from '@tarojs/router'
            export { createReactApp } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'
            export { createReactApp as upstreamReactApp } from '@tarojs/plugin-framework-react/dist/runtime'
        `
    )
    const config = await resolveConfig(
        {
            root,
            configFile: false,
            cacheDir: path.join(root, '.vite'),
            logLevel: 'silent',
            plugins: createH5TargetPlugins({
                target: 'h5',
                app: 'src/app.tsx',
                pages: [],
                appJson: {},
                projectConfigJson: {}
            }),
            optimizeDeps: { include: [entry], noDiscovery: true }
        },
        'serve'
    )
    const metadata = await optimizeDeps(config, true)
    const optimizedEntry = metadata.optimized[entry]
    assert.ok(optimizedEntry)
    const result = await build({
        input: optimizedEntry.file,
        // Apply Vite's browser defines while joining optimized chunks for execution in one isolated VM context.
        transform: { define: { 'process.env': '{}', ...config.define } },
        output: { format: 'iife', name: 'harness', codeSplitting: false },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk?.type === 'chunk')
    return chunk.code
}

/** Checks API identity and executes the actual Navigator click handler against the shared backend. */
function assertOptimizedNavigation(code: string): void {
    // The mock browser's location is local to this execution and supplies the origin used by H5 API initialization.
    const window = new MockWindow()
    window.location.href = 'http://localhost/'
    // Records only this VM's synchronous Navigator calls; no global runtime objects are mutated by the test.
    const navigations: string[] = []
    runInNewContext(
        `${code}
            assert.equal(harness.consumerApi, harness.backendApi)
            assert.equal(harness.backendApi, harness.upstreamBackendApi)
            assert.equal(harness.TaroNavigatorCore, harness.upstreamNavigator)
            assert.equal(harness.options, harness.upstreamOptions)
            assert.equal(harness.createHashHistory, harness.upstreamHistory)
            assert.equal(harness.createReactApp, harness.upstreamReactApp)
            assert.equal(typeof harness.backendApi.navigateTo, 'function')
            // Replace the router boundary only in this VM, leaving the optimized component's API import untouched.
            harness.backendApi.navigateTo = ({ url }) => {
                navigations.push(url)
                return Promise.resolve({ errMsg: 'navigateTo:ok' })
            }
            harness.TaroNavigatorCore.prototype.onClick.call({
                openType: 'navigate',
                url: '/pages/second/index',
                onSuccess: { emit() {} },
                onFail: { emit() {} },
                onComplete: { emit() {} }
            })
        `,
        {
            window,
            self: window,
            document: window.document,
            navigator: window.navigator,
            HTMLElement: window.HTMLElement,
            Element: window.Element,
            Node: window.Node,
            customElements: window.customElements,
            console,
            setTimeout,
            clearTimeout,
            URL,
            URLSearchParams,
            assert,
            navigations
        }
    )
    assert.deepEqual(navigations, ['/pages/second/index'])
}

test('canonical and upstream H5 imports share optimized runtime identities and complete APIs', async () => {
    const root = await mkdtemp(path.join(packageRoot, 'node_modules/.vpt-h5-optimizer-'))
    try {
        const code = await bundleOptimizedNavigator(root)
        assert.doesNotMatch(code, /dingtalk-jsapi/)
        assertOptimizedNavigation(code)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
