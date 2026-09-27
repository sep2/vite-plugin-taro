import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createContext, runInContext } from 'node:vm'
import type { MiniSocketTask } from '../../runtime/mini/dev/mini-hmr-runtime.ts'
import type { HmrInfo } from '../plugins/mini/dev/hmr-protocol.ts'

/** Executes generated native CommonJS, SystemJS transport and HMR code without a DevTools installation. */
export function createNativeDevRuntime(outDir: string, info: HmrInfo) {
    // This fixture-local journal observes actual runtime ACK/rebuild decisions without opening a native socket.
    const reports: unknown[] = []
    const socket: MiniSocketTask = {
        onOpen(listener) {
            listener()
        },
        onClose() {},
        onError() {},
        onMessage() {},
        send({ data }) {
            reports.push(JSON.parse(data).data)
        },
        close() {}
    }
    const context = createContext(
        { console, queueMicrotask, wx: { connectSocket: () => socket } },
        { codeGeneration: { strings: false, wasm: false } }
    )
    // Native require caches physical modules; SystemJS independently owns their registration namespaces.
    const modules = new Map<string, { exports: unknown }>()

    function run(code: string): unknown {
        return runInContext(code, context)
    }

    function evaluate(source: string, fileName: string, module: { exports: unknown }): void {
        const requireNative = Object.assign(
            (request: string) => load(path.posix.join(path.posix.dirname(fileName), request)),
            {
                async: (request: string) =>
                    Promise.resolve().then(() => load(path.posix.join(path.posix.dirname(fileName), request)))
            }
        )
        const execute: unknown = runInContext(`(function(require, module, exports) {\n${source}\n})`, context, {
            filename: path.join(outDir, fileName)
        })
        assert.ok(typeof execute === 'function')
        execute(requireNative, module, module.exports)
    }

    function load(fileName: string): unknown {
        const cached = modules.get(fileName)
        if (cached) {
            return cached.exports
        }
        // Cache before execution so recursive native requires observe the same mutable exports cell.
        const module: { exports: unknown } = { exports: {} }
        modules.set(fileName, module)
        evaluate(readFileSync(path.join(outDir, fileName), 'utf8'), fileName, module)
        return module.exports
    }

    load('common/rolldown-runtime.js')
    load('common/bootstrap.js')
    run(`globalThis.__rolldown_runtime__.initialize(${JSON.stringify(info)})`)

    return {
        run,
        reports,
        applyPatches(source: string): void {
            // DevTools re-evaluates the physical patch module while the App's runtime and native chunk cache survive.
            const module: { exports: unknown } = { exports: {} }
            evaluate(source, 'hmr/patches.js', module)
            context.payload = module.exports
            run('globalThis.__rolldown_runtime__.applyPatches(payload)')
        }
    }
}
