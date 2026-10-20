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
    const [renderer, framework, declarations, rootDeclarations, hostDeclarations] = await Promise.all([
        readFile(rendererPath, 'utf8'),
        readFile(resolveTaroRuntime('plugin-framework-react/runtime'), 'utf8'),
        readFile(path.join(path.dirname(rendererPath), 'index.d.ts'), 'utf8'),
        readFile(path.join(path.dirname(rendererPath), 'render.d.ts'), 'utf8'),
        readFile(path.join(path.dirname(rendererPath), 'renderer-host.d.ts'), 'utf8')
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
    assert.match(hostDeclarations, /getPageRootType\(id: string\): string/)
    assert.match(hostDeclarations, /getChildHostContext\(parentContext: Context, type: string\): Context/)
    assert.match(hostDeclarations, /batchStyleUpdate\(element: Element, update: \(\) => void\): void/)
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
                        return resolveVptRuntime('mini/template/template-host')
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
                        if (id === '../vpt/vpt-runtime.ts') {
                            return path.join(path.dirname(entry), '../mini/vpt/create-vpt-page.ts')
                        }
                        if (id === '../template/prerender-to-data.ts') {
                            return path.join(path.dirname(entry), '../mini/template/prerender-to-data.ts')
                        }
                    }
                    if (id === './get-page-query.ts' || id === '../vpt/get-page-query.ts') {
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
import 'vite-plugin-taro-runtime/plugin-html/runtime'
import assert from 'node:assert/strict'
import React from 'react'
import { toDashed } from '@tarojs/shared'
import { ConcurrentRoot, DiscreteEventPriority, ContinuousEventPriority, DefaultEventPriority, NoEventPriority } from 'react-reconciler/constants'
import ReactDOM, { rendererHostConfig } from 'vite-plugin-taro-runtime/react'
import rendererHost from ${JSON.stringify(rendererHostId)}
import { createDomHost } from ${JSON.stringify(resolveVptRuntime('wx/create-dom-host'))}
import { createWxTestRoot } from ${JSON.stringify(resolveVptRuntime('test/create-wx-test-root'))}
import { Current, document, eventHandler, hooks, TaroElement, TaroEvent, createPageConfig as createTaroPageConfig } from '@tarojs/runtime'
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
import { createVptApp } from ${JSON.stringify(resolveVptRuntime('mini/vpt/create-vpt-app'))}
import { connectReactPage, createReactApp, createNativeComponentConfig, setReconciler, useLoad, useUnload, useRouter } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'

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

function checkEventHandlerReplacement() {
    const delegate = TaroElement.prototype.delegateEventListener
    // Observe logical subscription transitions independently of template serialization and native transport.
    const transitions = []
    TaroElement.extend('delegateEventListener', function (type, subscribed) {
        transitions.push([type, subscribed])
        delegate.call(this, type, subscribed)
    })
    try {
        for (const [tag, prop, type] of [
            ['view', 'onClick', 'tap'],
            ['text', 'onClick', 'tap'],
            ['div', 'onClick', 'click'],
            ['native-card', 'onCustomEvent', 'customevent']
        ]) {
            const container = document.createElement('root')
            const root = ReactDOM.createRoot(container)
            // Dispatch observations distinguish current closures, imperative listeners and once cleanup.
            const calls = []
            const first = () => calls.push('first')
            const render = handler => ReactDOM.flushSync(() => root.render(h(tag, { [prop]: handler }, 'body')))
            try {
                render(first)
                const node = container.firstChild
                const handlers = node.__handlers[type]
                assert.deepEqual(transitions.splice(0), [[type, true]], tag + ': initial subscription')
                node.dispatchEvent(new TaroEvent(type))
                assert.deepEqual(calls.splice(0), ['first'])

                const wrapper = handlers[0]
                render(first)
                assert.strictEqual(node.__handlers[type], handlers)
                assert.strictEqual(handlers[0], wrapper)
                assert.deepEqual(transitions.splice(0), [])

                for (const value of ['second', 'third', 'fourth']) {
                    render(() => calls.push(value))
                    assert.strictEqual(node.__handlers[type], handlers)
                    assert.equal(handlers.length, 1)
                    assert.deepEqual(transitions.splice(0), [], tag + ': replacement retains the native subscription')
                    node.dispatchEvent(new TaroEvent(type))
                    assert.deepEqual(calls.splice(0), [value], tag + ': dispatch uses the latest closure')
                }

                const imperative = () => calls.push('imperative')
                node.addEventListener(type, imperative)
                render(() => calls.push('replacement'))
                assert.equal(handlers.length, 2)
                assert.deepEqual(transitions.splice(0), [])
                node.dispatchEvent(new TaroEvent(type))
                assert.deepEqual(calls.splice(0), ['replacement', 'imperative'], 'replacement preserves dispatch order')

                render(undefined)
                assert.deepEqual(transitions.splice(0), [], 'an imperative handler retains the subscription')
                node.dispatchEvent(new TaroEvent(type))
                assert.deepEqual(calls.splice(0), ['imperative'])
                node.removeEventListener(type, imperative)
                assert.deepEqual(transitions.splice(0), [[type, false]])

                render(() => calls.push('restored'))
                assert.deepEqual(transitions.splice(0), [[type, true]])
                node.addEventListener(type, () => calls.push('once'), { once: true })
                render(() => calls.push('after-once'))
                assert.deepEqual(transitions.splice(0), [])
                node.dispatchEvent(new TaroEvent(type))
                assert.deepEqual(calls.splice(0), ['after-once', 'once'])
                assert.equal(handlers.length, 1)
                assert.deepEqual(transitions.splice(0), [])
                node.dispatchEvent(new TaroEvent(type))
                assert.deepEqual(calls.splice(0), ['after-once'])
                render(undefined)
                assert.equal(handlers.length, 0)
                assert.deepEqual(transitions.splice(0), [[type, false]])
            } finally {
                ReactDOM.flushSync(() => root.unmount())
            }
        }
        const container = document.createElement('root')
        const root = ReactDOM.createRoot(container)
        // Record both expanded event types to verify that each replacement dispatches its current closure.
        const calls = []
        const render = handler => ReactDOM.flushSync(() => root.render(h('map', { onRegionChange: handler })))
        try {
            render(() => calls.push('first'))
            const node = container.firstChild
            assert.deepEqual(transitions.splice(0), [['begin', true], ['end', true]])
            render(event => calls.push('latest:' + event.type))
            assert.deepEqual(transitions.splice(0), [], 'expanded region listeners stay subscribed during replacement')
            node.dispatchEvent(new TaroEvent('begin'))
            node.dispatchEvent(new TaroEvent('end'))
            assert.deepEqual(calls, ['latest:begin', 'latest:end'])
            render(undefined)
            assert.deepEqual(transitions.splice(0), [['begin', false], ['end', false]])
        } finally {
            ReactDOM.flushSync(() => root.unmount())
        }
    } finally {
        TaroElement.extend('delegateEventListener', delegate)
    }
}

function checkEventPrioritiesAndControlledInputs(useNode) {
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
            onInput(event) {
                assert.equal(rendererHostConfig.getCurrentUpdatePriority(), DiscreteEventPriority)
                setValue(event.detail.value.toUpperCase())
            }
        })
    }
    ReactDOM.flushSync(() => root.render(h(Input)))
    const input = container.firstChild
    ReactDOM.unstable_batchedUpdates(() => {
        ReactDOM.unstable_batchedUpdates(() => eventHandler({
            type: 'input', target: { id: input.id }, detail: { value: 'edited' }
        }, useNode ? input : undefined))
        assert.equal(input.value, 'edited', 'native input remains unrestored until the outer event boundary')
    })
    assert.equal(input.value, 'EDITED', 'sync work commits before restoring the controlled native value')
    ReactDOM.flushSync(() => root.render(h('input', { id: 'fixed-input', value: 'fixed', onInput() {} })))
    eventHandler(
        { type: 'input', target: { id: 'fixed-input' }, detail: { value: 'rejected' } },
        useNode ? container.firstChild : undefined
    )
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

