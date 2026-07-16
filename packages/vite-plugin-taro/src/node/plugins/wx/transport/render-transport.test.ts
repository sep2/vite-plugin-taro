import assert from 'node:assert/strict'
import test from 'node:test'
import { chunkIdToModuleUrl } from './module-url.ts'
import { renderTransport } from './render-transport.ts'

/** The generated native capsule loader. */
interface NativeTransport {
    instantiate(id: string, parentId?: string): unknown
}

/** Evaluates a transport with a fake native require. */
function evaluateTransport(source: string, loadCapsule: (path: string) => unknown) {
    const requiredPaths: string[] = []
    const commonJsModule: { exports: unknown } = { exports: {} }

    /** Loads and records one capsule path. */
    function nativeRequire(id: string): unknown {
        requiredPaths.push(id)
        return loadCapsule(id)
    }

    Function('require', 'module', source)(nativeRequire, commonJsModule)
    return {
        requiredPaths,
        transport: commonJsModule.exports as NativeTransport
    }
}

test('renders literal native capsule loaders', () => {
    const source = renderTransport(['assets/root-c.js', 'assets/shared-a.js', 'assets/chunks/lazy-b.js'])
    const capsule = {}
    const evaluated = evaluateTransport(source, () => capsule)

    assert.strictEqual(evaluated.transport.instantiate(chunkIdToModuleUrl('assets/chunks/lazy-b.js')), capsule)
    assert.deepEqual(evaluated.requiredPaths, ['./assets/chunks/lazy-b.js'])
    assert.throws(
        () => evaluated.transport.instantiate(chunkIdToModuleUrl('assets/missing.js')),
        /Unknown System module/
    )

    const requireArguments = [...source.matchAll(/\brequire\(([^)]+)\)/g)].map((match) => JSON.parse(match[1]))
    assert.deepEqual(requireArguments, ['./assets/chunks/lazy-b.js', './assets/root-c.js', './assets/shared-a.js'])
})
