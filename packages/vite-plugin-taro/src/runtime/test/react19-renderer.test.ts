import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isPromise } from 'node:util/types'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { normalizePath, resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { rendererHostId } from '../../node/plugins/mini/module/module.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../node/utils/packages.ts'

const require = createRequire(import.meta.url)
const rendererPath = resolveTaroRuntime('react')

for (const target of ['wx', 'zfb', 'tt'] as const) {
    for (const mode of ['development', 'production'] as const) {
        test(`${target} ${mode}: React 19 roots, commits, errors and native event priorities`, async (t) => {
            await runFixture(t, target, mode)
        })
    }
}

test('published renderer and declarations expose only the supported React 19 rendering contract', async () => {
    const [renderer, framework, declarations, rootDeclarations] = await Promise.all([
        readFile(rendererPath, 'utf8'),
        readFile(resolveTaroRuntime('plugin-framework-react/runtime'), 'utf8'),
        readFile(path.join(path.dirname(rendererPath), 'index.d.ts'), 'utf8'),
        readFile(path.join(path.dirname(rendererPath), 'render.d.ts'), 'utf8')
    ])
    assert.doesNotMatch(
        renderer,
        /LegacyRoot|isReact19Signature|prepareUpdate\(|getCurrentEventPriority\(|container\.onCommit/
    )
    assert.doesNotMatch(
        framework,
        /react\.Activity|container\.onCommit|page\.mode|RouterContext|preparationRouter|hasPage\(/
    )
    assert.doesNotMatch(renderer, /TaroReconciler\.(?:flushSync\s*=|runWithPriority)|findDOMNode/)
    assert.match(renderer, /TaroReconciler\.flushSyncWork\(\)/)
    assert.match(renderer, /const flushSync = TaroReconciler\.flushSyncFromReconciler/)
    assert.doesNotMatch(framework, /ReactDOM(?:\$1)?\.render|react\.version|typeof ReactDOM\$1\.createRoot/)
    assert.doesNotMatch(declarations, /\bfindDOMNode\b|\brender\s*[:,}]/)
    assert.doesNotMatch(
        rootDeclarations,
        /unstable_concurrentUpdatesByDefault|unstable_transitionCallbacks|function render/
    )
    assert.match(rootDeclarations, /onUncaughtError\?/)
    assert.match(rootDeclarations, /onCaughtError\?/)
})

async function runFixture(t: TestContext, target: 'wx' | 'zfb' | 'tt', mode: string): Promise<void> {
    const config = await resolveConfig(
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
        'build'
    )
    const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'react19-renderer-fixture.js')
    const platform = { wx: 'weapp', zfb: 'alipay', tt: 'tt' }[target]
    const capsuleSource = await readFile(path.join(path.dirname(entry), '../mini/capsule/page.ts'), 'utf8')
    const routes = new Map([
        ['test:page-first-frame.ts', 'pages/first-frame'],
        ['test:page-suspended.ts', 'pages/suspended'],
        ['test:page-bare.ts', 'pages/bare']
    ])
    const result = await build({
        input: entry,
        plugins: [
            {
                name: 'test:react19-renderer',
                resolveId(id, importer) {
                    if (id === entry || routes.has(id) || id === 'test:empty') {
                        return id
                    }
                    if (id === rendererHostId) {
                        return resolveVptRuntime('mini/taro/template-host')
                    }
                    if (id === '\0vpt:global-binding') {
                        return 'test:global'
                    }
                    if (id === '@tarojs/runtime' || id === 'vite-plugin-taro-runtime/runtime/mini') {
                        return resolveTaroRuntime('runtime/mini')
                    }
                    const route = importer && routes.get(importer)
                    if (route) {
                        if (id === '\0vpt:page-component') {
                            return `test:component:${route}`
                        }
                        if (id === './app.ts') {
                            return 'test:empty'
                        }
                        if (id === '../taro/taro-runtime.ts') {
                            return path.join(path.dirname(entry), '../mini/taro/create-vpt-page.ts')
                        }
                        if (id === './prerender-to-data.ts') {
                            return path.join(path.dirname(entry), '../mini/taro/prerender-to-data.ts')
                        }
                    }
                    if (id === './get-page-query.ts') {
                        return 'test:page-query'
                    }
                },
                async load(id) {
                    const route = routes.get(id)
                    if (route) {
                        return capsuleSource.replaceAll(
                            '__VPT_PAGE_OPTIONS__',
                            JSON.stringify({ path: route, prerender: true })
                        )
                    }
                    if (id === 'test:empty') {
                        return ''
                    }
                    if (id === 'test:global') {
                        return 'export const vptGlobal = global'
                    }
                    if (id === 'test:page-query') {
                        return 'export const getPageQuery = () => globalThis.pageQuery'
                    }
                    if (id.startsWith('test:component:')) {
                        // Keep each capsule's component identity stable while the fixture supplies its hook-rich body.
                        return `export default function Page(props) {
                            return globalThis.pageComponents[${JSON.stringify(id.slice('test:component:'.length))}](props)
                        }`
                    }
                    if (id === entry) {
                        return `import ${JSON.stringify(resolveTaroRuntime(`plugin-platform-${platform}/runtime`))}\n${fixture}`
                    }
                    if (normalizePath(id) === normalizePath(rendererPath)) {
                        // Observe the actual host contract without replacing React, its scheduler, or any renderer method.
                        return `${await readFile(rendererPath, 'utf8')}\nexport { hostConfig as rendererHostConfig };`
                    }
                }
            }
        ],
        transform: {
            ...config.build.rolldownOptions.transform,
            define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify(mode) }
        },
        output: { format: 'cjs' },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk?.type === 'chunk')
    // Own all scheduler/bridge timers in this isolated VM, including cleanup after failed assertions.
    const timers = new Set<ReturnType<typeof setTimeout>>()
    t.after(() => {
        for (const timer of timers) {
            clearTimeout(timer)
        }
    })
    const completion: unknown = runInNewContext(chunk.code, {
        exports: {},
        require,
        global: {},
        console: { ...console, info() {} },
        performance,
        getCurrentPages: () => [],
        setTimeout(callback: (...args: unknown[]) => void, delay: number | undefined, ...args: unknown[]) {
            const timer = setTimeout(() => {
                timers.delete(timer)
                callback(...args)
            }, delay)
            timers.add(timer)
            return timer
        },
        clearTimeout(timer: ReturnType<typeof setTimeout>) {
            timers.delete(timer)
            clearTimeout(timer)
        }
    })
    assert.ok(isPromise(completion))
    await completion
}

const fixture = `
import assert from 'node:assert/strict'
import React from 'react'
import { ConcurrentRoot, DiscreteEventPriority, ContinuousEventPriority, DefaultEventPriority, NoEventPriority } from 'react-reconciler/constants'
import ReactDOM, { rendererHostConfig } from 'vite-plugin-taro-runtime/react'
import { Current, document, eventHandler, hooks, createPageConfig as createTaroPageConfig } from '@tarojs/runtime'
import config from 'test:page-first-frame.ts'
import suspendedConfig from 'test:page-suspended.ts'
import bareConfig from 'test:page-bare.ts'
// This fixture-local query models the native routing input for each independent data callback.
function renderInitialData(config, query) {
    globalThis.pageQuery = query
    return config.data()
}
const prerenderToData = query => renderInitialData(config, query)
const prerenderSuspended = query => renderInitialData(suspendedConfig, query)
const prerenderBare = query => renderInitialData(bareConfig, query)
import { createVptApp } from ${JSON.stringify(resolveVptRuntime('mini/taro/create-vpt-app'))}
import { createReactApp, createNativeComponentConfig, setReconciler, useLoad, useUnload, useRouter } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'

const h = React.createElement
// VM-local component bodies are installed before invoking their actual route capsule's renderer.
const pageComponents = globalThis.pageComponents = {}

async function checkRootsAndCommits() {
    assert.equal('render' in ReactDOM, false)
    assert.equal('findDOMNode' in ReactDOM, false)
    const container = document.createElement('root')
    const root = ReactDOM.createRoot(container)
    assert.equal(root.internalRoot.tag, ConcurrentRoot)
    assert.strictEqual(ReactDOM.createRoot(container), root)
    assert.equal(ReactDOM.unmountComponentAtNode(document.createElement('root')), false)
    assert.throws(() => ReactDOM.unmountComponentAtNode(null), /Target container/)

    // Unforced mounting is asynchronous and acknowledges an actual host commit.
    const mounted = new Promise(resolve => root.render(h('view', { className: 'before' }, 'first'), resolve))
    assert.equal(container.childNodes.length, 0)
    await mounted
    const view = container.firstChild
    assert.equal(view.className, 'before')
    assert.equal(view.textContent, 'first')
    assert.equal(ReactDOM.flushSync(() => {
        root.render(h('view', { className: 'after', style: { color: 'red' } }, 'second'))
        return 42
    }), 42)
    assert.strictEqual(container.firstChild, view)
    assert.equal(view.className, 'after')
    assert.equal(view.style.color, 'red')
    assert.equal(view.textContent, 'second')
    ReactDOM.flushSync(() => root.render(h('view', null, 'third')))
    assert.equal(view.className, '')
    assert.equal(view.style.color, '')
    assert.equal(view.textContent, 'third')

    // React owns these ref cells; keyed moves must retain the same host objects and update only their order.
    const refs = { first: React.createRef(), second: React.createRef() }
    const rows = order => order.map(id => h('view', { key: id, ref: refs[id] }, id))
    ReactDOM.flushSync(() => root.render(rows(['first', 'second'])))
    const first = refs.first.current
    const second = refs.second.current
    assert.strictEqual(container.childNodes[0], first)
    assert.strictEqual(container.childNodes[1], second)
    ReactDOM.flushSync(() => root.render(rows(['second', 'first'])))
    assert.strictEqual(container.childNodes[0], second)
    assert.strictEqual(container.childNodes[1], first)
    assert.strictEqual(refs.first.current, first)
    assert.strictEqual(refs.second.current, second)
    ReactDOM.flushSync(() => root.render(rows(['first'])))
    assert.strictEqual(container.firstChild, first)
    assert.equal(refs.second.current, null)

    const portalContainer = document.createElement('root')
    ReactDOM.flushSync(() => root.render(ReactDOM.createPortal(h('text', null, 'portal'), portalContainer)))
    assert.equal(portalContainer.textContent, 'portal')
    // The teardown acknowledgement runs after host removal and releases the container for reuse.
    let unmounted = false
    ReactDOM.flushSync(() => root.unmount(() => { unmounted = true }))
    assert.equal(unmounted, true)
    assert.equal(container.childNodes.length, 0)
    assert.equal(portalContainer.childNodes.length, 0)
    assert.equal(ReactDOM.unmountComponentAtNode(container), false)
    const replacement = ReactDOM.createRoot(container)
    assert.notStrictEqual(replacement, root)
    ReactDOM.flushSync(() => replacement.render(h('view')))
    ReactDOM.flushSync(() => assert.equal(ReactDOM.unmountComponentAtNode(container), true))
    assert.equal(container.childNodes.length, 0)
}

function checkRootOptionsAndErrors() {
    const defaultRoot = ReactDOM.createRoot(document.createElement('root'), {})
    const logged = []
    const consoleError = console.error
    const defaultError = new Error('default callback')
    console.error = value => logged.push(value)
    try {
        defaultRoot.internalRoot.onUncaughtError(defaultError, {})
        defaultRoot.internalRoot.onRecoverableError(defaultError, {})
        defaultRoot.internalRoot.onCaughtError(defaultError, { componentStack: 'stack' })
        defaultRoot.internalRoot.onCaughtError(defaultError, {})
        assert.deepEqual(logged, [defaultError, defaultError, defaultError, 'stack', defaultError])
    } finally {
        console.error = consoleError
        ReactDOM.flushSync(() => defaultRoot.unmount())
    }
    const container = document.createElement('root')
    const caught = []
    const uncaught = []
    const onCaughtError = (error, info) => caught.push({ error, info })
    const onUncaughtError = (error, info) => uncaught.push({ error, info })
    const onRecoverableError = () => assert.fail('unexpected recovery')
    const root = ReactDOM.createRoot(container, {
        unstable_strictMode: true,
        identifierPrefix: 'mini-',
        onCaughtError,
        onUncaughtError,
        onRecoverableError
    })
    assert.equal(root.internalRoot.tag, ConcurrentRoot)
    assert.equal(root.internalRoot.identifierPrefix, 'mini-')
    assert.strictEqual(root.internalRoot.onCaughtError, onCaughtError)
    assert.strictEqual(root.internalRoot.onUncaughtError, onUncaughtError)
    assert.strictEqual(root.internalRoot.onRecoverableError, onRecoverableError)
    function Identity() {
        return h('text', null, React.useId())
    }
    ReactDOM.flushSync(() => root.render(h(Identity)))
    assert.match(container.textContent, /mini-/)
    class Boundary extends React.Component {
        state = { failed: false }
        static getDerivedStateFromError() {
            return { failed: true }
        }
        render() {
            return this.state.failed ? h('text', null, 'fallback') : this.props.children
        }
    }
    const failure = new Error('expected render failure')
    function Broken() {
        throw failure
    }
    ReactDOM.flushSync(() => root.render(h(Boundary, null, h(Broken))))
    assert.equal(caught.length, 1)
    assert.strictEqual(caught[0].error, failure)
    assert.match(caught[0].info.componentStack, /Broken/)
    assert.equal(container.textContent, 'fallback')
    ReactDOM.flushSync(() => root.render(h(Broken)))
    assert.equal(uncaught.length, 1)
    assert.strictEqual(uncaught[0].error, failure)
    assert.equal(container.childNodes.length, 0)
    ReactDOM.flushSync(() => root.unmount())
}

function checkEventPrioritiesAndControlledInputs() {
    const container = document.createElement('root')
    const root = ReactDOM.createRoot(container)
    const priorities = []
    const failure = new Error('nested event')
    rendererHostConfig.setCurrentUpdatePriority(NoEventPriority)
    assert.equal(rendererHostConfig.resolveUpdatePriority(), DefaultEventPriority)
    hooks.call('dispatchTaroEvent', { type: 'click' }, {
        dispatchEvent() {
            priorities.push(rendererHostConfig.getCurrentUpdatePriority())
            assert.throws(() => hooks.call('dispatchTaroEvent', { type: 'scroll' }, {
                dispatchEvent() {
                    priorities.push(rendererHostConfig.getCurrentUpdatePriority())
                    throw failure
                }
            }), error => error === failure)
            priorities.push(rendererHostConfig.resolveUpdatePriority())
        }
    })
    assert.deepEqual(priorities, [DiscreteEventPriority, ContinuousEventPriority, DiscreteEventPriority])
    assert.equal(rendererHostConfig.getCurrentUpdatePriority(), NoEventPriority)
    hooks.call('dispatchTaroEvent', { type: 'tap' }, {
        dispatchEvent() {
            assert.equal(rendererHostConfig.getCurrentUpdatePriority(), DiscreteEventPriority)
        }
    })
    assert.equal(rendererHostConfig.getCurrentUpdatePriority(), NoEventPriority)
    hooks.call('dispatchTaroEvent', { type: 'custom' }, {
        dispatchEvent() {
            assert.equal(rendererHostConfig.getCurrentUpdatePriority(), DefaultEventPriority)
        }
    })
    assert.equal(rendererHostConfig.getCurrentUpdatePriority(), NoEventPriority)

    setReconciler(ReactDOM)
    function Input() {
        const [value, setValue] = React.useState('initial')
        return h('input', {
            id: 'controlled-input',
            value,
            onInput(event) { setValue(event.detail.value.toUpperCase()) }
        })
    }
    ReactDOM.flushSync(() => root.render(h(Input)))
    const input = container.firstChild
    ReactDOM.unstable_batchedUpdates(() => {
        ReactDOM.unstable_batchedUpdates(() => eventHandler({
            type: 'input', target: { id: input.id }, detail: { value: 'edited' }
        }))
        assert.equal(input.value, 'edited', 'native input remains unrestored until the outer event boundary')
    })
    assert.equal(input.value, 'EDITED', 'sync work commits before restoring the controlled native value')
    ReactDOM.flushSync(() => root.render(h('input', { id: 'fixed-input', value: 'fixed', onInput() {} })))
    eventHandler({ type: 'input', target: { id: 'fixed-input' }, detail: { value: 'rejected' } })
    assert.equal(container.firstChild.value, 'fixed')
    assert.equal(container.firstChild._valueTracker.getValue(), 'fixed')

    ReactDOM.flushSync(() => root.render(h('input', { key: 'uncontrolled', defaultValue: 'seed' })))
    const uncontrolled = container.firstChild
    assert.equal(uncontrolled.value, 'seed')
    uncontrolled.value = 'native edit'
    ReactDOM.flushSync(() => root.render(h('input', {
        key: 'uncontrolled', defaultValue: 'seed', className: 'updated'
    })))
    assert.strictEqual(container.firstChild, uncontrolled)
    assert.equal(uncontrolled.value, 'native edit')
    ReactDOM.flushSync(() => root.render(h('switch', { defaultChecked: true })))
    assert.equal(container.firstChild.props.checked, true)
    assert.equal(Object.hasOwn(container.firstChild.props, 'defaultChecked'), false)
    ReactDOM.flushSync(() => root.unmount())
}

function checkPageConfigData() {
    // Page registration preserves the public data contract and does not mount React or require an initialized App.
    const data = { page: { cn: [] } }
    const baseConfig = createTaroPageConfig(() => assert.fail('registration must not render'), 'pages/config', data, {})
    assert.strictEqual(baseConfig.data, data)
    assert.equal(createTaroPageConfig.length, 4, 'the upstream factory signature stays unchanged')
    assert.equal(Object.hasOwn(baseConfig, '__vpt_meta'), false)
    assert.equal(Object.hasOwn(baseConfig, 'prerenderToData'), false)
    assert.equal(Object.hasOwn(config, 'prerenderToData'), false)
    assert.equal(Object.getOwnPropertyDescriptor(config, '__vpt_meta').enumerable, false)
    assert.equal(Object.hasOwn({ ...config }, '__vpt_meta'), false)
    assert.equal(config.__vpt_meta.prerenderIdentity, undefined)
    assert.equal(typeof config.data, 'function')
    assert.equal(typeof prerenderToData, 'function')
}

async function checkNativeInitialData() {
    if (process.env.TARO_ENV !== 'weapp') {
        return
    }
    // Exercise cold queued mounts and warm synchronous prerendering with real React and native onLoad.
    const initialized = []
    const effects = []
    const loads = []
    const unloads = []
    const setters = new Map()
    const routers = new Map()
    const context = React.createContext('missing')
    let setAppValue
    function App({ children }) {
        const [value, update] = React.useState('first-context')
        setAppValue = update
        return h(context.Provider, { value }, h('view', null, children))
    }
    function Page() {
        const router = useRouter()
        const dynamic = useRouter(true)
        const value = React.useContext(context)
        const id = router.params.id
        routers.set(id, { router, dynamic })
        const [count, update] = React.useState(() => { initialized.push(id); return 0 })
        setters.set(id, update)
        useLoad(params => {
            assert.strictEqual(params, router.params)
            loads.push(params)
        })
        useUnload(() => unloads.push(id))
        React.useLayoutEffect(() => {
            effects.push('layout:' + id)
            return () => effects.push('cleanup:' + id)
        }, [])
        React.useEffect(() => {
            effects.push('passive:' + id)
            return () => effects.push('passive-cleanup:' + id)
        }, [])
        return h('view', { id: 'view-' + id, onClick: () => update(n => n + 1) }, value + ':' + id + ':' + count)
    }
    const seed = () => ({ app: { nn: 'vpt_fragment', cn: [] }, page: { cn: [] } })
    const native = (route, data) => ({ route, data, writes: [], setData(data, cb) { this.writes.push(data); cb?.() } })
    const until = async predicate => {
        const deadline = Date.now() + 3000
        while (!predicate()) {
            assert.ok(Date.now() < deadline, 'timed out waiting for the real renderer')
            await new Promise(resolve => setTimeout(resolve, 5))
        }
    }
    createVptApp(App, {
        appId: 'first-frame-app', componentFramework: 'glass-easel'
    })
    pageComponents['pages/first-frame'] = Page
    const dataFactory = config.data
    const metadata = config.__vpt_meta
    assert.deepEqual(metadata, {})
    const sourceData = prerenderToData({ id: 'source', full: 'a%3Db' })
    const initialRouter = Current.router
    const initialPage = metadata.prerenderIdentity
    assert.equal(initialPage.path, initialRouter.$taroPath)
    assert.strictEqual(initialPage.params, initialRouter.params)
    assert.strictEqual(config.data, dataFactory, 'native initialization preserves the capsule data factory')
    assert.deepEqual(sourceData, seed(), 'cold startup keeps the seed and mounts asynchronously')
    assert.equal(setAppValue, undefined, 'prerender must not force App initialization')
    assert.deepEqual(initialized, [])
    assert.deepEqual(effects, [])
    assert.deepEqual(loads, [], 'the factory must not synthesize native onLoad')
    assert.equal(Current.page, null)
    assert.equal(document.getElementById('view-source'), null)
    const source = native('pages/first-frame', sourceData)
    config.onLoad.call(source, { id: 'source', full: 'a%3Db' })
    assert.equal(metadata.prerenderIdentity, undefined, 'onLoad consumes the prepared identity immediately')
    assert.strictEqual(config.__vpt_meta, metadata, 'onLoad preserves the identity handoff object')
    assert.deepEqual(Object.keys(metadata), ['prerenderIdentity'])
    assert.strictEqual(source.$taroParams, initialPage.params)
    assert.strictEqual(source.$taroParams, initialRouter.params)
    assert.equal(source.$taroPath, initialRouter.$taroPath)
    config.onShow.call(source)
    await until(() => source.writes.length > 0)
    const sourceHost = document.getElementById('view-source')
    assert.match(sourceHost.textContent, /first-context:source:0/)
    assert.deepEqual(initialized, ['source'], 'queued prerender and onLoad mount one Page instance')
    assert.equal(effects.filter(x => x === 'layout:source').length, 1)
    assert.equal(loads[0].full, 'a%3Db')
    assert.strictEqual(Current.page, source)

    ReactDOM.flushSync(() => setAppValue('latest-context'))
    const targetData = prerenderToData({ id: 'target' })
    const targetIdentity = metadata.prerenderIdentity
    assert.notEqual(targetIdentity.path, initialPage.path)
    assert.equal(Object.getOwnPropertyDescriptor(config, '__vpt_meta').enumerable, false)
    const targetHost = document.getElementById('view-target')
    assert.equal(targetData.page.cn[0].sid, targetHost.sid)
    assert.notEqual(targetHost.sid, sourceHost.sid)
    assert.match(JSON.stringify(targetData.page), /latest-context:target:0/)
    assert.doesNotMatch(JSON.stringify(targetData.app), /view-source|view-target/)
    assert.deepEqual(initialized, ['source', 'target'], 'each data callback mounts exactly one new instance')
    assert.deepEqual(loads.map(x => x.id), ['source'])
    assert.strictEqual(Current.page, source, 'router initialization does not invent a native Page instance')

    // Preserve both upstream useRouter modes: the default captures its mount route; dynamic reads Current.router.
    ReactDOM.flushSync(() => setters.get('source')(3))
    assert.equal(routers.get('source').router.params.id, 'source')
    assert.strictEqual(routers.get('source').dynamic, Current.router)
    assert.equal(routers.get('source').dynamic.params.id, 'target')

    const target = native('pages/first-frame', targetData)
    config.onLoad.call(target, { id: 'target' })
    assert.equal(metadata.prerenderIdentity, undefined)
    assert.equal(target.$taroPath, targetIdentity.path)
    assert.strictEqual(target.$taroParams, targetIdentity.params)
    config.onShow.call(target)
    await until(() => target.writes.length > 0)
    assert.strictEqual(document.getElementById('view-target'), targetHost)
    assert.deepEqual(initialized, ['source', 'target'], 'onLoad reuses the already-rendered Page instance')
    assert.ok(Object.hasOwn(target.writes[0], 'app.cn'))
    assert.equal(effects.filter(x => x === 'layout:target').length, 1)
    assert.deepEqual(loads.map(x => x.id), ['source', 'target'])
    const writeCount = target.writes.length
    eventHandler({ type: 'tap', target: { id: targetHost.id }, detail: {} })
    assert.equal(target.writes.length, writeCount, 'ordinary updates remain asynchronous')
    await until(() => targetHost.textContent === 'latest-context:target:1' && target.writes.length > writeCount)
    config.onHide.call(target)
    config.onShow.call(source)
    await until(() => Current.page === source)
    assert.equal(effects.includes('cleanup:target'), false)
    config.onUnload.call(target)
    await until(() => effects.includes('passive-cleanup:target'))
    assert.deepEqual(unloads, ['target'])
    config.onUnload.call(source)
    await until(() => effects.includes('passive-cleanup:source'))

    // The consumed identity must not leak into a later native instance that enters onLoad without prerendering.
    const unprepared = native('pages/first-frame', seed())
    config.onLoad.call(unprepared, { id: 'unprepared' })
    await until(() => unprepared.writes.length > 0)
    assert.equal(unprepared.$taroParams.id, 'unprepared')
    assert.notEqual(unprepared.$taroPath, target.$taroPath)
    config.onUnload.call(unprepared)
    await until(() => effects.includes('passive-cleanup:unprepared'))

    // Empty pages retain their ordinary empty seed and asynchronous onLoad without an extra Page snapshot.
    const emptyConfig = createTaroPageConfig(() => null, 'pages/empty', seed(), {})
    assert.deepEqual(emptyConfig.data, seed(), 'ordinary pages retain their static data object')
    const empty = native('pages/empty', seed())
    emptyConfig.onLoad.call(empty, {})
    assert.equal(Object.hasOwn(emptyConfig, '__vpt_meta'), false, 'ordinary configs gain no VPT metadata')
    await until(() => empty.writes.length > 0)
    assert.deepEqual(empty.data.page.cn, [])
    assert.equal(document.getElementById(empty.$taroPath).childNodes.length, 0)
    emptyConfig.onUnload.call(empty)

    let resolveContent
    const content = new Promise(resolve => { resolveContent = resolve })
    function Content() {
        return h('text', null, React.use(content))
    }
    function SuspendedPage() {
        return h(React.Suspense, { fallback: h('text', null, 'loading') }, h(Content))
    }
    pageComponents['pages/suspended'] = SuspendedPage
    const suspendedData = prerenderSuspended({})
    assert.match(JSON.stringify(suspendedData.page), /loading/, 'the factory returns the committed fallback without waiting')
    const suspended = native('pages/suspended', suspendedData)
    suspendedConfig.onLoad.call(suspended, {})
    await until(() => suspended.writes.length > 0)
    resolveContent('resolved-content')
    await until(() => document.getElementById(suspended.$taroPath).textContent === 'resolved-content')
    suspendedConfig.onUnload.call(suspended)

    // Without any Suspense boundary there is no committed Page yet; return the seed and let normal mounting finish.
    let resolveBare
    const bareContent = new Promise(resolve => { resolveBare = resolve })
    function BarePage() {
        return h('text', null, React.use(bareContent))
    }
    pageComponents['pages/bare'] = BarePage
    const bareData = prerenderBare({})
    assert.deepEqual(bareData, seed())
    const bare = native('pages/bare', bareData)
    bareConfig.onLoad.call(bare, {})
    resolveBare('bare-content')
    await until(() => bare.writes.length > 0)
    assert.equal(document.getElementById(bare.$taroPath).textContent, 'bare-content')
    bareConfig.onUnload.call(bare)
    ReactDOM.flushSync(() => ReactDOM.unmountComponentAtNode(document.getElementById('first-frame-app')))
    Current.app = null
    Current.page = null
    Current.router = null
}

function checkFrameworkRootEntryPoints() {
    // A renderer double records bootstrap ordering; it deliberately has no legacy render API.
    const calls = []
    let commit
    const renderer = {
        unstable_batchedUpdates: ReactDOM.unstable_batchedUpdates,
        createRoot(container) {
            calls.push('createRoot')
            assert.equal(container.id, 'app')
            return {
                render(element) {
                    calls.push('render')
                    commit = () => {
                        const instance = new element.type(element.props)
                        instance.componentDidMount()
                    }
                }
            }
        },
        flushSync(callback) {
            calls.push('flushSync')
            callback()
            commit()
            calls.push('committed')
        }
    }
    createReactApp(({ children }) => children, React, renderer, {})
    assert.equal(Current.app.mount.length, 3, 'mount retains its original signature')
    ReactDOM.flushSync(() => Current.app.mount(() => null, 'pages/cold', () => assert.fail('cold App must not be flushed')))
    assert.deepEqual(calls, ['createRoot', 'render'], 'prerender does not force or repeat App initialization')
    Current.app = null
    calls.length = 0
    const config = createNativeComponentConfig(() => null, React, renderer, {})
    config.created.call({})
    assert.deepEqual(calls, ['flushSync', 'createRoot', 'render', 'committed'])
    assert.equal(typeof Current.app.mount, 'function', 'native Entry is ready before created returns')
}

async function run() {
    await checkRootsAndCommits()
    checkRootOptionsAndErrors()
    checkEventPrioritiesAndControlledInputs()
    checkPageConfigData()
    await checkNativeInitialData()
    checkFrameworkRootEntryPoints()
}
run()
`
