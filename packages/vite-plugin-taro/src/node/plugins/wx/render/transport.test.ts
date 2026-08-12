import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { type Rolldown, transformWithOxc } from 'vite'
import { esTarget } from '../../../utils/constant.ts'
import { bootstrapPath, rolldownRuntimeId, transportPath } from '../module.ts'
import { renderNative } from './native.ts'
import { materializeTransport } from './transport.ts'

/** CommonJS exports of the generated transport runtime. */
interface TransportExports {
    transport(moduleId: string): unknown
}

const transportTypeScript = readFileSync(
    fileURLToPath(new URL('../../../../runtime/wx/amphibious/transport.ts', import.meta.url)),
    'utf8'
)
const transportJavaScript = (
    await transformWithOxc(transportTypeScript, 'transport.ts', { sourcemap: false, target: esTarget })
).code
const transportCode = renderNative({
    code: transportJavaScript,
    chunk: { fileName: 'transport.js' } as Rolldown.RenderedChunk,
    chunks: {},
    sourcemap: false
}).code

/** Materializes transport with the requested capsules and optional amphibious Rolldown runtime. */
async function materializeTestTransport({
    code,
    fileName,
    capsuleChunkIds,
    nativeRuntimeChunkId,
    physicalChunkIds
}: {
    code: string
    fileName: string
    capsuleChunkIds: readonly string[]
    nativeRuntimeChunkId?: string
    physicalChunkIds?: Readonly<Record<string, string>>
}): Promise<string> {
    const transportChunk = {
        fileName,
        isEntry: true,
        moduleIds: [transportPath],
        modules: {
            [transportPath]: {}
        }
    } as Rolldown.RenderedChunk
    const chunks: Record<string, Rolldown.RenderedChunk> = {
        'assets/bootstrap.js': {
            fileName: 'assets/bootstrap.js',
            isEntry: false,
            moduleIds: [bootstrapPath],
            modules: {
                [bootstrapPath]: {}
            }
        } as Rolldown.RenderedChunk,
        [fileName]: transportChunk
    }
    capsuleChunkIds.forEach((chunkId) => {
        chunks[chunkId] = {
            fileName: chunkId,
            isEntry: false,
            moduleIds: [chunkId],
            modules: {}
        } as Rolldown.RenderedChunk
    })
    if (nativeRuntimeChunkId) {
        chunks[nativeRuntimeChunkId] = {
            fileName: nativeRuntimeChunkId,
            isEntry: false,
            moduleIds: [rolldownRuntimeId],
            modules: {}
        } as Rolldown.RenderedChunk
    }

    const materialized = await materializeTransport({
        code,
        transportChunk,
        chunks,
        getLoadMode: (chunk) => (physicalChunkIds?.[chunk.fileName]?.startsWith('sub/') ? 'async' : 'sync'),
        getPhysicalChunkId: (chunk) => physicalChunkIds?.[chunk.fileName] ?? chunk.fileName
    })
    return materialized.code
}

/** Evaluates transport with mocked synchronous and asynchronous WeChat require APIs. */
function evaluateTransport(source: string, loadFile: (path: string) => unknown) {
    // Mutable traces distinguish physical API selection while retaining total invocation order.
    const requiredPaths: string[] = []
    const synchronouslyRequiredPaths: string[] = []
    const asynchronouslyRequiredPaths: string[] = []
    // The generated CommonJS transport mutates this module export cell during evaluation.
    const commonJsModule: { exports: unknown } = { exports: {} }

    /** Loads and records one synchronous native file path. */
    function nativeRequire(id: string): unknown {
        requiredPaths.push(id)
        synchronouslyRequiredPaths.push(id)
        return loadFile(id)
    }
    Object.assign(nativeRequire, {
        async(id: string): Promise<unknown> {
            requiredPaths.push(id)
            asynchronouslyRequiredPaths.push(id)
            return Promise.resolve(loadFile(id))
        }
    })

    Function('require', 'module', 'exports', source)(nativeRequire, commonJsModule, commonJsModule.exports)
    return {
        requiredPaths,
        synchronouslyRequiredPaths,
        asynchronouslyRequiredPaths,
        runtime: commonJsModule.exports as TransportExports
    }
}

/** Executes an amphibious registration and returns its published namespace. */
function executeAmphibiousRegistration(value: unknown): Record<string, unknown> {
    assert.ok(Array.isArray(value))
    const exportedNamespace: Record<string, unknown> = {}
    const declaration = value[1]((exports: Readonly<Record<string, unknown>>) => {
        Object.assign(exportedNamespace, exports)
    })
    declaration.execute()
    return exportedNamespace
}

