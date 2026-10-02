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
import { resolveTaroRuntime } from '../../node/utils/packages.ts'

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
    assert.doesNotMatch(renderer, /LegacyRoot|isReact19Signature|prepareUpdate\(|getCurrentEventPriority\(/)
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
    const result = await build({
        input: entry,
        plugins: [
            {
                name: 'test:react19-renderer',
                resolveId(id) {
                    if (id === entry) {
                        return entry
                    }
                    if (id === '@tarojs/runtime') {
                        return resolveTaroRuntime('runtime/mini')
                    }
                },
                async load(id) {
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
import { Current, document, eventHandler, hooks } from '@tarojs/runtime'
import { createReactApp, createNativeComponentConfig, setReconciler } from 'vite-plugin-taro-runtime/plugin-framework-react/runtime'

const h = React.createElement

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
    ReactDOM.flushSync(() => root.unmount())
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
    assert.deepEqual(calls, ['createRoot', 'render'])
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
    checkFrameworkRootEntryPoints()
}
run()
`
