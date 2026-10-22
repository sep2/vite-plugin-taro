import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

async function load(
    t: TestContext,
    entry: string,
    renderer: 'dom' | 'template',
    modules: Record<string, unknown>,
    globals: Record<string, unknown>
) {
    const result = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
            {
                name: 'test:logical-host',
                resolveId(id) {
                    if (id === '\0vpt:renderer-host' || id === 'virtual:taro/components') {
                        return id
                    }
                },
                load(id) {
                    if (id === 'virtual:taro/components') {
                        return `export const View = 'view'; export const Text = 'text'`
                    }
                    if (id === '\0vpt:renderer-host') {
                        return `import { document, FormElement } from 'vite-plugin-taro-runtime/runtime/mini'
                    export default {
                        createElement: (_, context, type) => document.createElement(type),
                        createText: (_, context, text) => document.createTextNode(text),
                        getChildHostContext: parent => parent,
                        getPageRootType: () => 'root',
                        isFormElement: node => node instanceof FormElement,
                        batchStyleUpdate: (_, update) => update(),
                        afterCommit() {}
                    }`
                    }
                }
            }
        ],
        define: {
            ENABLE_ADJACENT_HTML: 'true',
            ENABLE_CLONE_NODE: 'true',
            ENABLE_CONTAINS: 'true',
            ENABLE_INNER_HTML: 'true',
            ENABLE_MUTATION_OBSERVER: 'true',
            ENABLE_SIZE_APIS: 'true',
            ENABLE_TEMPLATE_CONTENT: 'true',
            __BENCHMARK_RENDERER__: JSON.stringify(renderer),
            'process.env.NODE_ENV': JSON.stringify('production'),
            'process.env.TARO_ENV': JSON.stringify('weapp'),
            'process.env.TARO_PLATFORM': JSON.stringify('mini')
        },
        build: {
            write: false,
            emptyOutDir: false,
            minify: false,
            lib: { entry: path.join(root, entry), formats: ['cjs'], fileName: 'unit' },
            rolldownOptions: { external: (id) => id.startsWith('node:') || Object.hasOwn(modules, id) }
        }
    })
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 1)
    const output = result[0]!
    const chunk = output.output.find((item) => item.type === 'chunk')
    assert.ok(chunk?.type === 'chunk')
    // Every scheduler timer belongs to this test and is closed even if an assertion fails.
    const timers = new Set<ReturnType<typeof setTimeout>>()
    t.after(() => {
        for (const timer of timers) {
            clearTimeout(timer)
        }
    })
    const exports: Record<string, unknown> = {}
    runInNewContext(chunk.code, {
        module: { exports },
        exports,
        global: {},
        console,
        performance,
        require(id: string) {
            return Object.hasOwn(modules, id) ? modules[id] : require(id)
        },
        setTimeout(callback: () => void, delay: number | undefined) {
            const timer = setTimeout(() => {
                timers.delete(timer)
                callback()
            }, delay)
            timers.add(timer)
            return timer
        },
        clearTimeout(timer: ReturnType<typeof setTimeout>) {
            timers.delete(timer)
            clearTimeout(timer)
        },
        ...globals
    })
    return (name: string, args: unknown[]) => {
        const fn = exports[name]
        assert.ok(typeof fn === 'function')
        return fn(...args)
    }
}

for (const renderer of ['dom', 'template'] as const) {
    test(`${renderer}: the same native query callback ends timing after wx.nextTick`, async (t) => {
        // Controlled SDK callbacks and a clock prove the boundary without measuring execution speed.
        const ticks: (() => void)[] = []
        const readback = Promise.withResolvers<{ id: string; width: number; height: number }[]>()
        const queried = Promise.withResolvers<void>()
        const queries: string[] = []
        const clock = { now: 106 }
        const invoke = await load(
            t,
            'src/measure-native-update.ts',
            renderer,
            {
                './native.ts': {
                    queryNative(selector: string, all: boolean) {
                        assert.equal(all, false)
                        queries.push(selector)
                        queried.resolve()
                        return readback.promise
                    }
                }
            },
            {
                wx: {
                    getPerformance: () => ({ now: () => clock.now }),
                    nextTick: (callback: () => void) => ticks.push(callback)
                }
            }
        )
        const completed = Promise.resolve(invoke('measureNativeUpdate', [100, 106, 4]))
        assert.equal(ticks.length, 1)
        assert.deepEqual(queries, [])
        clock.now = 120
        ticks.shift()!()
        await queried.promise
        assert.deepEqual(queries, ['>>> #benchmark-state-4'])
        clock.now = 200
        readback.resolve([{ id: 'benchmark-state-4', width: 100, height: 20 }])
        assert.deepEqual(JSON.parse(JSON.stringify(await completed)), {
            duration: 100,
            commitDuration: 6,
            layoutDuration: 94,
            revision: 4
        })
    })

    test(`${renderer}: the common probe requests identical native fields`, async (t) => {
        // Capture the actual SDK query and release its callback only after exec has submitted it.
        const calls: unknown[] = []
        const callbacks: ((value: { id: string; width: number; height: number }) => void)[] = []
        const selection = {
            fields(options: unknown, callback: (typeof callbacks)[number]) {
                calls.push(options)
                callbacks.push(callback)
                return {
                    exec() {
                        calls.push('exec')
                    }
                }
            }
        }
        const invoke = await load(
            t,
            'src/native.ts',
            renderer,
            {},
            {
                wx: {
                    createSelectorQuery: () => ({
                        select(selector: string) {
                            calls.push(selector)
                            return selection
                        }
                    })
                }
            }
        )
        const completed = Promise.resolve(invoke('queryNative', ['>>> #benchmark-state-4', false]))
        assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
            '>>> #benchmark-state-4',
            { id: true, rect: true, size: true },
            'exec'
        ])
        callbacks.shift()!({ id: 'benchmark-state-4', width: 100, height: 20 })
        assert.deepEqual(JSON.parse(JSON.stringify(await completed)), [
            { id: 'benchmark-state-4', width: 100, height: 20 }
        ])
    })

    test(`${renderer}: missing, stale, and unlaid-out native revisions reject timing`, async (t) => {
        for (const fields of [
            [],
            [{ id: 'benchmark-state-3', height: 20 }],
            [{ id: 'benchmark-state-4', height: 0 }]
        ]) {
            const invoke = await load(
                t,
                'src/measure-native-update.ts',
                renderer,
                {
                    './native.ts': { queryNative: async () => fields }
                },
                {
                    wx: { getPerformance: () => ({ now: () => 200 }), nextTick: (callback: () => void) => callback() }
                }
            )
            await assert.rejects(
                Promise.resolve(invoke('measureNativeUpdate', [100, 106, 4])),
                /Native marker mismatch/
            )
        }
    })
}

test('memoized rows skip unchanged renders and preserve action handlers during selection updates', async (t) => {
    const invoke = await load(t, 'scripts/test-benchmark-row.tsx', 'dom', {}, {})
    invoke('testBenchmarkRow', [])
})
