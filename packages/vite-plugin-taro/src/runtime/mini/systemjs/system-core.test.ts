import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createContext, Script } from 'node:vm'

// The source placeholder is normally specialized by the Mini plugin before evaluation.
Reflect.set(globalThis, '__VPT_RUNTIME_GLOBAL__', global)
createRequire(import.meta.url)('./system-core.js')
Reflect.deleteProperty(globalThis, '__VPT_RUNTIME_GLOBAL__')

const system = (global as unknown as { System: System.Loader }).System

function createRegistration(dependencies: readonly string[], declare: System.Declare): System.Registration {
    return [dependencies, declare]
}

function requireRegistration(registrations: ReadonlyMap<string, System.Registration>, id: string): System.Registration {
    const registration = registrations.get(id)
    if (!registration) {
        throw new Error(`Unknown test registration: ${id}`)
    }
    return registration
}

function installRegistrations(registrations: ReadonlyMap<string, System.Registration>): void {
    system.instantiate = (id) => requireRegistration(registrations, id)
}

test('uses the string registry and plain namespaces when Symbol is unavailable', async () => {
    const filename = fileURLToPath(new URL('./system-core.js', import.meta.url))
    const source = await readFile(filename, 'utf8')
    const exportList = 'export { REGISTRY, systemJSPrototype }'
    const exportedFunction = 'export function getOrCreateLoad'
    const runtimeGlobalPlaceholder = '__VPT_RUNTIME_GLOBAL__'
    // The VM script shares this source filename for coverage, so preserve byte offsets while specializing its placeholder.
    const runtimeGlobalReplacement = 'global'.padEnd(runtimeGlobalPlaceholder.length)
    const executable = source
        .replaceAll(runtimeGlobalPlaceholder, runtimeGlobalReplacement)
        .replace(exportList, ' '.repeat(exportList.length))
        .replace(exportedFunction, `       ${exportedFunction.slice('export '.length)}`)
    // The isolated global receives the loader created by the fallback runtime.
    const runtimeGlobal: { System?: System.Loader } = {}
    const context = createContext({ global: runtimeGlobal, Symbol: undefined })

    new Script(executable, { filename }).runInContext(context)

    const fallbackSystem = runtimeGlobal.System
    assert.ok(fallbackSystem)
    assert.equal(Object.hasOwn(fallbackSystem, '@'), true)
    assert.deepEqual(Object.getOwnPropertySymbols(fallbackSystem), [])

    fallbackSystem.instantiate = () =>
        createRegistration([], (exportBinding) => ({
            execute() {
                exportBinding('value', 42)
            }
        }))
    const namespace = fallbackSystem.importSync('fallback/entry.js')

    assert.equal(namespace.value, 42)
    assert.equal(Object.prototype.toString.call(namespace), '[object Object]')
})

test('captures and consumes anonymous System.register declarations', () => {
    const registrationApi = system as System.Loader & {
        register(dependencies: readonly string[], declare: System.Declare): void
        getRegister(): System.Registration | undefined
    }
    const declare: System.Declare = () => ({ execute() {} })

    registrationApi.register(['capture/dependency.js'], declare)

    assert.deepEqual(registrationApi.getRegister(), [['capture/dependency.js'], declare, undefined])
    assert.equal(registrationApi.getRegister(), undefined)
})

test('executes a shared synchronous graph once in dependency-first order', () => {
    const order: string[] = []
    const instantiations = new Map<string, number>()
    const registrations = new Map<string, System.Registration>([
        [
            'order/shared.js',
            createRegistration([], (exportBinding) => ({
                execute() {
                    order.push('shared')
                    exportBinding('value', 1)
                }
            }))
        ],
        [
            'order/left.js',
            createRegistration(['order/shared.js'], () => ({
                setters: [() => undefined],
                execute() {
                    order.push('left')
                }
            }))
        ],
        [
            'order/right.js',
            createRegistration(['order/shared.js'], () => ({
                setters: [() => undefined],
                execute() {
                    order.push('right')
                }
            }))
        ],
        [
            'order/root.js',
            createRegistration(['order/left.js', 'order/right.js'], (exportBinding) => ({
                setters: [() => undefined, () => undefined],
                execute() {
                    order.push('root')
                    exportBinding('ready', true)
                }
            }))
        ]
    ])
    system.instantiate = (id) => {
        instantiations.set(id, (instantiations.get(id) ?? 0) + 1)
        return requireRegistration(registrations, id)
    }

    const root = system.importSync('order/root.js')

    assert.equal(root.ready, true)
    assert.deepEqual(order, ['shared', 'left', 'right', 'root'])
    assert.deepEqual(Object.fromEntries(instantiations), {
        'order/shared.js': 1,
        'order/left.js': 1,
        'order/right.js': 1,
        'order/root.js': 1
    })
})

