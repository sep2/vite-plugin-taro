import assert from 'node:assert/strict'
import { mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { constants, createContext, runInContext } from 'node:vm'
import type { OutputChunk } from 'rolldown'
import { dev } from 'rolldown/experimental'
import { DevRuntime } from 'rolldown/experimental/runtime'
import { normalizePath } from 'vite'
import type { PatchUpdate } from '../dev/hmr-protocol.ts'
import { vptGlobalBindingId } from '../module/module.ts'
import { createMiniGlobalPlugin } from './create-mini-global-plugin.ts'

/** Factory registration is real; this fixture exercises imports and globals rather than React Refresh callbacks. */
class RegistrationRuntime extends DevRuntime {
    override createModuleHotContext(_moduleId: string): Readonly<{ accept: () => void }> {
        return { accept() {} }
    }
}

function moduleSource(value: number): string {
    return `export const root = globalThis; export const value = ${value}; if (import.meta.hot) { import.meta.hot.accept(); }`
}

/** Execute the complete emitted graph without manually registering the global facade or installing a globalThis alias. */
function createHeap(chunks: readonly OutputChunk[], setup: string) {
    const context = createContext(constants.DONT_CONTEXTIFY, { codeGeneration: { strings: false, wasm: false } })
    const runtime = new RegistrationRuntime('global-test')
    context.__createRuntime = (global: unknown) => {
        assert.equal(global, runInContext('this', context))
        context.__rolldown_runtime__ = runtime
        return runtime
    }
    runInContext(
        `
        this.discoveries = 0;
        const nativeDefine = Object.defineProperty;
        Object.defineProperty = (object, key, descriptor) => {
            if (key === '__vpt_global__') { discoveries += 1; }
            return nativeDefine(object, key, descriptor);
        };
        ${setup}
    `,
        context
    )
    const files = new Map(chunks.map((chunk) => [chunk.fileName, chunk.code]))
    // The native loader owns these mutable exports cells, including registration before traversing dependency edges.
    const modules = new Map<string, { exports: unknown }>()
    function load(fileName: string): unknown {
        const cached = modules.get(fileName)
        if (cached) {
            return cached.exports
        }
        const source = files.get(fileName)
        assert.ok(source !== undefined, `Missing native file: ${fileName}`)
        const module: { exports: unknown } = { exports: {} }
        modules.set(fileName, module)
        const execute: unknown = runInContext(`(function(require, module, exports) {\n${source}\n})`, context)
        assert.ok(typeof execute === 'function')
        execute(
            (request: string) => load(path.posix.join(path.posix.dirname(fileName), request)),
            module,
            module.exports
        )
        return module.exports
    }
    return { context, runtime, load }
}

test('real HMR factories reuse the registered binding without rediscovering the global', async (t) => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-shared-global-')))
    t.after(() => rm(root, { recursive: true, force: true }))
    const entry = path.join(root, 'entry.js')
    await writeFile(entry, moduleSource(1))
    const [globalPlugin, globalDevPlugin] = createMiniGlobalPlugin({
        getPhysicalChunkId(chunk) {
            assert.ok(typeof chunk !== 'string')
            return chunk.fileName
        }
    })
    // DevEngine callbacks append actual patches and failures; each full output replaces the immutable baseline snapshot.
    const patches: PatchUpdate[] = []
    const failures: unknown[] = []
    let chunks: readonly OutputChunk[] = []
    const engine = await dev(
        {
            cwd: root,
            input: entry,
            transform: { inject: { globalThis: [vptGlobalBindingId, 'vptGlobal'] } },
            experimental: {
                devMode: {
                    lazy: false,
                    skipCommonRuntimeInjection: true,
                    implement: '__rolldown_runtime__ = __createRuntime(__VPT_GLOBAL__);'
                }
            },
            plugins: [
                {
                    name: globalPlugin.name,
                    resolveId: globalPlugin.resolveId,
                    load: globalPlugin.load,
                    renderChunk: globalPlugin.renderChunk,
                    generateBundle: globalPlugin.generateBundle
                },
                { name: globalDevPlugin.name, renderChunk: globalDevPlugin.renderChunk },
                {
                    name: 'test:capture-global-output',
                    generateBundle: {
                        order: 'post',
                        handler(_options, bundle) {
                            chunks = Object.values(bundle).filter(
                                (output): output is OutputChunk => output.type === 'chunk'
                            )
                        }
                    }
                }
            ]
        },
        {
            format: 'cjs',
            entryFileNames: 'nested/[name]-[hash].js',
            chunkFileNames: 'nested/shared/[name]-[hash].js',
            minify: true
        },
        {
            rebuildStrategy: 'never',
            watch: { skipWrite: true },
            onHmrUpdates(result) {
                if (result instanceof Error) {
                    failures.push(result)
                    return
                }
                for (const { update } of result.updates) {
                    if (update.type === 'Patch') {
                        patches.push(update)
                    } else if (update.type !== 'Noop') {
                        failures.push(update)
                    }
                }
            }
        }
    )
    t.after(() => engine.close())
    await engine.run()
    await engine.ensureCurrentBuildFinish()
    await engine.registerClient('global-test')
    const main = chunks.find((chunk) => normalizePath(chunk.facadeModuleId ?? '') === normalizePath(entry))
    assert.ok(main)
    const heaps = ['', 'delete this.globalThis;', 'let globalThis;'].map((setup) => {
        const heap = createHeap(chunks, setup)
        const exports = heap.load(main.fileName)
        assert.ok(exports && typeof exports === 'object')
        assert.equal(Reflect.get(exports, 'root'), runInContext('this', heap.context))
        assert.equal(Reflect.get(exports, 'value'), 1)
        return heap
    })

    // Atomic replacement exposes one complete source generation to the actual native watcher.
    await writeFile(`${entry}.tmp`, moduleSource(2))
    await rename(`${entry}.tmp`, entry)
    const deadline = Date.now() + 10_000
    while (patches.length === 0) {
        assert.deepEqual(failures, [])
        assert.ok(Date.now() < deadline, 'Timed out waiting for the generated global-using patch')
        await delay(10)
    }
    await engine.ensureCurrentBuildFinish()
    assert.deepEqual(failures, [])
    assert.equal(patches.length, 1)
    const patch = patches[0]
    assert.match(patch.code, /vpt:global-binding/)
    assert.doesNotMatch(patch.code, /__VPT_GLOBAL__|vpt\.fake\.global|require\(/)
    for (const [index, heap] of heaps.entries()) {
        runInContext(patch.code, heap.context)
        for (const id of patch.changedIds) {
            heap.runtime.removeModuleCache(id)
            heap.runtime.initModule(id)
            const exports = heap.runtime.loadExports(id)
            assert.equal(exports.root, runInContext('this', heap.context))
            assert.equal(exports.value, 2)
        }
        assert.equal(runInContext('discoveries', heap.context), 0)
        assert.equal(runInContext('typeof globalThis', heap.context), index === 0 ? 'object' : 'undefined')
    }
})
