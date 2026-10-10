import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build, type OutputChunk, type Plugin } from 'rolldown'
import { injectDevPageComponent } from '../../node/plugins/mini/dev/inject-dev-page-component.ts'
import { injectPageShellHmr } from '../../node/plugins/mini/dev/modes/devtools/devtools-hmr-mode.ts'

export type Call = Readonly<{
    name: string
    args: readonly unknown[]
}>

type Registration = (config: unknown) => void

export type ExecutionContext = Readonly<{
    globalThis: Record<string, unknown>
    global: Record<string, unknown>
    App: Registration
    Page: Registration
    Component: Registration
    wx?: object
}>

export const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Callers own the journal so each runtime execution can be checked independently.
export function recordCall(calls: Call[], name: string, result: unknown): (...args: unknown[]) => unknown {
    return (...args) => {
        calls.push({ name, args })
        return result
    }
}

function rejectRegistration(name: string): Registration {
    return () => assert.fail(`Unexpected ${name} registration`)
}

export async function bundleRuntimeEntry({
    entry,
    mocks,
    defines,
    servePageModuleId,
    nativePageHmr
}: {
    entry: string
    mocks: Readonly<Record<string, string>>
    defines: Readonly<Record<string, string>>
    servePageModuleId?: string
    nativePageHmr?: boolean
}): Promise<{ code: string; execute: (...args: unknown[]) => void }> {
    const input = path.join(runtimeRoot, entry)
    // Unique URLs across test workers keep V8 from merging coverage ranges from different bundles.
    const outputFile = path.join(runtimeRoot, `test/runtime-entry-${randomUUID()}.js`)
    const mockEntries = Object.entries(mocks).map(([request, source], index) => ({
        request,
        source,
        id: `\0vpt:runtime-entry-test:${index}`
    }))
    const mockIdByRequest = new Map(mockEntries.map(({ request, id }) => [request, id]))
    const mockSourceById = new Map(mockEntries.map(({ id, source }) => [id, source]))
    const mockPlugin: Plugin = {
        name: 'test:runtime-entry-mocks',
        resolveId(id) {
            return mockIdByRequest.get(id)
        },
        load(id) {
            const code = mockSourceById.get(id)
            if (code === undefined) {
                return
            }
            // Virtual mocks are test inputs, not original runtime sources.
            return { code, map: { version: 3, sources: [], names: [], mappings: '' } }
        },
        transform(code, id) {
            if (id === input && nativePageHmr) {
                return injectPageShellHmr(code)
            }
            if (id === input && servePageModuleId) {
                return injectDevPageComponent({ capsuleCode: code, componentId: servePageModuleId, capsuleId: id })
            }
        }
    }
    const result = await build({
        input,
        plugins: [mockPlugin],
        transform: {
            // Standalone CJS entries have no HMR unless a test supplies it or exercises a serve capsule.
            define: {
                'import.meta.hot': servePageModuleId ? 'globalThis.harness.hot' : 'undefined',
                ...defines
            }
        },
        output: {
            file: outputFile,
            exports: 'named',
            format: 'cjs',
            // A native module wrapper preserves the same lexical host bindings while making maps available to V8 coverage.
            postBanner:
                'export default function(module, exports, require, globalThis, global, App, Page, Component, wx, __rolldown_runtime__) {',
            postFooter: '}',
            sourcemap: 'inline'
        },
        write: false
    })
    const chunks = result.output.filter((output): output is OutputChunk => output.type === 'chunk')
    assert.equal(chunks.length, 1)
    const chunk = chunks[0]
    if (!chunk) {
        throw new Error(`Runtime entry did not emit JavaScript: ${entry}`)
    }
    const url = pathToFileURL(outputFile).href
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            return specifier === url ? { url, shortCircuit: true } : nextResolve(specifier, context)
        },
        load(id, context, nextLoad) {
            return id === url ? { format: 'module', source: chunk.code, shortCircuit: true } : nextLoad(id, context)
        }
    })
    try {
        const { default: execute }: { default: (...args: unknown[]) => void } = await import(url)
        return { code: chunk.code, execute }
    } finally {
        hooks.deregister()
    }
}

export function executeRuntimeEntry(
    { execute }: Awaited<ReturnType<typeof bundleRuntimeEntry>>,
    context: ExecutionContext
): Record<string, unknown> {
    const commonJsModule: { exports: Record<string, unknown> } = { exports: {} }
    const rejectRequire = (id: string): never => assert.fail(`Unexpected external runtime import: ${id}`)

    execute(
        commonJsModule,
        commonJsModule.exports,
        rejectRequire,
        context.globalThis,
        context.global,
        context.App,
        context.Page,
        context.Component,
        context.wx,
        context.globalThis.__rolldown_runtime__
    )

    return commonJsModule.exports
}

/** Import-only facades disappear during bundling; execute their original modules to verify re-exports and side effects. */
export async function importRuntimeFacade({
    entry,
    mocks,
    harness
}: {
    entry: string
    mocks: Readonly<Record<string, string>>
    harness: unknown
}): Promise<Record<string, unknown>> {
    const id = randomUUID()
    const key = `vpt.runtime-facade-test:${id}`
    const mockUrls = new Map(
        Object.entries(mocks).map(([request, source]) => [
            request,
            `data:text/javascript,${encodeURIComponent(source.replaceAll('globalThis.harness', `globalThis[Symbol.for(${JSON.stringify(key)})]`))}`
        ])
    )
    // Native module mocks share this test-local harness only for the duration of their import.
    Reflect.set(globalThis, Symbol.for(key), harness)
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            const url = mockUrls.get(specifier)
            return url ? { url, shortCircuit: true } : nextResolve(specifier, context)
        }
    })
    try {
        return await import(`${pathToFileURL(path.join(runtimeRoot, entry)).href}?facade-test=${id}`)
    } finally {
        hooks.deregister()
        Reflect.deleteProperty(globalThis, Symbol.for(key))
    }
}

export function createExecutionContext(harness: unknown): ExecutionContext {
    return {
        globalThis: { harness },
        global: {},
        App: rejectRegistration('App'),
        Page: rejectRegistration('Page'),
        Component: rejectRegistration('Component'),
        wx: { onBeforePageLoad() {} }
    }
}