test('propagates live bindings through a reexport chain', () => {
    let increment = () => undefined
    let rootSetterCalls = 0
    const registrations = new Map<string, System.Registration>([
        [
            'bindings/state.js',
            createRegistration([], (exportBinding) => ({
                execute() {
                    let count = 1
                    increment = () => {
                        exportBinding('count', ++count)
                    }
                    exportBinding({ count, increment })
                }
            }))
        ],
        [
            'bindings/reexport.js',
            createRegistration(['bindings/state.js'], (exportBinding) => ({
                setters: [
                    (state) => {
                        exportBinding('count', state.count)
                    }
                ]
            }))
        ],
        [
            'bindings/root.js',
            createRegistration(['bindings/reexport.js'], (exportBinding) => {
                let count: unknown
                return {
                    setters: [
                        (reexport) => {
                            rootSetterCalls++
                            count = reexport.count
                        }
                    ],
                    execute() {
                        exportBinding('read', () => count)
                    }
                }
            })
        ]
    ])
    installRegistrations(registrations)

    const root = system.importSync('bindings/root.js')
    const read = root.read as () => unknown
    assert.equal(read(), 1)
    increment()
    assert.equal(read(), 2)
    assert.equal(rootSetterCalls, 2)
})

test('links declaration-time exports through circular dependencies', () => {
    const registrations = new Map<string, System.Registration>([
        [
            'cycle/a.js',
            createRegistration(['cycle/b.js'], (exportBinding) => {
                exportBinding('name', 'a')
                let dependency: unknown
                return {
                    setters: [(module) => (dependency = module.name)],
                    execute() {
                        exportBinding('dependency', dependency)
                    }
                }
            })
        ],
        [
            'cycle/b.js',
            createRegistration(['cycle/a.js'], (exportBinding) => {
                exportBinding('name', 'b')
                let dependency: unknown
                return {
                    setters: [(module) => (dependency = module.name)],
                    execute() {
                        exportBinding('dependency', dependency)
                    }
                }
            })
        ]
    ])
    installRegistrations(registrations)

    const a = system.importSync('cycle/a.js')
    const b = system.importSync('cycle/b.js')

    assert.equal(a.dependency, 'b')
    assert.equal(b.dependency, 'a')
})

test('shares namespace and execution identity between import modes', async () => {
    const executions = new Map<string, number>()
    const registrations = new Map<string, System.Registration>([
        [
            'identity/sync-first.js',
            createRegistration([], (exportBinding) => ({
                execute() {
                    executions.set('sync-first', (executions.get('sync-first') ?? 0) + 1)
                    exportBinding('value', 1)
                }
            }))
        ],
        [
            'identity/async-first.js',
            createRegistration([], (exportBinding) => ({
                execute() {
                    executions.set('async-first', (executions.get('async-first') ?? 0) + 1)
                    exportBinding('value', 2)
                }
            }))
        ]
    ])
    installRegistrations(registrations)

    const syncFirst = system.importSync('identity/sync-first.js')
    const syncFirstPromise = system.import('identity/sync-first.js')
    assert.ok(syncFirstPromise instanceof Promise)
    assert.strictEqual(await syncFirstPromise, syncFirst)
    assert.strictEqual(system.importSync('identity/sync-first.js'), syncFirst)

    const asyncFirst = await system.import('identity/async-first.js')
    assert.strictEqual(system.importSync('identity/async-first.js'), asyncFirst)
    assert.deepEqual(Object.fromEntries(executions), { 'sync-first': 1, 'async-first': 1 })
})

