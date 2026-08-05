import 'systemjs/dist/s.js'

/**
 * Adds synchronous completion without replacing the SystemJS loader.
 *
 * The build-time transform exposes the installed registry and the existing post-order evaluator. This module supplies
 * only the missing synchronous instantiation/linking phase, writes compatible rows into that same registry, and delegates
 * evaluation back to SystemJS. Successful `import()` and `importSync()` calls therefore share namespace identity, live
 * bindings, and execution state.
 *
 * This API is intentionally restricted to eager main-package graphs. Every unresolved registration and execute function
 * in the static closure must complete synchronously. Encountering a thenable throws immediately and performs no rollback
 * or async conversion. If the violation occurs below rows already linked by this call, those partial rows remain in the
 * registry; treat that as a fatal placement invariant failure and replace the runtime heap rather than retrying an import.
 */

type MutableModule = Record<string, unknown>
type Execute = () => void | PromiseLike<void>

/**
 * The subset of a SystemJS 6.15.1 load record read or initialized by the synchronous linker.
 * `postOrderExec` may add its normal private error, TLA, and phase fields while evaluating this object.
 */
interface SystemLoad {
    /** Canonical registry key and evaluator cycle identity. */
    readonly id: string
    /** Setters owned by modules importing this namespace. */
    readonly i: System.Setter[]
    /** Stable, null-prototype live module namespace. */
    readonly n: MutableModule
    /** Whether declaration-time exports are available to circular importers. */
    h: boolean
    /** Resolved dependency rows in source dependency order. */
    d: SystemLoad[] | undefined
    /** Module evaluator, or `null` after execution starts. */
    e: Execute | null | undefined
    /** Namespace on completion, or a Promise when normal import owns asynchronous completion. */
    C: System.Module | PromiseLike<System.Module> | undefined
}

/** The complete private bridge inserted by the Oxc transform. */
interface SystemJsInternals {
    /** The actual registry closed over by stock `System.import()`. */
    readonly registry: Record<string, SystemLoad>
    /** The original dependency-first evaluator; a returned thenable means execution is asynchronous. */
    readonly postOrderExec: (
        loader: PatchableLoader,
        load: SystemLoad,
        seen: Record<string, boolean>
    ) => void | PromiseLike<void>
}

/** Stock loader plus the bridge injected before this module executes. */
type PatchableLoader = System.Loader & {
    readonly __vptInternals?: SystemJsInternals
}

// WeChat installs SystemJS on its explicit App-service `global`, not on lexical `globalThis`.
const installedSystem = (global as unknown as { System?: PatchableLoader }).System
if (!installedSystem?.__vptInternals) {
    throw new Error('The patched SystemJS core was not installed')
}

const internals = installedSystem.__vptInternals
// This method changes completion policy only; the installed loader continues to own all module state.
installedSystem.importSync = (id, parentId) => importSync(installedSystem, internals, id, parentId)

/** Resolves, links, and evaluates one graph in the current JavaScript turn. */
function importSync(
    loader: PatchableLoader,
    systemInternals: SystemJsInternals,
    specifier: string,
    parentId: string | undefined
): System.Module {
    const id = loader.resolve(specifier, parentId)
    const load = linkLoadSync(loader, systemInternals, id)

    // Reuse upstream execution ordering, cycle handling, export propagation, and TLA detection unchanged.
    const execution = systemInternals.postOrderExec(loader, load, {})
    if (isThenable(execution)) {
        throw createAsyncGraphError(id)
    }

    // Stock `System.import()` checks `C` first, so this preserves execution and namespace identity across import modes.
    load.C = load.n
    return load.n
}

/**
 * Instantiates and links one registration while preserving declaration-time exports through cycles.
 * A new row enters the shared registry before its declaration and dependencies are traversed, matching upstream's
 * cycle-visible namespace ordering.
 */
function linkLoadSync(loader: PatchableLoader, systemInternals: SystemJsInternals, id: string): SystemLoad {
    const existing = systemInternals.registry[id]
    if (existing) {
        // Synchronous linking cannot interleave. An incomplete row is therefore a cycle from this traversal; retrying
        // after a previous invariant failure is explicitly unsupported.
        return existing
    }

    // Main-package transport returns a registration tuple directly; generated subpackages return thenables and fail here.
    const registration = loader.instantiate(id)
    if (isThenable(registration)) {
        throw createAsyncGraphError(id)
    }

    const load = createLoad(id)
    // Publish before declaration so a dependency back-edge resolves this exact namespace and its hoisted exports.
    systemInternals.registry[id] = load

    // Dynamic imports remain normal asynchronous SystemJS imports rooted at the current canonical module ID.
    const declaration = registration[1](createExportBinding(load), {
        import: (dependency) => loader.import(dependency, id),
        meta: loader.createContext(id)
    })
    load.e = declaration.execute ?? (() => undefined)

    const setters = declaration.setters ?? []
    load.d = registration[0].map((dependency, index) => {
        const dependencyLoad = linkLoadSync(loader, systemInternals, loader.resolve(dependency, id))
        const setter = setters[index]
        if (setter) {
            dependencyLoad.i.push(setter)
            // Match upstream linking: hoisted exports and completed dependencies initialize the importer immediately.
            if (dependencyLoad.h || dependencyLoad.C === dependencyLoad.n) {
                setter(dependencyLoad.n)
            }
        }
        return dependencyLoad
    })
    return load
}

/** Creates the fields required by synchronous linking and the upstream evaluator. */
function createLoad(id: string): SystemLoad {
    const namespace: MutableModule = Object.create(null)

    // These fields become mutable SystemJS-owned state immediately after registry insertion.
    return {
        id,
        i: [],
        n: namespace,
        h: false,
        d: undefined,
        e: undefined,
        C: undefined
    }
}

/** Implements the live `_export` callback supplied to each `System.register` declaration. */
function createExportBinding(load: SystemLoad): System.Export {
    return (name, value) => {
        load.h = true
        // Coalesce object-form exports into one importer notification pass.
        let changed = false
        const bindings = typeof name === 'string' ? { [name]: value } : name

        for (const [exportName, exportValue] of Object.entries(bindings)) {
            if (!(exportName in load.n) || load.n[exportName] !== exportValue) {
                load.n[exportName] = exportValue
                changed = true
            }
        }
        if (typeof name !== 'string' && name.__esModule) {
            load.n.__esModule = name.__esModule
        }
        if (changed) {
            for (const setter of load.i) {
                setter(load.n)
            }
        }
        return value
    }
}

/** Uses structural detection because transport and execute hooks may return arbitrary Promise-like objects. */
function isThenable(value: unknown): value is PromiseLike<unknown> {
    return (
        (typeof value === 'object' || typeof value === 'function') &&
        value !== null &&
        'then' in value &&
        typeof value.then === 'function'
    )
}

/** Reports the canonical module whose phase cannot complete synchronously. */
function createAsyncGraphError(id: string): Error {
    return new Error(`Cannot synchronously import ${id}: module graph is asynchronous`)
}
