import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { Children, type CSSProperties, isValidElement, type PropsWithChildren } from 'react'
import { build } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)

test('builds Loan Genius as a native TT project without WeChat or Alipay configuration', async () => {
    // Vite config reads the environment; restore this test-process state after the real build completes.
    const previousEnv = process.env
    process.env = { ...previousEnv, VITE_VPT_TARGET: 'tt', VITE_VPT_TIKTOK_APP_ID: 'tt-loan-fixture' }
    try {
        const result = await build({ root, logLevel: 'silent', build: { write: false } })
        assert.ok(!Array.isArray(result) && 'output' in result)
        const assets = new Map(
            result.output
                .filter((output) => output.type === 'asset')
                .map((asset) => [asset.fileName, String(asset.source)])
        )
        const app = JSON.parse(assets.get('app.json')!)
        assert.deepEqual(app.pages, [
            'pages/calculator/index',
            'pages/calculator/monthly-payments/index',
            'pages/calculator/history/index'
        ])
        assert.deepEqual(app.window, { navigationStyle: 'custom' })
        for (const key of [
            'renderer',
            'rendererOptions',
            'componentFramework',
            'lazyCodeLoading',
            'useDynamicPlugins'
        ]) {
            assert.equal(app[key], undefined, key)
        }
        for (const page of app.pages) {
            assert.ok(assets.has(`${page}.ttml`), page)
            assert.ok(assets.has(`${page}.ttss`), page)
        }
        assert.ok(assets.has('base.ttml'))
        assert.ok(assets.has('utils.sjs'))
        assert.ok(assets.has('app.ttss'))
        assert.ok(assets.has('assets/global.ttss'))
        assert.deepEqual(JSON.parse(assets.get('project.config.json')!), {
            appid: 'tt-loan-fixture',
            projectname: '房贷计算器',
            miniprogramRoot: './',
            compileHotReload: true,
            setting: { urlCheck: false, es6: false, postcss: false, minified: false, autoCompile: true }
        })
        assert.equal(assets.has('sitemap.json'), false)
        assert.deepEqual(JSON.parse(assets.get('project.private.config.json')!), { setting: { urlCheck: false } })
        assert.equal(assets.has('mini.project.json'), false)
        assert.equal(
            [...assets.keys()].some((name) => /\.(?:wxml|wxss|wxs|axml|acss)$/.test(name)),
            false
        )
    } finally {
        process.env = previousEnv
    }
})

test('builds Loan Genius as a native Taobao project with its own App ID', async () => {
    // Vite reads process environment during config evaluation; this build owns and restores its target selection.
    const previousEnv = process.env
    process.env = {
        ...previousEnv,
        VITE_VPT_TARGET: 'tb',
        VITE_VPT_TAOBAO_APP_ID: 'tb-loan-fixture',
        VITE_VPT_ALIPAY_APP_ID: 'zfb-loan-fixture'
    }
    try {
        const result = await build({ root, logLevel: 'silent', build: { write: false } })
        assert.ok(!Array.isArray(result) && 'output' in result)
        const assets = new Map(
            result.output
                .filter((output) => output.type === 'asset')
                .map((asset) => [asset.fileName, String(asset.source)])
        )
        const app = JSON.parse(assets.get('app.json')!)
        assert.deepEqual(app.pages, [
            'pages/calculator/index',
            'pages/calculator/monthly-payments/index',
            'pages/calculator/history/index'
        ])
        assert.deepEqual(app.window, { transparentTitle: 'always', titlePenetrate: 'YES' })
        assert.equal(app.subPackageBuildType, 'shared')
        assert.equal(app.lazyCodeLoading, 'renderedComponents')
        for (const page of app.pages) {
            assert.ok(assets.has(`${page}.axml`), page)
            assert.ok(assets.has(`${page}.acss`), page)
            assert.deepEqual(JSON.parse(assets.get(`${page}.json`)!).usingComponents, {
                comp: path.posix.relative(path.posix.dirname(page), 'comp'),
                'custom-wrapper': path.posix.relative(path.posix.dirname(page), 'custom-wrapper')
            })
        }
        for (const file of ['base.axml', 'utils.sjs', 'app.acss', 'assets/global.acss']) {
            assert.ok(assets.has(file), file)
        }
        const project = JSON.parse(assets.get('mini.project.json')!)
        assert.equal(project.appid, 'tb-loan-fixture')
        assert.equal(project.format, 2)
        assert.equal(project.compileOptions.component2, true)
        assert.equal(project.compileOptions.globalObjectMode, 'enable')
        assert.deepEqual(JSON.parse(assets.get('.mini-ide/project-ide.json')!), {
            ignoreHttpDomainCheck: true,
            ignoreCertificateDomainCheck: true,
            ignoreWebViewDomainCheck: true
        })
        assert.equal(assets.has('sitemap.json'), false)
        assert.equal(assets.has('project.config.json'), false)
        assert.equal(
            [...assets.keys()].some((name) => /\.(?:wxml|wxss|wxs|ttml|ttss)$/.test(name)),
            false
        )
    } finally {
        process.env = previousEnv
    }
})

