import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { type Rolldown, transformWithOxc } from 'vite'
import { esTarget } from '../../../utils/constant.ts'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'
import { bootstrapPath, rolldownRuntimeId, transportPath } from '../native/constant.ts'
import { renderNative } from '../native/render-native.ts'
import { materializeTransport } from './materialize-transport.ts'

/** The generated native transport runtime. */
interface NativeTransport {
    transportTable: Readonly<Record<string, () => unknown>>
}

const transportTypeScript = readFileSync(
    fileURLToPath(new URL('../../../../runtime/wx/transport.ts', import.meta.url)),
    'utf8'
)
const transportJavaScript = (await transformWithOxc(transportTypeScript, 'transport.ts', { target: esTarget })).code
const transportCode = renderNative(transportJavaScript, {
    fileName: 'transport.js'
} as Rolldown.RenderedChunk).code

/** Materializes one transport entry with the requested capsule and optional Rolldown runtime outputs. */
async function materializeTestTransport({
    code,
    fileName,
    capsuleChunkIds,
    nativeRuntimeChunkId
}: {
    code: string
    fileName: string
    capsuleChunkIds: readonly string[]
    nativeRuntimeChunkId?: string
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
        getLoadMode: (chunk) => (chunk.fileName.startsWith('sub/') ? 'async' : 'sync')
    })
    return materialized.code
}

/** Evaluates a transport with a fake native require. */
function evaluateTransport(source: string, loadModule: (path: string) => unknown) {
    const requiredPaths: string[] = []
    const commonJsModule: { exports: unknown } = { exports: {} }

    /** Loads and records one native module path. */
    function nativeRequire(id: string): unknown {
        requiredPaths.push(id)
        return loadModule(id)
    }

    Function('require', 'module', 'exports', source)(nativeRequire, commonJsModule, commonJsModule.exports)
    return {
        requiredPaths,
        transport: commonJsModule.exports as NativeTransport
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

test('materializes capsule loaders with literal physical paths', async () => {
    const source = await materializeTestTransport({
        code: transportCode,
        fileName: 'transport.js',
        capsuleChunkIds: ['assets/root-c.js', 'assets/shared-a.js', 'assets/chunks/lazy-b.js']
    })
    const capsule = {}
    const evaluated = evaluateTransport(source, () => capsule)
    const modules = evaluated.transport.transportTable

    assert.strictEqual(modules[chunkIdToModuleUrl('assets/chunks/lazy-b.js')]?.(), capsule)
    assert.deepEqual(evaluated.requiredPaths, ['./assets/chunks/lazy-b.js'])
    assert.strictEqual(modules[chunkIdToModuleUrl('assets/missing.js')], undefined)

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
    const modules = evaluated.transport.transportTable

    // Creating the table must not recursively require bootstrap while bootstrap itself imports transport.
    assert.deepEqual(evaluated.requiredPaths, [])
    const publishedBootstrap = executeAmphibiousRegistration(modules[chunkIdToModuleUrl('assets/bootstrap.js')]?.())
    const publishedRuntime = executeAmphibiousRegistration(modules[chunkIdToModuleUrl(runtimeChunkId)]?.())

    assert.deepEqual(evaluated.requiredPaths, ['./assets/bootstrap.js', './assets/rolldown-runtime-a.js'])
    assert.strictEqual(publishedBootstrap.appConfig, bootstrapNamespace.appConfig)
    assert.strictEqual(publishedRuntime.n, runtimeNamespace.n)
})

test('materializes subpackage capsules with literal asynchronous loaders', async () => {
    const source = await materializeTestTransport({
        code: transportCode,
        fileName: 'transport.js',
        capsuleChunkIds: ['sub/p_account/page.js']
    })

    assert.match(source, /require\.async\(['"]\.\/sub\/p_account\/page\.js['"]\)/)
})

test('rejects an amphibious module outside the main package', async () => {
    await assert.rejects(
        materializeTestTransport({
            code: transportCode,
            fileName: 'transport.js',
            capsuleChunkIds: [],
            nativeRuntimeChunkId: 'sub/p_runtime/runtime.js'
        }),
        /Amphibious wx module must be in the main package/
    )
})