test('deduplicates concurrent asynchronous instantiation and execution', async () => {
    let instantiations = 0
    let executions = 0
    const registration = createRegistration([], (exportBinding) => ({
        execute() {
            executions++
            exportBinding('value', 42)
        }
    }))
    system.instantiate = () => {
        instantiations++
        return Promise.resolve(registration)
    }

    const [first, second] = await Promise.all([
        system.import('concurrent/entry.js'),
        system.import('concurrent/entry.js')
    ])

    assert.strictEqual(first, second)
    assert.equal(instantiations, 1)
    assert.equal(executions, 1)
})

test('loads asynchronous transport dependencies before their importers', async () => {
    const order: string[] = []
    const registrations = new Map<string, System.Registration>([
        [
            'transport/dependency.js',
            createRegistration([], (exportBinding) => ({
                execute() {
                    order.push('dependency')
                    exportBinding('value', 42)
                }
            }))
        ],
        [
            'transport/root.js',
            createRegistration(['transport/dependency.js'], (exportBinding) => {
                let value: unknown
                return {
                    setters: [(dependency) => (value = dependency.value)],
                    execute() {
                        order.push('root')
                        exportBinding('value', value)
                    }
                }
            })
        ]
    ])
    system.instantiate = (id) => {
        const registration = requireRegistration(registrations, id)
        return id === 'transport/dependency.js' ? Promise.resolve(registration) : registration
    }

    const root = await system.import('transport/root.js')

    assert.equal(root.value, 42)
    assert.deepEqual(order, ['dependency', 'root'])
})

test('waits for dependency top-level await before executing importers', async () => {
    const order: string[] = []
    const registrations = new Map<string, System.Registration>([
        [
            'tla/dependency.js',
            createRegistration([], (exportBinding) => ({
                async execute() {
                    order.push('dependency:start')
                    await Promise.resolve()
                    exportBinding('value', 42)
                    order.push('dependency:end')
                }
            }))
        ],
        [
            'tla/root.js',
            createRegistration(['tla/dependency.js'], (exportBinding) => {
                let value: unknown
                return {
                    setters: [(dependency) => (value = dependency.value)],
                    execute() {
                        order.push('root')
                        exportBinding('value', value)
                    }
                }
            })
        ]
    ])
    installRegistrations(registrations)

    const root = await system.import('tla/root.js')

    assert.equal(root.value, 42)
    assert.deepEqual(order, ['dependency:start', 'dependency:end', 'root'])
})

test('keeps dynamic imports asynchronous and exposes canonical import.meta IDs', async () => {
    const registrations = new Map<string, System.Registration>([
        [
            'context/entry.js',
            createRegistration([], (exportBinding, context) => ({
                execute() {
                    exportBinding({
                        load: () => context.import('context/lazy.js'),
                        url: context.meta.url
                    })
                }
            }))
        ],
        [
            'context/lazy.js',
            createRegistration([], (exportBinding) => ({
                execute() {
                    exportBinding('value', 42)
                }
            }))
        ]
    ])
    installRegistrations(registrations)

    const entry = system.importSync('context/entry.js')
    const lazyPromise = (entry.load as () => Promise<System.Module>)()
    assert.ok(lazyPromise instanceof Promise)
    const lazy = await lazyPromise

    assert.equal(entry.url, 'context/entry.js')
    assert.equal(lazy.value, 42)
})

test('executes the asynchronous fallback for declarations without execute', async () => {
    installRegistrations(new Map([['declaration/async-empty.js', createRegistration([], () => ({ setters: [] }))]]))

    assert.deepEqual(Object.keys(await system.import('declaration/async-empty.js')), [])
})

test('forwards object-form import metadata to transport', async () => {
    const loaderWithMetadata = system as System.Loader & {
        import(id: string, meta: Readonly<Record<string, unknown>>): Promise<System.Module>
        instantiate(id: string, parentId?: string, meta?: unknown): System.Registration
    }
    const metadata = { source: 'test' }
    // This mutable observation captures the metadata argument crossing the public import boundary.
    let receivedMeta: unknown
    loaderWithMetadata.instantiate = (_id: string, _parentId?: string, meta?: unknown) => {
        receivedMeta = meta
        return createRegistration([], (exportBinding) => ({
            execute() {
                exportBinding({ value: 1 })
                exportBinding({ value: 1 })
            }
        }))
    }

    const module = await loaderWithMetadata.import('metadata/entry.js', metadata)

    assert.strictEqual(receivedMeta, metadata)
    assert.equal(module.value, 1)
})

