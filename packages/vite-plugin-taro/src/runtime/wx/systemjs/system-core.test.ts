import assert from 'node:assert/strict'
import test from 'node:test'
import './system-core.js'

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