function checkPageMountContext() {
    // Capture native mount arguments without committing UI; pending onLoad promises own no scheduler resources.
    const saved = { app: Current.app, page: Current.page, router: Current.router }
    const calls = []
    let finishUnmount
    Current.app = {
        mount(component, id, getCtx, complete) { calls.push({ component, id, getCtx, complete }) },
        unmount(_id, complete) { finishUnmount = complete }
    }
    const Page = () => null
    const config = createTaroPageConfig(Page, 'pages/same', {})
    const first = { route: 'pages/same' }
    const second = { route: 'pages/same' }
    try {
        config.onLoad.call(first, { instance: 'first' })
        assert.strictEqual(calls[0].component, Page)
        assert.strictEqual(calls[0].getCtx(), first)
        assert.equal(calls[0].id, first.$taroPath)
        assert.equal(typeof calls[0].complete, 'function')
        config.onUnload.call(first)
        config.onLoad.call(second, { instance: 'second' })
        assert.equal(calls.length, 1, 'mount waits for the preceding unmount callback')
        Current.page = first
        finishUnmount()
        assert.strictEqual(calls[1].getCtx(), second, 'deferred mounting retains the exact native receiver')
        assert.equal(calls[1].id, second.$taroPath)
        assert.notEqual(calls[0].id, calls[1].id)
        config.onUnload.call(second)
        finishUnmount()
    } finally {
        Object.assign(Current, saved)
    }
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

function checkWxPageCreation() {
    if (process.env.TARO_ENV !== 'weapp') {
        return
    }
    const savedHost = { ...rendererHost }
    const natives = {
        A: { route: 'pages/same', root: createWxTestRoot() },
        B: { route: 'pages/same', root: createWxTestRoot() }
    }
    Object.assign(rendererHost, createDomHost(instance => instance.root))
    const context = React.createContext(0)
    // Retain refs and setters to create more A nodes after B has mounted.
    const nodes = {}
    const updates = {}
    const classes = {}
    const styles = {}
    const initialStyle = { width: '180rpx', height: '80rpx', backgroundColor: 'red', color: 'white' }
    const initialCss = 'width: 180rpx; height: 80rpx; background-color: red; color: white;'
    // Each Page exposes its handler selection; the journal records the handler closure used by each native tap.
    const handlers = {}
    const clicks = []
    function Page({ tid }) {
        const [value, update] = React.useState(0)
        const [handler, setHandler] = React.useState('first')
        const [className, setClassName] = React.useState('initial shared')
        const [style, setStyle] = React.useState(initialStyle)
        updates[tid] = update
        handlers[tid] = setHandler
        classes[tid] = setClassName
        styles[tid] = setStyle
        return h('view', {
            className,
            style,
            ref: node => {
                if (node) {
                    nodes[tid] = node
                }
            },
            'data-page': { id: tid },
            onClick: handler ? event => {
                assert.equal(event.type, 'tap')
                assert.deepEqual(event.target.dataset, { page: { id: tid } })
                assert.strictEqual(event.currentTarget.dataset, event.mpEvent.currentTarget.dataset)
                assert.notStrictEqual(event.currentTarget, event.target)
                clicks.push([tid, handler, value, event.detail])
                update(value + 1)
            } : undefined
        }, React.useContext(context) + ':' + value, value > 0 ? h('text', null, 'added') : null)
    }
    const App = ({ children }) => h(context.Provider, { value: 99 }, children)
    const app = ReactDOM.flushSync(() => createVptApp(App, { appId: 'wx-owner-app' }))
    try {
        ReactDOM.flushSync(() => app.mount(Page, 'A', () => natives.A, () => document.getElementById('A').performUpdate(true)))
        const firstRoot = document.getElementById('A')
        const firstDocument = firstRoot.ownerDocument
        assert.equal(firstRoot.nativeNode.isVirtual(), true, 'The Page anchor has no layout box')
        assert.strictEqual(firstRoot.nativeNode, natives.A.root.childNodes[0])
        assert.strictEqual(nodes.A.nativeNode, firstRoot.nativeNode.childNodes[0])
        ReactDOM.flushSync(() => app.mount(Page, 'B', () => natives.B, () => document.getElementById('B').performUpdate(true)))
        assert.equal(document.getElementById('B').nativeNode.isVirtual(), true)
        assert.notStrictEqual(nodes.B.ownerDocument, firstDocument)
        assert.strictEqual(nodes.A.delegateChildInsertion, nodes.B.delegateChildInsertion)
        assert.strictEqual(nodes.A.style.delegateStyleUpdate, nodes.B.style.delegateStyleUpdate)
        assert.equal(Object.hasOwn(nodes.A, 'delegateChildInsertion'), false)
        const classTarget = nodes.A.nativeNode
        const tapSubscription = classTarget.listeners.tap[0]
        assert.equal(typeof tapSubscription, 'function')
        assert.equal(classTarget.class, 'initial shared')
        for (const value of ['updated shared', undefined, 'restored', '', null, 'final']) {
            ReactDOM.flushSync(() => classes.A(value))
            assert.equal(classTarget.class, value ?? '')
            assert.strictEqual(nodes.A.nativeNode, classTarget)
            assert.strictEqual(classTarget.listeners.tap[0], tapSubscription, 'class updates retain the SDK event entry')
            assert.equal(nodes.B.nativeNode.class, 'initial shared')
        }
        assert.equal(classTarget.style, initialCss)
        for (const [style, cssText] of [
            [{ width: '240rpx', height: '120rpx', backgroundColor: 'blue', color: 'black' },
                'width: 240rpx; height: 120rpx; background-color: blue; color: black;'],
            [{ width: '240rpx', height: '120rpx', color: 'black' },
                'width: 240rpx; height: 120rpx; color: black;'],
            [{ width: 0, height: '120rpx', color: null }, 'width: 0px; height: 120rpx;'],
            [{}, ''],
            [initialStyle, initialCss],
            [undefined, ''],
            [initialStyle, initialCss],
            [null, ''],
            ['height: 100rpx; background-color: green;', 'height: 100rpx; background-color: green;'],
            ['color: blue;', 'color: blue;'],
            [initialStyle, initialCss]
        ]) {
            ReactDOM.flushSync(() => styles.A(style))
            assert.equal(nodes.A.style.cssText, cssText)
            assert.equal(classTarget.style, cssText)
            assert.equal(classTarget.class, 'final')
            assert.strictEqual(nodes.A.nativeNode, classTarget)
            assert.equal(nodes.B.nativeNode.style, initialCss)
        }
        ReactDOM.flushSync(() => updates.A(7))
        assert.match(nodes.A.textContent, /99:7/)
        assert.equal(nodes.B.textContent, '99:0')
        assert.equal(natives.A.root.childNodes[0].childNodes[0].childNodes[0].textContent, '99:7')
        assert.equal(natives.B.root.childNodes[0].childNodes[0].childNodes[0].textContent, '99:0')
        assert.strictEqual(nodes.A.lastChild.ownerDocument, firstDocument)
        const clone = nodes.A.cloneNode(true)
        assert.notStrictEqual(clone.nativeNode, nodes.A.nativeNode)
        assert.equal(clone.nativeNode.class, 'final')
        assert.equal(clone.nativeNode.style, initialCss)
        assert.equal(clone.style.removeProperty('background-color'), 'red')
        assert.equal(clone.nativeNode.style, 'width: 180rpx; height: 80rpx; color: white;')
        clone.style.setProperty('width', '120rpx')
        assert.equal(clone.nativeNode.style, 'width: 120rpx; height: 80rpx; color: white;')
        clone.style.cssText = 'color: blue;'
        assert.equal(clone.nativeNode.style, 'color: blue;')
        clone.style.cssText = ''
        assert.equal(clone.nativeNode.style, '')
        assert.equal(classTarget.style, initialCss)
        assert.strictEqual(clone.nativeNode.ownerShadowRoot, natives.A.root)
        assert.strictEqual(clone.ownerDocument, firstDocument)
        assert.strictEqual(clone.firstChild.ownerDocument, firstDocument)
        clone.textContent = 'replacement'
        assert.strictEqual(clone.firstChild.ownerDocument, firstDocument)
        clone.insertAdjacentHTML('beforeend', '<text>parsed</text>')
        assert.strictEqual(clone.lastChild.ownerDocument, firstDocument)
        ReactDOM.flushSync(() => app.mount(Page, 'A', () => natives.A, () => {}))
        assert.strictEqual(document.getElementById('A'), firstRoot)
        assert.match(nodes.A.textContent, /99:7/)

        const native = nodes.A.nativeNode
        assert.equal(native.id, '')
        assert.equal(native.listeners.tap.length, 1)
        ReactDOM.flushSync(() => native.tap({ x: 10 }))
        assert.deepEqual(clicks.splice(0), [['A', 'first', 7, { x: 10 }]])
        assert.match(nodes.A.textContent, /99:8/)
        assert.equal(native.listeners.tap.length, 1)

        ReactDOM.flushSync(() => handlers.A('second'))
        assert.strictEqual(native.listeners.tap[0], tapSubscription, 'callback replacement retains the SDK event entry')
        ReactDOM.flushSync(() => native.tap({}))
        assert.deepEqual(clicks.splice(0), [['A', 'second', 8, {}]])
        assert.match(nodes.A.textContent, /99:9/)
        assert.strictEqual(nodes.A.nativeNode, native)
        assert.equal(native.listeners.tap.length, 1)

        ReactDOM.flushSync(() => handlers.A(null))
        assert.equal(native.listeners.tap.length, 0)
        ReactDOM.flushSync(() => native.tap({}))
        assert.deepEqual(clicks, [])
        assert.match(nodes.A.textContent, /99:9/)

        ReactDOM.flushSync(() => handlers.A('first'))
        assert.equal(native.listeners.tap.length, 1)
        assert.notStrictEqual(native.listeners.tap[0], tapSubscription, 'restoring a removed handler creates an SDK entry')
        const restoredSubscription = native.listeners.tap[0]
        ReactDOM.flushSync(() => native.tap({}))
        assert.strictEqual(native.listeners.tap[0], restoredSubscription)
        ReactDOM.flushSync(() => nodes.B.nativeNode.tap({}))
        assert.deepEqual(clicks.splice(0), [['A', 'first', 9, {}], ['B', 'first', 0, {}]])
        assert.match(nodes.A.textContent, /99:10/)
        assert.match(nodes.B.textContent, /99:1/)
        checkKeyedMoves(document.createElement('root'), rendererHost.getPageRootType('A'))
        checkWxEventBubbling(app)
        checkWxDatasetUpdates(app)
        checkWxPropertyUpdates(app)
        checkWxTextInput(app)
        checkWxFormChange(app)
        checkWxHtmlElements(app)
    } finally {
        app.unmount('B')
        assert.equal(natives.B.root.childNodes.length, 0)
        app.unmount('A')
        assert.equal(natives.A.root.childNodes.length, 0)
        ReactDOM.flushSync(() => ReactDOM.createRoot(document.getElementById('wx-owner-app')).unmount())
        Object.assign(rendererHost, savedHost)
        const restoredContext = {}
        assert.equal(rendererHost.getPageRootType('after-unload'), 'root')
        assert.strictEqual(rendererHost.getChildHostContext(restoredContext, 'view'), restoredContext)
    }
}

function checkWxTextInput(app) {
    for (const component of [false, true]) {
        const root = createWxTestRoot(component ? {
            input: { value: () => '' }, textarea: { value: () => '' }
        } : undefined)
        // Refs and setters expose React commits; the journal records the active business handler.
        const nodes = {}
        const controls = {}
        const events = []
        function Page() {
            const [mode, setMode] = React.useState('off')
            const [value, setValue] = React.useState('fixed')
            const [visible, setVisible] = React.useState(true)
            Object.assign(controls, { setMode, setValue, setVisible })
            return h('view', null, visible && ['input', 'textarea'].flatMap(type =>
                [true, false].map(controlled => {
                    const name = type + '-' + controlled
                    return h(type, {
                        key: name,
                        id: component ? undefined : name,
                        ...(controlled ? { value } : { defaultValue: 'seed' }),
                        ref: node => { nodes[name] = node },
                        onInput: mode === 'off' ? undefined : event => {
                            assert.equal(nodes[name].value, event.detail.value, 'logical value is current before the callback')
                            events.push([name, mode, event.detail.value])
                            if (mode === 'accept' && controlled) {
                                setValue(event.detail.value.toUpperCase())
                            } else if (mode === 'unmount') {
                                setVisible(false)
                            }
                        }
                    })
                })
            ))
        }
        function emit(name, value) {
            const native = nodes[name].nativeNode
            // Components expose the editor value; raw nodes retain their last bound attribute.
            if (component) {
                native._$dataGroup.data.value = value
            }
            const target = { id: native.id, dataset: native.dataset }
            const event = { type: 'input', timeStamp: 123, detail: { value }, target, currentTarget: target }
            ReactDOM.flushSync(() => {
                for (const listener of [...native.listeners.input]) {
                    listener(event)
                }
            })
        }
        function expectValues(controlled, uncontrolled) {
            for (const type of ['input', 'textarea']) {
                for (const [suffix, expected] of [['true', controlled], ['false', uncontrolled]]) {
                    const node = nodes[type + '-' + suffix]
                    const native = node.nativeNode
                    assert.equal(node.value, expected)
                    assert.equal((component ? native._$dataGroup.data : native.attributes).value, expected)
                    assert.equal(native.hasPendingChanges?.() ?? false, false)
                    assert.strictEqual(native.ownerShadowRoot, root)
                }
            }
        }
        const id = 'text-input-' + component
        try {
            ReactDOM.flushSync(() => app.mount(Page, id, () => ({ root }), () =>
                document.getElementById(id).performUpdate(true)))
            const originals = Object.entries(nodes).map(([name, node]) => [name, node, node.nativeNode.listeners.input?.[0]])
            for (const [, node, listener] of originals) {
                assert.equal(typeof listener, 'function', 'text input subscribes without a business handler')
                assert.equal(node.nativeNode.listeners.input.length, 1)
            }
            expectValues('fixed', 'seed')
            for (const name of Object.keys(nodes)) {
                emit(name, 'free')
            }
            expectValues('fixed', 'free')
            assert.deepEqual(events, [])

            ReactDOM.flushSync(() => controls.setValue('programmatic'))
            expectValues('programmatic', 'free')
            ReactDOM.flushSync(() => controls.setMode('accept'))
            emit('input-true', 'alpha')
            expectValues('ALPHA', 'free')
            emit('textarea-true', 'beta')
            expectValues('BETA', 'free')
            assert.deepEqual(events.splice(0), [['input-true', 'accept', 'alpha'], ['textarea-true', 'accept', 'beta']])

            ReactDOM.flushSync(() => controls.setMode('reject'))
            emit('input-true', 'rejected')
            emit('textarea-true', 'rejected')
            expectValues('BETA', 'free')
            assert.deepEqual(events.splice(0), [['input-true', 'reject', 'rejected'], ['textarea-true', 'reject', 'rejected']])

            ReactDOM.flushSync(() => controls.setMode('off'))
            for (const name of Object.keys(nodes)) {
                emit(name, 'unbound')
            }
            expectValues('BETA', 'unbound')
            assert.deepEqual(events, [])
            ReactDOM.flushSync(() => controls.setMode('accept'))
            emit('input-true', 'restored')
            emit('textarea-true', 'restored')
            expectValues('RESTORED', 'unbound')
            assert.deepEqual(events.splice(0), [['input-true', 'accept', 'restored'], ['textarea-true', 'accept', 'restored']])
            for (const [name, node, listener] of originals) {
                assert.strictEqual(nodes[name], node)
                assert.deepEqual(node.nativeNode.listeners.input, [listener], 'business handlers share the creation-time subscription')
            }
            ReactDOM.flushSync(() => controls.setMode('unmount'))
            emit('input-true', 'unmount')
            assert.deepEqual(events, [['input-true', 'unmount', 'unmount']])
            assert.ok(Object.values(nodes).every(node => node === null))
            assert.equal(root.childNodes[0].childNodes[0].childNodes.length, 0)
        } finally {
            app.unmount(id)
            assert.equal(root.childNodes.length, 0)
        }
    }
}

function checkWxHtmlElements(app) {
    const root = createWxTestRoot()
    // Refs and the setter expose each commit while the journal records native event delivery.
    const nodes = {}
    const controls = {}
    const events = []
    function Page() {
        const [className, setClassName] = React.useState('card')
        controls.setClassName = setClassName
        return h('div', {
            id: 'html-card', className, style: { color: 'red' },
            ref: node => { nodes.div = node },
            onClick: className === undefined ? undefined : event => events.push([className, event.target.id])
        }, h('span', { id: 'html-label', ref: node => { nodes.span = node } }, 'History'),
        h('strong', { ref: node => { nodes.strong = node } }, '123'),
        h('br', { ref: node => { nodes.br = node } }))
    }
    try {
        ReactDOM.flushSync(() => app.mount(Page, 'html', () => ({ root }), () =>
            document.getElementById('html').performUpdate(true)))
        const div = nodes.div
        const span = nodes.span
        const native = div.nativeNode
        assert.equal(div.nodeName, 'div')
        assert.equal(span.nodeName, 'span')
        assert.equal(native.name, 'view')
        assert.equal(span.nativeNode.name, 'view')
        assert.equal(nodes.strong.nativeNode.name, 'text')
        assert.equal(native.class, 'h5-div card')
        assert.equal(native.style, 'color: red;')
        assert.equal(span.nativeNode.class.trim(), 'h5-span')
        assert.equal(span.nativeNode.childNodes[0].textContent, 'History')
        assert.equal(nodes.br.childNodes.length, 0)
        assert.equal(nodes.br.nativeNode.childNodes[0].textContent, '\\n')
        ReactDOM.flushSync(() => span.nativeNode.tap({}))
        assert.deepEqual(events, [['card', 'html-label']])
        for (const className of ['changed', 'h5-div explicit', undefined]) {
            ReactDOM.flushSync(() => controls.setClassName(className))
            assert.strictEqual(nodes.div, div)
            assert.strictEqual(div.nativeNode, native)
            assert.equal(div.className, className ?? '')
            assert.equal(native.class.trim(), className?.startsWith('h5-div') ? className : ['h5-div', className].filter(Boolean).join(' '))
            const count = events.length
            ReactDOM.flushSync(() => span.nativeNode.tap({}))
            assert.equal(events.length, count + Number(className !== undefined))
            assert.equal(native.listeners.tap.length, Number(className !== undefined))
            if (className !== undefined) {
                assert.deepEqual(events.at(-1), [className, 'html-label'])
            }
        }
        span.classList.add('accent')
        assert.equal(span.className, 'accent')
        assert.equal(span.nativeNode.class, 'h5-span accent')
        span.removeAttribute('class')
        assert.equal(span.nativeNode.class.trim(), 'h5-span')
        const clone = div.cloneNode(true)
        assert.equal(clone.nodeName, 'div')
        assert.equal(clone.nativeNode.name, 'view')
        assert.equal(clone.nativeNode.class.trim(), 'h5-div')
        assert.equal(clone.nativeNode.style, native.style)
        assert.equal(clone.childNodes[0].nativeNode.class.trim(), 'h5-span')
        assert.equal(clone.childNodes[2].nativeNode.childNodes.length, 1)
        assert.strictEqual(clone.nativeNode.ownerShadowRoot, root)
        assert.notStrictEqual(clone.nativeNode, native)
        div.appendChild(clone)
        assert.strictEqual(clone.nativeNode.parentNode, native)
        div.removeChild(clone)
        assert.equal(clone.nativeNode.parentNode, null)
        ReactDOM.flushSync(() => controls.setClassName('restored'))
        assert.equal(native.listeners.tap.length, 1)
        ReactDOM.flushSync(() => span.nativeNode.tap({}))
        assert.deepEqual(events.at(-1), ['restored', 'html-label'])
    } finally {
        app.unmount('html')
        assert.equal(root.childNodes.length, 0)
        assert.ok(Object.values(nodes).every(node => node === null))
    }
}

function checkWxFormChange(app) {
    const cases = [
        { type: 'picker', property: 'value', initial: 0, changed: 1, programmed: 2 },
        { type: 'picker-view', property: 'value', initial: [0], changed: [1], programmed: [2] },
        { type: 'slider', property: 'value', initial: 20, changed: 80, programmed: 40 },
        { type: 'switch', property: 'checked', initial: false, changed: true, programmed: true }
    ]
    for (const component of [false, true]) {
        const properties = Object.fromEntries(cases.map(item => [item.type, { [item.property]: () => item.initial }]))
        const root = createWxTestRoot(component ? properties : undefined)
        // Refs/setters expose commits; the journal observes business dispatch independently of value syncing.
        const nodes = {}
        const controls = {}
        const events = []
        function Page() {
            const [mode, setMode] = React.useState('off')
            const [programmed, setProgrammed] = React.useState(false)
            const [visible, setVisible] = React.useState(true)
            Object.assign(controls, { setMode, setProgrammed, setVisible })
            return h('view', null, visible && cases.map(item => h(item.type, {
                key: item.type,
                id: item.type,
                [item.property]: programmed ? item.programmed : item.initial,
                ref: node => { nodes[item.type] = node },
                onChange: mode === 'off' ? undefined : event => {
                    assert.strictEqual(nodes[item.type].value, event.detail.value)
                    events.push([item.type, mode, event.detail.value])
                    if (mode === 'unmount') {
                        setVisible(false)
                    }
                }
            })))
        }
        function emit(item, value) {
            const node = nodes[item.type]
            const native = node.nativeNode
            if (component) {
                native._$dataGroup.data[item.property] = value
            }
            const target = { id: native.id, dataset: native.dataset }
            const event = { type: 'change', timeStamp: 123, detail: { value }, target, currentTarget: target }
            ReactDOM.flushSync(() => {
                for (const listener of [...(native.listeners.change ?? [])]) {
                    listener(event)
                }
            })
            return node
        }
        const id = 'form-change-' + component
        try {
            ReactDOM.flushSync(() => app.mount(Page, id, () => ({ root }), () =>
                document.getElementById(id).performUpdate(true)))
            const originals = Object.fromEntries(cases.map(item => [item.type, nodes[item.type].nativeNode.listeners.change?.[0]]))
            for (const item of cases) {
                assert.equal(typeof originals[item.type], 'function', item.type + ' subscribes without a business handler')
                assert.strictEqual(emit(item, item.changed).value, item.changed)
            }
            assert.deepEqual(events, [])
            for (const mode of ['first', 'second', 'off', 'restored']) {
                ReactDOM.flushSync(() => controls.setMode(mode))
                for (const item of cases) {
                    const value = mode === 'off' ? item.initial : item.changed
                    const node = emit(item, value)
                    assert.strictEqual(node.value, value, 'change keeps the upstream value, including its array identity')
                    assert.deepEqual(node.nativeNode.listeners.change, [originals[item.type]])
                    assert.strictEqual(node.nativeNode.ownerShadowRoot, root)
                    assert.deepEqual(node.props[item.property], item.property === 'checked' ? item.initial : value)
                }
                assert.deepEqual(events.splice(0), mode === 'off' ? [] : cases.map(item => [item.type, mode, item.changed]))
            }
            ReactDOM.flushSync(() => controls.setProgrammed(true))
            for (const item of cases) {
                assert.deepEqual(nodes[item.type].props[item.property], item.programmed)
                assert.deepEqual((component ? nodes[item.type].nativeNode._$dataGroup.data : nodes[item.type].nativeNode.attributes)[item.property], item.programmed)
            }
            ReactDOM.flushSync(() => controls.setMode('unmount'))
            emit(cases[0], cases[0].changed)
            assert.deepEqual(events, [[cases[0].type, 'unmount', cases[0].changed]])
            assert.ok(Object.values(nodes).every(node => node === null))
            assert.equal(root.childNodes[0].childNodes[0].childNodes.length, 0)
        } finally {
            app.unmount(id)
            assert.equal(root.childNodes.length, 0)
        }
    }
}

function checkWxPropertyUpdates(app) {
    const cases = [
        {
            type: 'view',
            initial: { hoverClass: 'pressed', hoverStopPropagation: true, hoverStartTime: 10, hoverStayTime: 30 },
            updated: { hoverClass: '', hoverStopPropagation: false, hoverStartTime: 0, hoverStayTime: 1 },
            declared: { hoverClass: '', hoverStopPropagation: false, hoverStartTime: 0, hoverStayTime: 0 }
        },
        {
            type: 'text',
            initial: { selectable: true, decode: true, space: 'nbsp' },
            updated: { selectable: false, decode: false, space: '' },
            declared: { selectable: false, decode: false, space: '' }
        },
        {
            type: 'scroll-view',
            initial: { scrollX: true, scrollY: true, upperThreshold: 10 },
            updated: { scrollX: false, scrollY: false, upperThreshold: 0 },
            declared: { scrollX: false, scrollY: false, upperThreshold: 0 }
        },
        {
            type: 'audit-card',
            initial: { mapkey: 'first' },
            updated: { mapkey: 'second' },
            declared: { mapkey: '' }
        },
        {
            type: 'share-element',
            initial: { mapkey: 'first', rectTweenType: 'linear' },
            updated: { mapkey: 'second', rectTweenType: 'materialRectArc' },
            declared: { key: '', rectTweenType: '' }
        },
        {
            type: 'progress',
            initial: { percent: 75, activeColor: 'red' },
            updated: { percent: 0, activeColor: '' },
            declared: { percent: 0, activeColor: '' }
        }
    ]
    for (const component of [false, true]) {
        const declarations = Object.fromEntries(cases.map(({ type, declared }) => [
            type, Object.fromEntries(Object.entries(declared).map(([name, value]) => [name, () => value]))
        ]))
        const root = createWxTestRoot(component ? declarations : undefined)
        // Refs and the phase setter expose committed React updates while preserving native identity.
        const nodes = {}
        const controls = {}
        function Page() {
            const [phase, setPhase] = React.useState('initial')
            controls.setPhase = setPhase
            return h('view', null, cases.map(({ type, initial, updated }) => {
                const props = phase === 'initial' ? initial : phase === 'updated' ? updated
                    : phase === 'removed' ? {}
                    : Object.fromEntries(Object.keys(initial).map(name => [name, phase === 'null' ? null : undefined]))
                return h(type, {
                    ...props,
                    key: type,
                    ref: node => { if (node) { nodes[type] = node } }
                }, type === 'text' ? 'content' : null)
            }))
        }
        const id = 'properties-' + component
        try {
            ReactDOM.flushSync(() => app.mount(Page, id, () => ({ root }), () =>
                document.getElementById(id).performUpdate(true)))
            const natives = Object.fromEntries(Object.entries(nodes).map(([type, node]) => [type, node.nativeNode]))
            for (const phase of ['initial', 'updated', 'null', 'initial', 'undefined', 'initial', 'removed']) {
                ReactDOM.flushSync(() => controls.setPhase(phase))
                for (const item of cases) {
                    const native = nodes[item.type].nativeNode
                    assert.strictEqual(native, natives[item.type])
                    assert.strictEqual(native.ownerShadowRoot, root)
                    const expected = phase === 'initial' ? item.initial : phase === 'updated' ? item.updated
                        : Object.fromEntries(Object.keys(item.initial).map(name => [name, undefined]))
                    for (const [name, value] of Object.entries(expected)) {
                        const nativeName = item.type === 'share-element' && name === 'mapkey' ? 'key' : name
                        const actual = component ? native._$dataGroup.data[nativeName] : native.attributes[toDashed(nativeName)]
                        assert.deepEqual(actual, value, item.type + '.' + name + ':' + phase)
                        if (!component && value === undefined) {
                            assert.equal(Object.hasOwn(native.attributes, toDashed(nativeName)), false)
                        }
                    }
                    if (component) {
                        assert.equal(native._$dataGroup.pending.length, 0)
                        assert.deepEqual(native.attributes, {})
                    }
                }
            }
        } finally {
            app.unmount(id)
            assert.equal(root.childNodes.length, 0)
        }
    }
}

function checkWxDatasetUpdates(app) {
    const root = createWxTestRoot()
    // Keep refs, the React setter, and event observations for this Page's dataset transitions.
    const nodes = {}
    const controls = {}
    const events = []
    const first = { id: 1 }
    const second = { id: 2 }
    const cases = [
        {
            props: { 'data-user-id': first, 'data-active': false, 'data-count': 0 },
            dataset: { userId: first, active: false, count: 0 }
        },
        {
            props: { 'data-user-id': second, 'data-active': true, 'data-count': 2 },
            dataset: { userId: second, active: true, count: 2 }
        },
        { props: {}, dataset: {} }
    ]
    function record(event) {
        events.push([{ ...event.target.dataset }, { ...event.currentTarget.dataset }])
    }
    function Page() {
        const [props, setProps] = React.useState(cases[0].props)
        controls.setProps = setProps
        return h('view', { 'data-owner': 'parent', onClick: record },
            h('view', {
                ...props,
                ref: node => { if (node) { nodes.child = node } },
                onClick: record
            }))
    }
    try {
        ReactDOM.flushSync(() => app.mount(Page, 'dataset', () => ({ root }), () =>
            document.getElementById('dataset').performUpdate(true)))
        const native = nodes.child.nativeNode
        for (const { props, dataset } of [...cases, cases[0]]) {
            ReactDOM.flushSync(() => controls.setProps(props))
            assert.deepEqual({ ...nodes.child.dataset }, dataset)
            assert.strictEqual(nodes.child.nativeNode, native)
            assert.equal(Object.hasOwn(native.dataset, 'sid'), false)
            for (const key of ['userId', 'active', 'count']) {
                assert.strictEqual(native.dataset[key], dataset[key])
            }
            const nativeDataset = { ...native.dataset }
            ReactDOM.flushSync(() => native.tap({}))
            assert.deepEqual(events.splice(0), [
                [nativeDataset, nativeDataset],
                [nativeDataset, { owner: 'parent' }]
            ])
        }
    } finally {
        app.unmount('dataset')
        assert.equal(root.childNodes.length, 0)
    }
}

function checkWxEventBubbling(app) {
    const root = createWxTestRoot()
    // Retain current refs, setters, counts, and callback observations for this Page's event sequence.
    const nodes = {}
    const controls = {}
    const events = []
    function Page() {
        const [parentHandler, setParentHandler] = React.useState('first')
        const [stop, setStop] = React.useState(false)
        const [idMode, setIdMode] = React.useState('distinct')
        const [counts, setCounts] = React.useState({ child: 0, parent: 0 })
        Object.assign(controls, { setParentHandler, setStop, setIdMode, counts })
        const id = role => idMode === 'distinct' ? role : idMode === 'shared' ? 'shared' : undefined
        function record(label, event) {
            events.push([
                label,
                event.target.id,
                event.currentTarget.id,
                event.target.dataset.payload,
                event.currentTarget.dataset.payload
            ])
        }
        return h('view', {
            id: id('parent'),
            'data-payload': { role: 'parent' },
            ref: node => { if (node) { nodes.parent = node } },
            onClick: parentHandler ? event => {
                record(parentHandler, event)
                setCounts(value => ({ ...value, parent: value.parent + 1 }))
            } : undefined
        }, h('view', {
            id: id('child'),
            'data-payload': { role: 'child' },
            ref: node => { if (node) { nodes.child = node } },
            onClick: event => {
                record('child', event)
                setCounts(value => ({ ...value, child: value.child + 1 }))
                if (stop) {
                    event.stopPropagation()
                }
            }
        }, counts.child + ':' + counts.parent))
    }
    function tap(parentHandler, childId, parentId) {
        const before = controls.counts
        const childPayload = { role: 'child' }
        const expected = [['child', childId, childId, childPayload, childPayload]]
        if (parentHandler) {
            expected.push([parentHandler, childId, parentId, childPayload, { role: 'parent' }])
        }
        ReactDOM.flushSync(() => nodes.child.nativeNode.tap({}))
        assert.deepEqual(events.splice(0), expected)
        assert.deepEqual(controls.counts, {
            child: before.child + 1,
            parent: before.parent + (parentHandler ? 1 : 0)
        })
        assert.equal(nodes.child.nativeNode.childNodes[0].textContent,
            controls.counts.child + ':' + controls.counts.parent)
        assert.equal(nodes.child.nativeNode.listeners.tap.length, 1)
    }

    try {
        ReactDOM.flushSync(() => app.mount(Page, 'bubbling', () => ({ root }), () =>
            document.getElementById('bubbling').performUpdate(true)))
        const child = nodes.child.nativeNode
        const parent = nodes.parent.nativeNode
        tap('first', 'child', 'parent')
        ReactDOM.flushSync(() => controls.setParentHandler('second'))
        tap('second', 'child', 'parent')
        ReactDOM.flushSync(() => controls.setParentHandler(null))
        assert.equal(parent.listeners.tap.length, 0)
        tap(null, 'child', 'parent')

        ReactDOM.flushSync(() => {
            controls.setParentHandler('first')
            controls.setStop(true)
        })
        assert.equal(parent.listeners.tap.length, 1)
        tap(null, 'child', 'parent')
        tap(null, 'child', 'parent')
        ReactDOM.flushSync(() => controls.setStop(false))
        tap('first', 'child', 'parent')

        ReactDOM.flushSync(() => controls.setIdMode('empty'))
        tap('first', '', '')
        ReactDOM.flushSync(() => controls.setIdMode('shared'))
        tap('first', 'shared', 'shared')
        assert.strictEqual(nodes.child.nativeNode, child)
        assert.strictEqual(nodes.parent.nativeNode, parent)
        assert.strictEqual(child.parentNode, parent)
    } finally {
        app.unmount('bubbling')
        assert.equal(root.childNodes.length, 0)
    }
}

function checkFrameworkRootEntryPoints() {
    // A renderer double records bootstrap ordering and Page-root selection independently.
    const calls = []
    const pageTypes = []
    let commit
    const renderer = {
        unstable_batchedUpdates: ReactDOM.unstable_batchedUpdates,
        getPageRootType(id) {
            pageTypes.push(id)
            return 'test-page-root'
        },
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
    assert.equal(Current.app.mount.length, 4, 'mount accepts the native context getter and completion callback')
    const PageWrapper = connectReactPage(React, 'page-type-id')(() => null)
    const pageRoot = new PageWrapper({ tid: 'page-type-id' }).render()
    assert.equal(pageRoot.type, 'test-page-root')
    assert.equal(pageRoot.props.id, 'page-type-id')
    assert.deepEqual(pageTypes, ['page-type-id'])
    ReactDOM.flushSync(() => Current.app.mount(() => null, 'pages/cold', () => assert.fail('cold App must not be flushed')))
    assert.deepEqual(calls, ['createRoot', 'render'], 'prerender does not force or repeat App initialization')
    Current.app = null
    calls.length = 0
    const config = createNativeComponentConfig(() => null, React, renderer, {})
    config.created.call({})
    assert.deepEqual(calls, ['flushSync', 'createRoot', 'render', 'committed'])
    assert.equal(typeof Current.app.mount, 'function', 'native Entry is ready before created returns')
}

function checkKeyedMoves(rootContainer, pageType) {
    const root = ReactDOM.createRoot(rootContainer)
    const ids = Array.from({ length: 1000 }, (_, index) => index)
    // Stable ref callbacks and effect journals distinguish reordering from remounting.
    const refs = new Map()
    const refChanges = []
    const effects = []
    function Row({ id }) {
        const [count, setCount] = React.useState(0)
        const ref = React.useCallback(node => {
            refChanges.push([id, node])
            if (node) {
                refs.set(id, node)
            } else {
                refs.delete(id)
            }
        }, [id])
        React.useLayoutEffect(() => {
            effects.push(['mount', id])
            return () => effects.push(['unmount', id])
        }, [id])
        return h('view', { ref, onClick: () => setCount(count + 1) }, id + ':' + count)
    }
    const renderRows = order => {
        const rows = order.map(id => h(Row, { key: id, id }))
        root.render(pageType ? h(pageType, null, rows) : rows)
    }
    ReactDOM.flushSync(() => renderRows(ids))
    const container = pageType ? rootContainer.firstChild : rootContainer
    const flushTemplate = () => {
        if (container.nativeNode) {
            return
        }
        const batches = []
        container.scheduleTask = callback => callback()
        container.performUpdate(false, data => batches.push(data))
        container.pendingUpdate = false
        assert.deepEqual(batches[0][container._path + '.cn'].map(node => node.cn[0].v),
            container.childNodes.map(node => node.textContent))
    }
    // Record logical-to-host operations; the native double may internally unlink as part of insertion.
    const insert = container.delegateChildInsertion
    const remove = container.delegateChildRemoval
    const calls = []
    container.delegateChildInsertion = function (...args) {
        calls.push('insert')
        return insert.apply(this, args)
    }
    container.delegateChildRemoval = function (...args) {
        calls.push('remove')
        return remove.apply(this, args)
    }
    try {
        flushTemplate()
        const hosts = new Map(refs)
        const natives = new Map(ids.map(id => [id, refs.get(id).nativeNode]))
        const tap = node => ReactDOM.flushSync(() => node.nativeNode
            ? node.nativeNode.tap({})
            : node.dispatchEvent(new TaroEvent('tap', { bubbles: false })))
        tap(refs.get(1))
        assert.equal(refs.get(1).textContent, '1:1')
        refChanges.length = 0
        effects.length = 0
        calls.length = 0
        const swapped = ids.slice()
        ;[swapped[1], swapped[998]] = [swapped[998], swapped[1]]
        for (const order of [swapped, ids]) {
            ReactDOM.flushSync(() => renderRows(order))
            assert.equal(calls.filter(call => call === 'insert').length, 997)
            assert.equal(calls.filter(call => call === 'remove').length, 0)
            assert.deepEqual(container.childNodes, order.map(id => hosts.get(id)))
            for (const id of order) {
                assert.strictEqual(refs.get(id), hosts.get(id))
                assert.strictEqual(refs.get(id).parentNode, container)
                assert.strictEqual(refs.get(id).nativeNode, natives.get(id))
            }
            if (container.nativeNode) {
                assert.deepEqual(container.nativeNode.childNodes, order.map(id => natives.get(id)))
            }
            assert.deepEqual(refChanges, [])
            assert.deepEqual(effects, [])
            assert.equal(refs.get(1).textContent, '1:1')
            flushTemplate()
            calls.length = 0
        }
        tap(refs.get(1))
        assert.equal(refs.get(1).textContent, '1:2', 'moved handlers retain the latest React closure')
        ReactDOM.flushSync(() => renderRows(ids.filter(id => id !== 1)))
        assert.deepEqual(calls, ['remove'])
        assert.deepEqual(refChanges, [[1, null]])
        assert.deepEqual(effects, [['unmount', 1]])
        assert.equal(hosts.get(1).parentNode, null)
        if (container.nativeNode) {
            assert.equal(natives.get(1).parentNode, null)
        }
        flushTemplate()
    } finally {
        ReactDOM.flushSync(() => root.unmount())
        container.delegateChildInsertion = insert
        container.delegateChildRemoval = remove
    }
}

async function run() {
    await checkRootsAndCommits()
    checkKeyedMoves(document.createElement('root'), undefined)
    checkRootOptionsAndErrors()
    checkEventHandlerReplacement()
    checkEventPrioritiesAndControlledInputs(false)
    checkEventPrioritiesAndControlledInputs(true)
    checkPageConfigData()
    checkPageMountContext()
    await checkNativeInitialData()
    checkFrameworkRootEntryPoints()
    checkWxPageCreation()
}
run()
`
