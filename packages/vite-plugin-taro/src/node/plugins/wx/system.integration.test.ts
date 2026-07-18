import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { type Rolldown, transformWithOxc } from 'vite'
import { esTarget } from '../../utils/constant.ts'
import { chunkIdToModuleUrl } from '../../utils/modules.ts'
import { bootstrapPath, transportPath } from './module.ts'
import { renderCapsule } from './render/capsule.ts'
import { renderNative } from './render/native.ts'
import { materializeTransport } from './render/transport.ts'
import { transformBootstrap } from './resolve/specialize-bootstrap.ts'

/** A test SystemJS module namespace. */
type SystemModule = Readonly<Record<string, unknown>>

/** The generated native transport runtime. */
interface NativeTransport {
    transport: Readonly<Record<string, () => unknown>>
}

/** The SystemJS surface used by runtime tests. */
interface SystemJsInstance {
    import(id: string, parentId?: string): Promise<SystemModule>
    instantiate(id: string, parentId?: string): unknown
    resolve(specifier: string, parentId?: string): string
}

/** Publishes test module bindings. */
type SystemExport = (name: string | Readonly<Record<string, unknown>>, value?: unknown) => unknown

/** Receives test dependency updates. */
type SystemSetter = (module: SystemModule) => void

/** A test module declaration. */
interface SystemDeclaration {
    setters?: readonly (SystemSetter | undefined)[]
    execute?: () => void | PromiseLike<void>
}

/** An inert test module registration. */
type SystemRegistration = readonly [
    dependencies: readonly string[],
    declare: (exportBinding: SystemExport) => SystemDeclaration
]

/** The SystemJS VM global. */
interface SystemJsGlobal {
    System?: SystemJsInstance
}

