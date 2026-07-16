import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformWithOxc } from 'vite'
import { postRenderChunk } from '../post-render-chunk.ts'
import { chunkIdToModuleUrl } from '../transport/module-url.ts'
import { renderTransport } from '../transport/render-transport.ts'
import { bootstrapEntryName } from './bootstrap-name.ts'

/** A test SystemJS module namespace. */
type SystemModule = Readonly<Record<string, unknown>>

/** The generated native capsule loader. */
interface NativeTransport {
    instantiate(id: string, parentId?: string): unknown
}

/** The SystemJS surface used by bootstrap tests. */
interface SystemJsInstance {
    import(id: string, parentId?: string): Promise<SystemModule>
    instantiate(id: string, parentId?: string): unknown
    resolve(specifier: string, parentId?: string): string
}

/** An evaluated bootstrap fixture. */
interface EvaluatedBootstrap {
    system: SystemJsInstance
}

/** An evaluated transport fixture. */
interface EvaluatedTransport {
    requiredPaths: string[]
    transport: NativeTransport
}

const bootstrapTypeScript = readFileSync(
    fileURLToPath(new URL('../../../../runtime/wx/bootstrap.ts', import.meta.url)),
    'utf8'
)
const bootstrapJavaScript = (
    await transformWithOxc(bootstrapTypeScript, 'bootstrap.ts', { target: 'es2018' })
).code.replace(/^import ['"]systemjs\/s\.js['"];\s*/m, '')
const bootstrapChunk = {
    fileName: '__taro__/bootstrap.js',
    isEntry: true,
    name: bootstrapEntryName
}

/** Evaluates the bootstrap with isolated native globals. */
function evaluateBootstrap(
    transport: NativeTransport,
    importModule: (id: string, parentId?: string) => Promise<SystemModule>
): EvaluatedBootstrap {
    const sandbox: Record<string, unknown> = {
        require: () => transport
    }

    /** Models the SystemJS instance configured by the bootstrap. */
    class TestSystem implements SystemJsInstance {
        import(id: string, parentId?: string): Promise<SystemModule> {
            return importModule(id, parentId)
        }

        instantiate(): unknown {
            throw new Error('instantiate hook was not installed')
        }

        resolve(): string {
            throw new Error('resolve hook was not installed')
        }
    }

    const system = new TestSystem()
    sandbox.global = sandbox
    sandbox.System = system
    const bootstrap = postRenderChunk(bootstrapJavaScript, bootstrapChunk)
    vm.runInNewContext(bootstrap.code, sandbox)

    return { system }
}

/** Evaluates a transport with a fake native require. */
function evaluateTransport(source: string, loadCapsule: (path: string) => unknown): EvaluatedTransport {
    const requiredPaths: string[] = []
    const commonJsModule: { exports: unknown } = { exports: {} }

    /** Loads and records one capsule path. */
    function nativeRequire(id: string): unknown {
        requiredPaths.push(id)
        return loadCapsule(id)
    }

    Function('require', 'module', 'exports', source)(nativeRequire, commonJsModule, commonJsModule.exports)
    return {
        requiredPaths,
        transport: commonJsModule.exports as NativeTransport
    }
}

test('restores native require after Rolldown rendering', () => {
    const code = 'const transport = __VITE_PLUGIN_TARO_NATIVE_REQUIRE__("../transport.js")'
    const bootstrap = postRenderChunk(code, bootstrapChunk)

    assert.equal(bootstrap.code, 'const transport=require("../transport.js");')
    assert.deepEqual(bootstrap.map.sources, ['__taro__/bootstrap.js'])
    assert.throws(() => postRenderChunk('const value = 1', bootstrapChunk), /Expected native require/)
})

test('renders a literal native capsule transport', () => {
    const source = renderTransport(['assets/root-c.js', 'assets/taro-bridge-a.js', 'assets/chunks/lazy-b.js'])
    const capsule = {}
    const evaluated = evaluateTransport(source, () => capsule)

    assert.strictEqual(evaluated.transport.instantiate(chunkIdToModuleUrl('assets/chunks/lazy-b.js')), capsule)
    assert.deepEqual(evaluated.requiredPaths, ['./assets/chunks/lazy-b.js'])
    assert.throws(
        () => evaluated.transport.instantiate(chunkIdToModuleUrl('assets/missing.js')),
        /Unknown System module/
    )

    const requireArguments = [...source.matchAll(/\brequire\(([^)]+)\)/g)].map((match) => JSON.parse(match[1]))
    assert.deepEqual(requireArguments, ['./assets/chunks/lazy-b.js', './assets/root-c.js', './assets/taro-bridge-a.js'])
})

test('configures the shared SystemJS registry for concurrent imports', async () => {
    const imports: string[] = []
    const transport: NativeTransport = {
        instantiate: () => undefined
    }
    const evaluated = evaluateBootstrap(transport, (id) => {
        imports.push(id)
        return Promise.resolve({ id })
    })

    const appId = chunkIdToModuleUrl('assets/root.js')
    const pageId = chunkIdToModuleUrl('assets/page.js')
    const [appModule, pageModule] = await Promise.all([evaluated.system.import(appId), evaluated.system.import(pageId)])

    assert.strictEqual(evaluated.system.instantiate, transport.instantiate)
    assert.deepEqual(imports, [appId, pageId])
    assert.equal(appModule.id, appId)
    assert.equal(pageModule.id, pageId)
})