test('supports empty declarations and non-enumerable __esModule exports', () => {
    const registrations = new Map<string, System.Registration>([
        ['declaration/empty.js', createRegistration([], () => ({}))],
        [
            'declaration/commonjs.js',
            createRegistration([], (exportBinding) => ({
                execute() {
                    const bindings: Record<string, unknown> = { default: 'value' }
                    Object.defineProperty(bindings, '__esModule', { value: true })
                    exportBinding(bindings)
                }
            }))
        ]
    ])
    installRegistrations(registrations)

    assert.deepEqual(Object.keys(system.importSync('declaration/empty.js')), [])
    const commonjs = system.importSync('declaration/commonjs.js')
    assert.equal(commonjs.default, 'value')
    assert.equal(commonjs.__esModule, true)
})

test('links circular dependencies delivered through asynchronous transport', async () => {
    const registrations = new Map<string, System.Registration>([
        [
            'async-cycle/a.js',
            createRegistration(['async-cycle/b.js'], (exportBinding) => {
                exportBinding('name', 'a')
                let dependency: unknown
                return {
                    setters: [(module) => (dependency = module.name)],
                    execute() {
                        exportBinding('dependency', dependency)
                    }
                }
            })
        ],
        [
            'async-cycle/b.js',
            createRegistration(['async-cycle/a.js'], (exportBinding) => {
                exportBinding('name', 'b')
                let dependency: unknown
                return {
                    setters: [(module) => (dependency = module.name)],
                    execute() {
                        exportBinding('dependency', dependency)
                    }
                }
            })
        ]
    ])
    system.instantiate = (id) => Promise.resolve(requireRegistration(registrations, id))

    const a = await system.import('async-cycle/a.js')
    const b = await system.import('async-cycle/b.js')

    assert.equal(a.dependency, 'b')
    assert.equal(b.dependency, 'a')
})

test('caches asynchronous transport rejection on the failed load', async () => {
    const failure = new Error('asynchronous transport rejected')
    // This mutable count proves the rejected transport is retained by the shared registry.
    let instantiations = 0
    system.instantiate = () => {
        instantiations++
        return Promise.reject(failure)
    }

    await assert.rejects(system.import('async-transport-error/entry.js'), (error) => error === failure)
    await assert.rejects(system.import('async-transport-error/entry.js'), (error) => error === failure)
    assert.equal(instantiations, 1)
})

test('caches asynchronous execution failures without executing importers', async () => {
    const failure = new Error('asynchronous execution failed')
    let dependencyExecutions = 0
    let rootExecutions = 0
    installRegistrations(
        new Map([
            [
                'async-error/dependency.js',
                createRegistration([], () => ({
                    async execute() {
                        dependencyExecutions++
                        await Promise.resolve()
                        throw failure
                    }
                }))
            ],
            [
                'async-error/root.js',
                createRegistration(['async-error/dependency.js'], () => ({
                    setters: [() => undefined],
                    execute() {
                        rootExecutions++
                    }
                }))
            ]
        ])
    )

    await assert.rejects(system.import('async-error/root.js'), (error) => error === failure)
    await assert.rejects(system.import('async-error/root.js'), (error) => error === failure)
    assert.equal(dependencyExecutions, 1)
    assert.equal(rootExecutions, 0)
})

test('throws immediately for asynchronous root and dependency transport', () => {
    const registration = createRegistration([], () => ({ execute() {} }))
    const thenableRegistration: PromiseLike<System.Registration> = {
        // biome-ignore lint/suspicious/noThenProperty: custom thenables are part of the transport contract.
        then(onfulfilled, onrejected) {
            return Promise.resolve(registration).then(onfulfilled, onrejected)
        }
    }
    system.instantiate = () => thenableRegistration
    assert.throws(() => system.importSync('async-transport/root.js'), /module graph is asynchronous/)

    let rootExecutions = 0
    const registrations = new Map<string, System.Registration>([
        ['async-transport/dependency.js', registration],
        [
            'async-transport/deep-root.js',
            createRegistration(['async-transport/dependency.js'], () => ({
                setters: [() => undefined],
                execute() {
                    rootExecutions++
                }
            }))
        ]
    ])
    system.instantiate = (id) => {
        const resolved = requireRegistration(registrations, id)
        return id === 'async-transport/dependency.js' ? Promise.resolve(resolved) : resolved
    }

    assert.throws(() => system.importSync('async-transport/deep-root.js'), /module graph is asynchronous/)
    assert.equal(rootExecutions, 0)
})

