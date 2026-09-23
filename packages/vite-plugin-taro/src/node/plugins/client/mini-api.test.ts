import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { packageRequire } from '../../utils/packages.ts'
import { createClientTaroPlugin } from './client-taro.ts'

/** Bundles the real Mini facade, shared CommonJS backend, platform adapter, and React hooks. */
async function bundleMiniApi(source: string, target: 'wx' | 'zfb' | 'tt'): Promise<string> {
    const platform = { wx: 'weapp', zfb: 'alipay', tt: 'tt' }[target]
    const aliases: ReadonlyMap<string, string> = new Map([
        ['@tarojs/runtime', packageRequire.resolve('vite-plugin-taro-runtime/runtime/mini')],
        ['@tarojs/api', packageRequire.resolve('vite-plugin-taro-runtime/api')]
    ])
    const result = await build({
        input: '\0entry',
        plugins: [
            createClientTaroPlugin(target),
            {
                name: 'test:mini-runtime',
                resolveId: (id) => (id === '\0entry' ? id : aliases.get(id)),
                load: (id) =>
                    id === '\0entry'
                        ? `
                    import 'vite-plugin-taro-runtime/plugin-platform-${platform}/runtime'
                    ${source}
                `
                        : undefined
            }
        ],
        transform: {
            define: {
                'process.env.NODE_ENV': '"production"',
                'process.env.TARO_ENV': JSON.stringify(platform),
                'process.env.TARO_PLATFORM': '"mini"',
                'process.env.FRAMEWORK': '"react"',
                'process.env.TARO_VERSION': '"4.2.1"',
                'process.env.SUPPORT_TARO_POLYFILL': '"disabled"',
                ENABLE_ADJACENT_HTML: 'false',
                ENABLE_CLONE_NODE: 'false',
                ENABLE_CONTAINS: 'false',
                ENABLE_INNER_HTML: 'false',
                ENABLE_MUTATION_OBSERVER: 'false',
                ENABLE_SIZE_APIS: 'false',
                ENABLE_TEMPLATE_CONTENT: 'false'
            }
        },
        output: { format: 'iife', name: 'fixture' },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk?.type === 'chunk')
    return chunk.code
}

for (const target of ['wx', 'zfb', 'tt'] as const) {
    test(`converts dynamic inline sizes through the real ${target} Taro facade`, async () => {
        const code = await bundleMiniApi(
            `
            import Taro, { initPxTransform, pxTransform } from 'virtual:taro/api'
            import Upstream from '@tarojs/taro'
            import backend from 'vite-plugin-taro-runtime/taro'
            export function probe() {
                assert.equal(Taro, Upstream)
                assert.equal(Taro, backend)
                assert.equal(Taro.pxTransform, pxTransform)
                assert.equal(Taro.initPxTransform, initPxTransform)
                assert.equal(Taro.pxTransform(100), '100rpx')
                Taro.initPxTransform({ designWidth: 375, deviceRatio: { 375: 2 } })
                assert.equal(Taro.pxTransform(100), '200rpx')
                assert.equal(pxTransform(12.5), '24rpx')
            }
        `,
            target
        )
        runInNewContext(`globalThis.global = globalThis;\n${code}\nfixture.probe()`, {
            assert,
            console,
            wx: {},
            my: {},
            tt: {},
            navigator: {},
            getApp: () => ({}),
            getCurrentPages: () => []
        })
    })

    test(`retains the shared ${target} API object and native setup when importing a hook`, async () => {
        const code = await bundleMiniApi(
            `
            import Taro from 'virtual:taro/api'
            export { options } from 'vite-plugin-taro-runtime/runtime/mini'
            export const probe = Taro.useLaunch
        `,
            target
        )
        assert.match(code, /createTaroHook\(["']onLaunch["']\)/)
        // Mini still attaches all lifecycle hooks to its shared API object; it does not promise per-hook tree-shaking.
        assert.match(code, /createTaroHook\(["']onUnload["']\)/)
        runInNewContext(
            `globalThis.global = globalThis;\n${code}
            assert.equal(typeof fixture.probe, 'function')
            assert.equal(fixture.options.miniGlobal, ${{ wx: 'wx', zfb: 'my', tt: 'tt' }[target]})
        `,
            {
                assert,
                console,
                wx: {},
                my: {},
                tt: {},
                navigator: {},
                getApp: () => ({}),
                getCurrentPages: () => []
            }
        )
    })

    test(`preserves real ${target} native promises, callbacks, state, and mutable backend identity`, async () => {
        const code = await bundleMiniApi(
            `
            import Taro, { showToast, getStorageSync, useLaunch, options } from 'virtual:taro/api'
            import Upstream from '@tarojs/taro'
            import backend from 'vite-plugin-taro-runtime/taro'
            export async function probe() {
                assert.equal(Taro, Upstream)
                assert.equal(Taro, backend)
                assert.equal(Taro.showToast, showToast)
                assert.equal(Taro.useLaunch, useLaunch)
                assert.equal(Taro.options, options)
                assert.equal(options, backend.options)
                assert.equal(Taro.eventCenter, backend.eventCenter)
                assert.equal(Taro.showToast, backend.showToast)
                assert.equal(backend.useLaunch, useLaunch)
                assert.equal(Taro.fixtureNativeApi(), 'native-extension')
                // Application and backend both own the same mutable API object, including its options.
                options.fixture = 42
                assert.equal(backend.options.fixture, 42)
                assert.equal(options.miniGlobal, native)
                assert.equal(getStorageSync('key'), 'stored')
                const result = await showToast({ title: 'hello', icon: 'success', success: recordSuccess })
                assert.equal(result.errMsg, 'showToast:ok')
                assert.equal(Taro.getEnv(), ${JSON.stringify({ wx: 'WEAPP', zfb: 'ALIPAY', tt: 'TT' }[target])})
                Taro.addInterceptor(chain => {
                    assert.equal(chain.requestParams.url, '/fixture')
                    // This request-local option verifies both exported functions share the same interceptor chain.
                    chain.requestParams.header = { probe: 'yes' }
                    return chain.proceed(chain.requestParams)
                })
                const request = Taro.request({ url: '/fixture' })
                request.abort()
                const response = await request
                assert.equal(response.statusCode, 200)
                assert.equal(response.header.probe, 'received')
                Taro.cleanInterceptors()
                // The original Mini facade permits API replacement on the shared object.
                Taro.showToast = () => 'replacement'
                assert.equal(backend.showToast(), 'replacement')
            }
        `,
            target
        )
        // Each isolated native fixture records receiver/options mapping and callback execution, without global mutation.
        const calls: string[] = []
        const native = {
            fixtureNativeApi: () => 'native-extension',
            canIUse: (name: string) => name === 'request',
            request(options: {
                header?: { probe: string }
                headers?: { probe: string }
                success(result: object): void
            }) {
                assert.equal(target !== 'zfb' ? options.header?.probe : options.headers?.probe, 'yes')
                calls.push('request')
                options.success(
                    target !== 'zfb'
                        ? { statusCode: 200, header: { probe: 'received' } }
                        : { status: 200, headers: { probe: 'received' } }
                )
                return { abort: () => calls.push('abort') }
            },
            showToast(options: { title?: string; content?: string; success(result: { errMsg: string }): void }) {
                assert.equal(this, native)
                assert.equal(target !== 'zfb' ? options.title : options.content, 'hello')
                calls.push('toast')
                options.success({ errMsg: 'showToast:ok' })
            },
            getStorageSync(key: string | { key: string }) {
                assert.equal(this, native)
                assert.equal(typeof key === 'string' ? key : key.key, 'key')
                return target !== 'zfb' ? 'stored' : { data: 'stored' }
            }
        }
        await runInNewContext(`globalThis.global = globalThis;\n${code}\nfixture.probe()`, {
            assert,
            console,
            native,
            wx: native,
            my: native,
            tt: native,
            navigator: {},
            getApp: () => ({}),
            getCurrentPages: () => [],
            recordSuccess: () => calls.push('success')
        })
        assert.deepEqual(calls, ['toast', 'success', 'request', 'abort'])
    })
}