const transportFileName = 'transport.js'
const testAppConfig = { pages: ['pages/index/index'] }
const packageRequire = createRequire(import.meta.url)
const systemSource = readFileSync(packageRequire.resolve('systemjs/s.js'), 'utf8')
const bootstrapTypeScript = readFileSync(
    fileURLToPath(new URL('../../../runtime/wx/amphibious/bootstrap.ts', import.meta.url)),
    'utf8'
)
const compiledBootstrap = (await transformWithOxc(bootstrapTypeScript, 'bootstrap.ts', { target: esTarget })).code
const bootstrapJavaScript = (
    await transformBootstrap({
        code: compiledBootstrap,
        id: 'bootstrap.js',
        appConfig: testAppConfig
    })
).code
    .replace(/^import ['"]systemjs\/s\.js['"];\s*/m, '')
    .replace(
        /^import \{ createNativeShell \} from ['"]\.\.\/native\/shell\.(?:ts|js)['"];\s*/m,
        'const createNativeShell = () => ({})\n'
    )
const bootstrapCode = renderNative(bootstrapJavaScript, {
    fileName: 'assets/bootstrap.js'
} as Rolldown.RenderedChunk).code
const transportTypeScript = readFileSync(
    fileURLToPath(new URL('../../../runtime/wx/amphibious/transport.ts', import.meta.url)),
    'utf8'
)
const transportJavaScript = (await transformWithOxc(transportTypeScript, 'transport.ts', { target: esTarget })).code
const transportCode = renderNative(transportJavaScript, {
    fileName: transportFileName
} as Rolldown.RenderedChunk).code

/** Materializes the test transport from finalized capsule outputs. */
async function materializeTestTransport(capsuleChunkIds: readonly string[]): Promise<string> {
    const transportChunk = {
        fileName: transportFileName,
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
        [transportFileName]: transportChunk
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
        code: transportCode,
        transportChunk,
        chunks,
        getLoadMode: () => 'sync'
    })
    return materialized.code
}

/** Creates a SystemJS realm with the bootstrap and transport. */
async function createTestSystem(
    registrations: ReadonlyMap<string, SystemRegistration>,
    onInstantiate: (id: string) => void = () => undefined
): Promise<SystemJsInstance> {
    const capsules = new Map(registrations)
    const transportModule: { exports: unknown } = { exports: {} }
    const bootstrapModule: { exports: Record<string, unknown> } = {
        exports: {}
    }

    /** Loads one inert capsule or the completed amphibious bootstrap namespace. */
    function nativeRequire(id: string): unknown {
        const moduleId = path.posix.normalize(path.posix.join(path.posix.dirname(transportFileName), id))
        onInstantiate(moduleId)
        if (moduleId === 'assets/bootstrap.js') {
            return bootstrapModule.exports
        }
        const registration = capsules.get(moduleId)
        if (!registration) {
            throw new Error(`Unknown test module: ${moduleId}`)
        }
        return registration
    }

    Function(
        'require',
        'module',
        'exports',
        await materializeTestTransport([...capsules.keys()])
    )(nativeRequire, transportModule, transportModule.exports)
    const transport = transportModule.exports as NativeTransport

    const sandbox: Record<string, unknown> = {
        exports: bootstrapModule.exports,
        module: bootstrapModule,
        require: () => transport
    }
    // WeChat exposes a SystemJS installation host distinct from the App-service globalThis object.
    sandbox.global = {}
    const context = vm.createContext(sandbox)
    vm.runInContext(systemSource, context)
    vm.runInContext(bootstrapCode, context)
    return (sandbox.global as SystemJsGlobal).System!
}

/** Compiles ESM and evaluates its inert registration assignment. */
function compileRegistration(id: string, source: string): SystemRegistration {
    const capsule = renderCapsule(source, { fileName: id } as Rolldown.RenderedChunk)
    assert.ok(capsule)

    const commonJsModule: { exports?: unknown } = {}
    Function('module', capsule.code)(commonJsModule)
    assertSystemRegistration(commonJsModule.exports)
    return commonJsModule.exports
}

/** Validates an inert registration. */
function assertSystemRegistration(value: unknown): asserts value is SystemRegistration {
    assert.ok(Array.isArray(value))
    assert.equal(value.length, 2)
    assert.ok(Array.isArray(value[0]))
    assert.equal(typeof value[1], 'function')
}

/** Calls a validated function export. */
function callExport(module: SystemModule, name: string, ...arguments_: unknown[]): unknown {
    const value = module[name]
    if (typeof value !== 'function') {
        throw new Error(`Expected ${name} to be a function`)
    }
    return value.apply(undefined, arguments_)
}

test('shares native bootstrap exports with application capsules', async () => {
    const registrations = new Map<string, SystemRegistration>([
        [
            'assets/consumer.js',
            compileRegistration(
                'assets/consumer.js',
                `import { appConfig } from './bootstrap.js'
export { appConfig }`
            )
        ]
    ])
    const system = await createTestSystem(registrations)
    const bootstrap = await system.import(chunkIdToModuleUrl('assets/bootstrap.js'))
    const consumer = await system.import(chunkIdToModuleUrl('assets/consumer.js'))

    assert.equal(JSON.stringify(bootstrap.appConfig), JSON.stringify(testAppConfig))
    assert.strictEqual(consumer.appConfig, bootstrap.appConfig)
    assert.equal(typeof bootstrap.createAppShell, 'function')
    assert.equal(typeof bootstrap.createPageShell, 'function')
    assert.equal(typeof bootstrap.createComponentShell, 'function')
    assert.equal(bootstrap.createNativeShell, undefined)
    assert.equal(typeof bootstrap.__vitePreload, 'function')
})

test('loads real capsules with static imports, dynamic imports, live bindings, and import.meta', async () => {
    const registrations = new Map<string, SystemRegistration>([
        [
            'chunks/root.js',
            compileRegistration(
                'chunks/root.js',
                `import { value, setValue } from './state.js'
export const read = () => value
export { setValue }
export const moduleUrl = import.meta.url
export const load = () => import('./lazy.js')`
            )
        ],
        [
            'chunks/state.js',
            compileRegistration(
                'chunks/state.js',
                `export let value = 1
export function setValue(next) {
    value = next
}`
            )
        ],
        [
            'chunks/lazy.js',
            compileRegistration(
                'chunks/lazy.js',
                `import { value } from './state.js'
export const current = value`
            )
        ]
    ])
    const instantiations = new Map<string, number>()
    const system = await createTestSystem(registrations, (id) => {
        instantiations.set(id, (instantiations.get(id) ?? 0) + 1)
    })

    const rootId = chunkIdToModuleUrl('chunks/root.js')
    assert.equal(system.resolve(rootId), rootId)
    assert.equal(system.resolve('./state.js', rootId), chunkIdToModuleUrl('chunks/state.js'))

    const root = await system.import(rootId)

    assert.equal(callExport(root, 'read'), 1)
    assert.equal(root.moduleUrl, chunkIdToModuleUrl('chunks/root.js'))
    assert.equal(instantiations.get('chunks/lazy.js'), undefined)

    callExport(root, 'setValue', 7)
    assert.equal(callExport(root, 'read'), 7)

    const lazy = await callExport(root, 'load')
    assert.ok(lazy && typeof lazy === 'object')
    assert.equal(Object.getOwnPropertyDescriptor(lazy, 'current')?.value, 7)
    assert.strictEqual(await system.import(chunkIdToModuleUrl('chunks/lazy.js')), lazy)
    assert.equal(instantiations.get('chunks/root.js'), 1)
    assert.equal(instantiations.get('chunks/state.js'), 1)
    assert.equal(instantiations.get('chunks/lazy.js'), 1)
})

test('deduplicates concurrent instantiation and execution', async () => {
    let instantiations = 0
    let executions = 0
    const registration: SystemRegistration = [
        [],
        (exportBinding) => ({
            execute() {
                executions++
                exportBinding('value', 42)
            }
        })
    ]
    const system = await createTestSystem(new Map([['entry.js', registration]]), (id) => {
        if (id === 'entry.js') {
            instantiations++
        }
    })

    const entryId = chunkIdToModuleUrl('entry.js')
    const [first, second] = await Promise.all([system.import(entryId), system.import(entryId)])

    assert.strictEqual(first, second)
    assert.equal(first.value, 42)
    assert.equal(instantiations, 1)
    assert.equal(executions, 1)
})

test('links circular dependencies through declaration-time exports', async () => {
    const registrations = new Map<string, SystemRegistration>([
        [
            'a.js',
            [
                ['./b.js'],
                (exportBinding) => {
                    let importedB: unknown
                    const a = () => 'a'
                    exportBinding('a', a)

                    return {
                        setters: [
                            (module) => {
                                importedB = module.b
                            }
                        ],
                        execute() {
                            if (typeof importedB !== 'function') {
                                throw new Error('Module b was not linked')
                            }
                            exportBinding('value', `${importedB.call(undefined)}a`)
                        }
                    }
                }
            ]
        ],
        [
            'b.js',
            [
                ['./a.js'],
                (exportBinding) => {
                    let importedA: unknown
                    const b = () => 'b'
                    exportBinding('b', b)

                    return {
                        setters: [
                            (module) => {
                                importedA = module.a
                            }
                        ],
                        execute() {
                            if (typeof importedA !== 'function') {
                                throw new Error('Module a was not linked')
                            }
                            exportBinding('value', `${importedA.call(undefined)}b`)
                        }
                    }
                }
            ]
        ]
    ])
    const system = await createTestSystem(registrations)

    const a = await system.import(chunkIdToModuleUrl('a.js'))
    const b = await system.import(chunkIdToModuleUrl('b.js'))

    assert.equal(a.value, 'ba')
    assert.equal(b.value, 'ab')
})

test('waits for asynchronous dependency execution before executing importers', async () => {
    const order: string[] = []
    const registrations = new Map<string, SystemRegistration>([
        [
            'root.js',
            [
                ['./dependency.js'],
                (exportBinding) => {
                    let dependencyValue: unknown
                    return {
                        setters: [
                            (module) => {
                                dependencyValue = module.value
                            }
                        ],
                        execute() {
                            order.push('root')
                            exportBinding('value', dependencyValue)
                        }
                    }
                }
            ]
        ],
        [
            'dependency.js',
            [
                [],
                (exportBinding) => ({
                    async execute() {
                        order.push('dependency:start')
                        await Promise.resolve()
                        exportBinding('value', 42)
                        order.push('dependency:end')
                    }
                })
            ]
        ]
    ])
    const system = await createTestSystem(registrations)

    const root = await system.import(chunkIdToModuleUrl('root.js'))

    assert.deepEqual(order, ['dependency:start', 'dependency:end', 'root'])
    assert.equal(root.value, 42)
})