for (const target of ['tt', 'zfb', 'tb'] as const) {
    test(`${target}: navigation and Android detection use the selected native APIs`, async () => {
        // Compile the real source with its target define; only the native API/component boundary is mocked at execution.
        const result = await build({
            root,
            configFile: false,
            logLevel: 'silent',
            define: { 'import.meta.env.VITE_VPT_TARGET': JSON.stringify(target) },
            plugins: [
                {
                    name: 'loan-native-api-fixture',
                    resolveId: (id) => (id === '\0fixture' ? id : undefined),
                    load: (id) =>
                        id === '\0fixture'
                            ? `
                    export { NavigationBar } from ${JSON.stringify(path.join(root, 'src/components/navigation-bar/navigation-bar.tsx'))}
                    export { isAndroid } from ${JSON.stringify(path.join(root, 'src/utils/across-api.ts'))}
                `
                            : undefined
                }
            ],
            build: {
                write: false,
                minify: false,
                rolldownOptions: {
                    input: '\0fixture',
                    preserveEntrySignatures: 'strict',
                    external: ['react/jsx-runtime', 'clsx', 'virtual:taro/api', 'virtual:taro/components'],
                    output: { format: 'cjs' }
                }
            }
        })
        assert.ok(!Array.isArray(result) && 'output' in result)
        const chunk = result.output.find((output) => output.type === 'chunk')
        assert.ok(chunk)
        for (const [platform, system, android] of [
            ['android', 'Android 15', true],
            ['devtools', 'Android 15', true],
            ['ios', 'iOS 18', false]
        ] as const) {
            // Each native runtime instance owns its module exports and call journal; repeat renders must reuse cached layout metrics.
            const module: { exports: Record<string, unknown> } = { exports: {} }
            const calls: string[] = []
            const api = {
                getSystemInfoSync() {
                    calls.push('system')
                    return { platform, system, screenWidth: 390, statusBarHeight: 44, titleBarHeight: 44 }
                },
                ...(target === 'tt'
                    ? {
                          getMenuButtonBoundingClientRect() {
                              calls.push('menu')
                              return { height: 32, right: 380, top: 50, width: 88 }
                          }
                      }
                    : {
                          getDeviceInfo() {
                              calls.push('device')
                              return { platform, system }
                          }
                      }),
                getCurrentPages: () => []
            }
            runInNewContext(chunk.code, {
                module,
                exports: module.exports,
                require(id: string) {
                    if (id === 'virtual:taro/api') {
                        return api
                    }
                    if (id === 'virtual:taro/components') {
                        return { View: 'div' }
                    }
                    return require(id)
                }
            })
            const { NavigationBar, isAndroid } = module.exports
            assert.ok(typeof NavigationBar === 'function' && typeof isAndroid === 'function')
            type StyledProps = PropsWithChildren<{ style: CSSProperties }>
            const element: unknown = NavigationBar({ children: 'Loan Genius' })
            assert.ok(isValidElement<StyledProps>(element))
            assert.equal(element.props.style.height, '88px')
            const content = Children.only(element.props.children)
            assert.ok(isValidElement<StyledProps>(content))
            assert.equal(content.props.style.top, '44px')
            assert.equal(content.props.style.padding, target === 'tt' ? '6px 10px' : '6px 16px')
            const side = Children.toArray(content.props.children)[0]
            assert.ok(isValidElement<StyledProps>(side))
            assert.equal(side.props.style.flexBasis, target === 'tt' ? '88px' : '44px')
            assert.equal(side.props.style.width, target === 'tt' ? '88px' : '44px')
            NavigationBar({ children: 'Loan Genius' })
            assert.deepEqual(calls, target === 'tt' ? ['system', 'menu'] : ['system'])
            assert.equal(isAndroid(), android)
            assert.deepEqual(calls, target === 'tt' ? ['system', 'menu', 'system'] : ['system', 'device'])
        }
    })
}
