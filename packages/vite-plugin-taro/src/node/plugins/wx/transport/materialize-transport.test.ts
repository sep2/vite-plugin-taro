import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { type Rolldown, transformWithOxc } from 'vite'
import { chunkIdToModuleUrl } from '../../../utils/modules.ts'
import { bootstrapPath, transportPath } from '../native/constant.ts'
import { renderNativeModule } from '../native/render-native-module.ts'
import { materializeTransport } from './materialize-transport.ts'

/** The generated native capsule-loader table. */
interface NativeTransport {
    finalizeTransport(bootstrapModule: object): Readonly<Record<string, () => unknown>>
}

const transportTypeScript = readFileSync(
    fileURLToPath(new URL('../../../../runtime/wx/transport.ts', import.meta.url)),
    'utf8'
)
const transportJavaScript = (await transformWithOxc(transportTypeScript, 'transport.ts', { target: 'es2018' })).code
const transportCode = renderNativeModule(transportJavaScript, {
    fileName: 'transport.js'
} as Rolldown.RenderedChunk).code

/** Materializes one transport entry with the requested capsule outputs. */
async function materializeTestTransport({
    code,
    fileName,
    capsuleChunkIds,
    loadMode = 'sync'
}: {
    code: string
    fileName: string
    capsuleChunkIds: readonly string[]
    loadMode?: 'sync' | 'async'
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

    const materialized = await materializeTransport({
        code,
        transportChunk,
        chunks,
        getLoadMode: () => loadMode
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

test('specializes the physical runtime with literal capsule loaders', async () => {
    const source = await materializeTestTransport({
        code: transportCode,
        fileName: 'transport.js',
        capsuleChunkIds: ['assets/root-c.js', 'assets/shared-a.js', 'assets/chunks/lazy-b.js']
    })
    const capsule = {}
    const evaluated = evaluateTransport(source, () => capsule)

    const bootstrapModule = {}
    const modules = evaluated.transport.finalizeTransport(bootstrapModule)
    assert.ok(modules[chunkIdToModuleUrl('assets/bootstrap.js')]?.())
    assert.strictEqual(modules[chunkIdToModuleUrl('assets/chunks/lazy-b.js')]?.(), capsule)
    assert.deepEqual(evaluated.requiredPaths, ['./assets/chunks/lazy-b.js'])
    assert.strictEqual(modules[chunkIdToModuleUrl('assets/missing.js')], undefined)

    const requireArguments = [...source.matchAll(/\brequire\(([^)]+)\)/g)].map((match) => JSON.parse(match[1]))
    assert.deepEqual(requireArguments, ['./assets/chunks/lazy-b.js', './assets/root-c.js', './assets/shared-a.js'])
})

test('materializes subpackage capsules with literal asynchronous loaders', async () => {
    const source = await materializeTestTransport({
        code: transportCode,
        fileName: 'transport.js',
        capsuleChunkIds: ['packages/account/page.js'],
        loadMode: 'async'
    })

    assert.match(source, /require\.async\(['"]\.\/packages\/account\/page\.js['"]\)/)
})