test('materializes capsule switch cases with literal physical paths', async () => {
    const source = await materializeTestTransport({
        code: transportCode,
        fileName: 'transport.js',
        capsuleChunkIds: ['assets/root-c.js', 'assets/shared-a.js', 'assets/chunks/lazy-b.js']
    })
    const capsule = {}
    const evaluated = evaluateTransport(source, () => capsule)
    const transport = evaluated.runtime.transport

    assert.strictEqual(transport('chunks/lazy-b.js'), capsule)
    assert.deepEqual(evaluated.requiredPaths, ['./assets/chunks/lazy-b.js'])
    assert.throws(() => transport('missing.js'), /Unknown System module: missing\.js/)

    const requireArguments = [...source.matchAll(/\brequire\(([^)]+)\)/g)].map((match) => JSON.parse(match[1]))
    assert.deepEqual(requireArguments, [
        './assets/bootstrap.js',
        './assets/chunks/lazy-b.js',
        './assets/root-c.js',
        './assets/shared-a.js'
    ])
})

test('bridges amphibious bootstrap and Rolldown runtime namespaces lazily', async () => {
    const runtimeChunkId = 'assets/rolldown-runtime-a.js'
    const source = await materializeTestTransport({
        code: transportCode,
        fileName: 'transport.js',
        capsuleChunkIds: [],
        nativeRuntimeChunkId: runtimeChunkId
    })
    const bootstrapNamespace = { appConfig: {} }
    const runtimeNamespace = { n: () => 'runtime' }
    const evaluated = evaluateTransport(source, (id) => {
        return id === './assets/bootstrap.js' ? bootstrapNamespace : runtimeNamespace
    })
    const transport = evaluated.runtime.transport

    // Neither creating nor selecting transport may recursively require bootstrap while bootstrap imports transport.
    const bootstrapRegistration = transport('bootstrap.js')
    const runtimeRegistration = transport('rolldown-runtime-a.js')
    assert.deepEqual(evaluated.requiredPaths, [])

    const publishedBootstrap = executeAmphibiousRegistration(bootstrapRegistration)
    const publishedRuntime = executeAmphibiousRegistration(runtimeRegistration)

    assert.doesNotMatch(source, /\blet namespace\b/)
    assert.deepEqual(evaluated.requiredPaths, ['./assets/bootstrap.js', './assets/rolldown-runtime-a.js'])
    assert.strictEqual(publishedBootstrap.appConfig, bootstrapNamespace.appConfig)
    assert.strictEqual(publishedRuntime.n, runtimeNamespace.n)
})

test('waits for mocked require.async before resolving a subpackage capsule', async () => {
    const source = await materializeTestTransport({
        code: transportCode,
        fileName: 'transport.js',
        capsuleChunkIds: ['assets/page.js'],
        physicalChunkIds: {
            'assets/page.js': 'sub/p_account/assets/page.js'
        }
    })
    const capsule = {}
    const deferredLoad = Promise.withResolvers<unknown>()
    const evaluated = evaluateTransport(source, () => deferredLoad.promise)

    const loading = Promise.resolve(evaluated.runtime.transport('page.js'))
    // Mutable observation proves the transport promise cannot settle before mocked native download completion.
    let settled = false
    void loading.then(() => {
        settled = true
    })
    await Promise.resolve()

    assert.equal(settled, false)
    assert.deepEqual(evaluated.synchronouslyRequiredPaths, [])
    assert.deepEqual(evaluated.asynchronouslyRequiredPaths, ['./sub/p_account/assets/page.js'])
    deferredLoad.resolve(capsule)
    assert.strictEqual(await loading, capsule)
    assert.equal(settled, true)
    assert.match(source, /require\.async\(['"]\.\/sub\/p_account\/assets\/page\.js['"]\)/)
})

test('rejects an amphibious module outside the main package', async () => {
    await assert.rejects(
        materializeTestTransport({
            code: transportCode,
            fileName: 'transport.js',
            capsuleChunkIds: [],
            nativeRuntimeChunkId: 'assets/runtime.js',
            physicalChunkIds: {
                'assets/runtime.js': 'sub/p_runtime/assets/runtime.js'
            }
        }),
        /Amphibious wx module must be in the main package/
    )
})