test('rejects synchronous access while the shared module is executing asynchronously', async () => {
    const execution = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    installRegistrations(
        new Map([
            [
                'async-execution/in-flight.js',
                createRegistration([], () => ({
                    execute() {
                        started.resolve()
                        return execution.promise
                    }
                }))
            ]
        ])
    )

    const loading = system.import('async-execution/in-flight.js')
    await started.promise
    assert.throws(() => system.importSync('async-execution/in-flight.js'), /module graph is asynchronous/)
    execution.resolve()
    await loading
})

test('throws immediately for asynchronous root and dependency execution', () => {
    installRegistrations(
        new Map([
            [
                'async-execution/root.js',
                createRegistration([], () => ({
                    execute() {
                        return Promise.resolve()
                    }
                }))
            ]
        ])
    )
    assert.throws(() => system.importSync('async-execution/root.js'), /module graph is asynchronous/)

    let rootExecutions = 0
    installRegistrations(
        new Map([
            [
                'async-execution/dependency.js',
                createRegistration([], () => ({
                    execute() {
                        return Promise.resolve()
                    }
                }))
            ],
            [
                'async-execution/deep-root.js',
                createRegistration(['async-execution/dependency.js'], () => ({
                    setters: [() => undefined],
                    execute() {
                        rootExecutions++
                    }
                }))
            ]
        ])
    )

    assert.throws(() => system.importSync('async-execution/deep-root.js'), /module graph is asynchronous/)
    assert.equal(rootExecutions, 0)
})

test('reports missing registrations with a local diagnostic', async () => {
    // The public hook type excludes malformed transport results; this test deliberately exercises the runtime diagnostic.
    // @ts-expect-error: undefined is the missing-registration condition under test.
    system.instantiate = () => undefined

    assert.throws(() => system.importSync('missing/sync.js'), {
        name: 'Error',
        message: 'Module did not instantiate: missing/sync.js'
    })
    await assert.rejects(system.import('missing/async.js'), {
        name: 'Error',
        message: 'Module did not instantiate: missing/async.js'
    })
})

test('prevents a synchronous importer from executing after its dependency throws', () => {
    const failure = new Error('dependency execution failed')
    // This mutable count proves execution stops before entering the importer.
    let rootExecutions = 0
    installRegistrations(
        new Map([
            [
                'sync-dependency-error/dependency.js',
                createRegistration([], () => ({
                    execute() {
                        throw failure
                    }
                }))
            ],
            [
                'sync-dependency-error/root.js',
                createRegistration(['sync-dependency-error/dependency.js'], () => ({
                    setters: [() => undefined],
                    execute() {
                        rootExecutions++
                    }
                }))
            ]
        ])
    )

    assert.throws(
        () => system.importSync('sync-dependency-error/root.js'),
        (error) => error === failure
    )
    assert.equal(rootExecutions, 0)
})

test('caches synchronous execution failures in the shared registry', () => {
    const failure = new Error('execution failed')
    let executions = 0
    installRegistrations(
        new Map([
            [
                'error/entry.js',
                createRegistration([], () => ({
                    execute() {
                        executions++
                        throw failure
                    }
                }))
            ]
        ])
    )

    assert.throws(
        () => system.importSync('error/entry.js'),
        (error) => error === failure
    )
    assert.throws(
        () => system.importSync('error/entry.js'),
        (error) => error === failure
    )
    assert.equal(executions, 1)
})

test('propagates transport and declaration failures synchronously', () => {
    const transportFailure = new Error('transport failed')
    system.instantiate = () => {
        throw transportFailure
    }
    assert.throws(
        () => system.importSync('failure/transport.js'),
        (error) => error === transportFailure
    )

    const declarationFailure = new Error('declaration failed')
    installRegistrations(
        new Map([
            [
                'failure/declaration.js',
                createRegistration([], () => {
                    throw declarationFailure
                })
            ]
        ])
    )
    assert.throws(
        () => system.importSync('failure/declaration.js'),
        (error) => error === declarationFailure
    )
})
