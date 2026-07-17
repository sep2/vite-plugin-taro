import assert from 'node:assert/strict'
import test from 'node:test'
import { chunkIdToModuleUrl } from './module-url.ts'
import { renderTransport } from './render-transport.ts'

/** The generated native capsule loader. */
interface NativeTransport {
    instantiate(id: string, parentId?: string): unknown
}

/** An inert System registration. */
type Registration = readonly [readonly string[], (exportBinding: (exports: object) => void) => { execute(): void }]

/** Evaluates a transport with a fake native require. */
function evaluateTransport(source: string, loadModule: (path: string) => unknown) {
    const requiredPaths: string[] = []
    const commonJsModule: { exports: unknown } = { exports: {} }

    /** Loads and records one native module path. */
    function nativeRequire(id: string): unknown {
        requiredPaths.push(id)
        return loadModule(id)
    }

    Function('require', 'module', source)(nativeRequire, commonJsModule)
    return {
        requiredPaths,
        transport: commonJsModule.exports as NativeTransport
    }
}

test('renders literal capsule loaders and a native bootstrap registration', () => {
    const source = renderTransport({
        bootstrapChunkId: 'assets/bootstrap-d.js',
        capsuleChunkIds: ['assets/root-c.js', 'assets/shared-a.js', 'assets/chunks/lazy-b.js']
    })
    const capsule = {}
    const bootstrap = { __vitePreload: (load: () => unknown) => load() }
    const evaluated = evaluateTransport(source, (id) => (id.includes('bootstrap') ? bootstrap : capsule))

    assert.strictEqual(evaluated.transport.instantiate(chunkIdToModuleUrl('assets/chunks/lazy-b.js')), capsule)
    assert.deepEqual(evaluated.requiredPaths, ['./assets/chunks/lazy-b.js'])

    const registration = evaluated.transport.instantiate(chunkIdToModuleUrl('assets/bootstrap-d.js')) as Registration
    const namespace: Record<string, unknown> = {}
    const declaration = registration[1]((exports) => Object.assign(namespace, exports))
    declaration.execute()
    assert.deepEqual(registration[0], [])
    assert.strictEqual(namespace.__vitePreload, bootstrap.__vitePreload)
    assert.deepEqual(evaluated.requiredPaths, ['./assets/chunks/lazy-b.js', './assets/bootstrap-d.js'])

    assert.throws(
        () => evaluated.transport.instantiate(chunkIdToModuleUrl('assets/missing.js')),
        /Unknown System module/
    )

    const requireArguments = [...source.matchAll(/\brequire\(([^)]+)\)/g)].map((match) => JSON.parse(match[1]))
    assert.deepEqual(requireArguments, [
        './assets/bootstrap-d.js',
        './assets/chunks/lazy-b.js',
        './assets/root-c.js',
        './assets/shared-a.js'
    ])
})
