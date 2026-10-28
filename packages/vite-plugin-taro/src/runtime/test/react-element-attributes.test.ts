import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { normalizePath, resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { transformRefreshRuntime } from '../../node/plugins/mini/dev/react-refresh.ts'
import { rendererHostId } from '../../node/plugins/mini/module/module.ts'
import { packageRequire, resolveTaroRuntime, resolveVptRuntime } from '../../node/utils/packages.ts'

const require = createRequire(import.meta.url)
const refreshPath = path.join(path.dirname(packageRequire.resolve('@vitejs/plugin-react')), 'refresh-runtime.js')
const rendererPath = resolveTaroRuntime('react')
const entry = fileURLToPath(new URL('../../../tmp/react-element-attributes-fixture.js', import.meta.url))

for (const target of ['wx', 'zfb', 'tt'] as const) {
    test(`${target}: React element attributes stay out of native data across stateful Fast Refresh`, async (t) => {
        const config = await resolveConfig(
            {
                configFile: false,
                plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
            },
            'serve'
        )
        const platform = { wx: 'weapp', zfb: 'alipay', tt: 'tt' }[target]
        const result = await build({
            input: entry,
            plugins: [
                {
                    name: 'test:react-element-attributes',
                    resolveId(id) {
                        if (id === entry) {
                            return id
                        }
                        if (id === 'test:refresh') {
                            return refreshPath
                        }
                        if (id === rendererHostId) {
                            return resolveVptRuntime('mini/template/template-host')
                        }
                        if (id === '@tarojs/runtime') {
                            return resolveTaroRuntime('runtime/mini')
                        }
                        if (id === '\0vpt:global-binding') {
                            return 'test:global'
                        }
                    },
                    async load(id) {
                        if (id === entry) {
                            return `import ${JSON.stringify(resolveTaroRuntime(`plugin-platform-${platform}/runtime`))}\n${fixture}`
                        }
                        if (id === refreshPath) {
                            // Exercise Vite's real Refresh engine with the Mini preamble, exposing its synchronous flush.
                            return transformRefreshRuntime(
                                `${await readFile(id, 'utf8')}\nexport { performReactRefresh };`
                            )
                        }
                        if (normalizePath(id) === normalizePath(rendererPath)) {
                            return `import 'test:refresh';\n${await readFile(id, 'utf8')}`
                        }
                        if (id === 'test:global') {
                            return 'export const vptGlobal = global'
                        }
                    }
                }
            ],
            transform: {
                ...config.build.rolldownOptions.transform,
                define: {
                    ...config.define,
                    'process.env.NODE_ENV': JSON.stringify('development'),
                    'import.meta.hot': 'undefined'
                }
            },
            output: { format: 'cjs' },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        // Own React scheduler timers for this VM and dispose them even when an assertion fails.
        const timers = new Set<ReturnType<typeof setTimeout>>()
        t.after(() => {
            for (const timer of timers) {
                clearTimeout(timer)
            }
        })
        // Diagnostics must identify only the attribute, never retain or print the cyclic element graph.
        const warnings: unknown[][] = []
        // Native global binding and bare DevTools-hook lookups share the same realm.
        runInNewContext(`globalThis.global = globalThis;\n${chunk.code}`, {
            exports: {},
            require,
            performance,
            console: { ...console, info() {}, warn: (...args: unknown[]) => warnings.push(args) },
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
        assert.equal(warnings.length, 2, 'warn once on mount and once on a scalar-to-element transition')
        for (const warning of warnings) {
            assert.equal(warning.length, 1)
            assert.match(String(warning[0]), /React element ignored for host attribute "value"/)
        }
    })
}

const fixture = `
import 'vite-plugin-taro-runtime/plugin-html/runtime'
import assert from 'node:assert/strict'
import * as Refresh from 'test:refresh'
import React from 'react'
import ReactDOM from 'vite-plugin-taro-runtime/react'
import { document, TaroEvent } from '@tarojs/runtime'

assert.equal(React.version.split('.')[0], '19')
const h = React.createElement
const container = document.createElement('root')
const root = ReactDOM.createRoot(container)
// Manual bridge scheduling exposes both initial hydration and granular updates after each React commit.
container.scheduleTask = callback => callback()
const batches = []
const native = {
    setData(data, callback) {
        assert.doesNotThrow(() => JSON.stringify(data))
        batches.push(data)
        callback()
    }
}
function flushNative() {
    container.ctx = native
    try {
        container.performUpdate()
    } finally {
        container.ctx = null
    }
}
function StateButton(props) {
    return h('view', { ...props }, props.value)
}
// Retain the latest element only to prove that a genuine rendering Fiber exists in the supplied prop.
let latestElement
function Counter() {
    const [count, setCount] = React.useState(0)
    latestElement = h('text', null, 'before:' + count)
    return h(StateButton, { value: latestElement, onClick: () => setCount(value => value + 1) })
}
function UpdatedCounter() {
    const [count, setCount] = React.useState(0)
    latestElement = h('text', null, 'after:' + count)
    return h(StateButton, { value: latestElement, onClick: () => setCount(value => value + 1) })
}
Refresh.register(Counter, 'Counter')
try {
    ReactDOM.flushSync(() => root.render(h(Counter)))
    const view = container.firstChild
    assert.equal(view.textContent, 'before:0')
    assert.equal(Object.hasOwn(view.props, 'value'), false)
    assert.ok(latestElement._owner)
    assert.throws(() => JSON.stringify(latestElement), /circular/i)
    flushNative()
    assert.ok(batches.length > 0)
    assert.equal(Object.hasOwn(batches[0][container._path + '.cn'][0], 'value'), false)

    ReactDOM.flushSync(() => view.dispatchEvent(new TaroEvent('tap', { bubbles: false })))
    assert.equal(view.textContent, 'before:1')
    flushNative()

    Refresh.register(UpdatedCounter, 'Counter')
    ReactDOM.flushSync(() => {
        const update = Refresh.performReactRefresh()
        assert.equal(update.updatedFamilies.size, 1)
        assert.equal(update.staleFamilies.size, 0)
    })
    assert.strictEqual(container.firstChild, view)
    assert.equal(view.textContent, 'after:1', 'Fast Refresh preserves hook state and host identity')
    flushNative()

    ReactDOM.flushSync(() => view.dispatchEvent(new TaroEvent('tap', { bubbles: false })))
    assert.equal(view.textContent, 'after:2')
    flushNative()
    assert.equal(Object.hasOwn(view.props, 'value'), false)

    ReactDOM.flushSync(() => root.render(h(StateButton, { value: 'scalar' })))
    flushNative()
    const scalarView = container.firstChild
    assert.equal(scalarView.props.value, 'scalar')
    ReactDOM.flushSync(() => root.render(h(StateButton, { value: h('text', null, 'child') })))
    assert.strictEqual(container.firstChild, scalarView)
    assert.equal(Object.hasOwn(scalarView.props, 'value'), false)
    assert.equal(scalarView.textContent, 'child')
    flushNative()
    assert.equal(batches.at(-1)[scalarView._path + '.value'], '')

    ReactDOM.flushSync(() => root.render(h(StateButton, { value: 'restored' })))
    assert.equal(scalarView.props.value, 'restored')
    flushNative()
    assert.equal(batches.at(-1)[scalarView._path + '.value'], 'restored')
} finally {
    ReactDOM.flushSync(() => root.unmount())
    flushNative()
}
`
