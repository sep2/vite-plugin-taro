// biome-ignore-start lint: vendored SystemJS core

/*
 * SystemJS Core
 *
 * Provides
 * - System.import and System.importSync
 * - System.register support for
 *     live bindings, function hoisting through circular references,
 *     reexports, dynamic import, import.meta.url, top-level await
 * - System.getRegister to get the registration
 * - Symbol.toStringTag support in Module objects
 * - Hookable System.createContext to customize import.meta
 *
 * Core comes with no System.prototype.resolve or
 * System.prototype.instantiate implementations
 */
var envGlobal = global
var hasSymbol = typeof Symbol !== 'undefined'

function createMissingRegistrationError(id) {
    return Error('Module did not instantiate: ' + id)
}

export { REGISTRY, systemJSPrototype }

var toStringTag = hasSymbol && Symbol.toStringTag
var REGISTRY = hasSymbol ? Symbol() : '@'

function SystemJS() {
    this[REGISTRY] = {}
}

var systemJSPrototype = SystemJS.prototype

systemJSPrototype.import = function (id, parentId, meta) {
    var loader = this
    if (parentId && typeof parentId === 'object') meta = parentId
    var load = getOrCreateLoad(loader, id, undefined, meta)
    return Promise.resolve(load.C || topLevelLoad(loader, load))
}

/**
 * Instantiates, links, and evaluates a graph without yielding the current JavaScript turn.
 *
 * WX placement guarantees that every registration in a synchronous graph uses the main-package transport. Encountering
 * a thenable therefore indicates a fatal placement invariant violation. No rollback is attempted: rows already published
 * to the shared registry remain there and the current runtime heap must not be reused.
 */
systemJSPrototype.importSync = function (id) {
    var loader = this
    var load = linkLoadSync(loader, id)
    var execution = postOrderExec(loader, load, {})
    if (isThenable(execution)) throw createAsyncGraphError(id)

    // Share completion and namespace identity with normal System.import calls.
    load.C = load.n
    return load.n
}

// Hookable createContext function -> allowing eg custom import meta
systemJSPrototype.createContext = function (parentId) {
    return { url: parentId }
}

/** Publishes one synchronous row before linking dependencies so cycles observe the same live namespace. */
function linkLoadSync(loader, id) {
    var existing = loader[REGISTRY][id]
    if (existing) return existing

    var registration = loader.instantiate(id)
    if (isThenable(registration)) throw createAsyncGraphError(id)
    if (!registration) throw createMissingRegistrationError(id)

    // This row is intentionally mutable SystemJS-owned linking and execution state.
    var load = {
        id: id,
        i: [],
        n: createModuleNamespace(),
        h: false,
        d: undefined,
        e: undefined,
        C: undefined
    }
    loader[REGISTRY][id] = load

    var declared = registration[1](
        createExport(load),
        registration[1].length === 2 ? createDeclarationContext(loader, id) : undefined
    )
    load.e = declared.execute || function () {}
    var setters = declared.setters || []
    load.d = registration[0].map(function (dependency, index) {
        var dependencyLoad = linkLoadSync(loader, dependency)
        var setter = setters[index]
        if (setter) {
            dependencyLoad.i.push(setter)
            if (dependencyLoad.h || dependencyLoad.C === dependencyLoad.n) setter(dependencyLoad.n)
        }
        return dependencyLoad
    })
    return load
}

/** Supplies dynamic import and import.meta using the canonical IDs emitted at build time. */
function createDeclarationContext(loader, id) {
    return {
        import: function (dependency, meta) {
            return loader.import(dependency, undefined, meta)
        },
        meta: loader.createContext(id)
    }
}

/** Creates a live module namespace shared by both completion policies. */
function createModuleNamespace() {
    var namespace = Object.create(null)
    if (toStringTag) Object.defineProperty(namespace, toStringTag, { value: 'Module' })
    return namespace
}

/** Creates the shared live-binding publisher used by synchronous and asynchronous load records. */
function createExport(load) {
    return function (name, value) {
        load.h = true
        // This flag coalesces object-form exports into one importer notification pass.
        var changed = false
        if (typeof name === 'string') {
            if (!(name in load.n) || load.n[name] !== value) {
                load.n[name] = value
                changed = true
            }
        } else {
            for (var property in name) {
                var propertyValue = name[property]
                if (!(property in load.n) || load.n[property] !== propertyValue) {
                    load.n[property] = propertyValue
                    changed = true
                }
            }
            if (name && name.__esModule) load.n.__esModule = name.__esModule
        }
        if (changed) {
            for (var i = 0; i < load.i.length; i++) {
                var setter = load.i[i]
                if (setter) setter(load.n)
            }
        }
        return value
    }
}

/** Accepts cross-realm and custom thenables rather than only native Promises. */
function isThenable(value) {
    return (
        value !== null && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function'
    )
}

function createAsyncGraphError(id) {
    return Error('Cannot synchronously import ' + id + ': module graph is asynchronous')
}

var lastRegister
systemJSPrototype.register = function (deps, declare, metas) {
    lastRegister = [deps, declare, metas]
}

/*
 * getRegister provides the last anonymous System.register call
 */
systemJSPrototype.getRegister = function () {
    var _lastRegister = lastRegister
    lastRegister = undefined
    return _lastRegister
}

export function getOrCreateLoad(loader, id, firstParentUrl, meta) {
    var load = loader[REGISTRY][id]
    if (load) return load

    var importerSetters = []
    var ns = createModuleNamespace()

    var instantiatePromise = Promise.resolve()
        .then(function () {
            return loader.instantiate(id, firstParentUrl, meta)
        })
        .then(
            function (registration) {
                if (!registration) throw createMissingRegistrationError(id)
                var declared = registration[1](
                    createExport(load),
                    registration[1].length === 2 ? createDeclarationContext(loader, id) : undefined
                )
                load.e = declared.execute || function () {}
                return [registration[0], declared.setters || [], registration[2] || []]
            },
            function (err) {
                load.e = null
                load.er = err
                throw err
            }
        )

    var linkPromise = instantiatePromise.then(function (instantiation) {
        return Promise.all(
            instantiation[0].map(function (dep, i) {
                var setter = instantiation[1][i]
                var meta = instantiation[2][i]
                var depLoad = getOrCreateLoad(loader, dep, id, meta)
                // depLoad.I may be undefined for already-evaluated
                return Promise.resolve(depLoad.I).then(function () {
                    if (setter) {
                        depLoad.i.push(setter)
                        // only run early setters when there are hoisted exports of that module
                        // the timing works here as pending hoisted export calls will trigger through importerSetters
                        if (depLoad.h || !depLoad.I) setter(depLoad.n)
                    }
                    return depLoad
                })
            })
        ).then(function (depLoads) {
            load.d = depLoads
        })
    })

    // Capital letter = a promise function
    return (load = loader[REGISTRY][id] =
        {
            id: id,
            // importerSetters, the setters functions registered to this dependency
            // we retain this to add more later
            i: importerSetters,
            // module namespace object
            n: ns,
            // extra module information for import assertion
            // shape like: { assert: { type: 'xyz' } }
            m: meta,

            // instantiate
            I: instantiatePromise,
            // link
            L: linkPromise,
            // whether it has hoisted exports
            h: false,

            // On instantiate completion we have populated:
            // dependency load records
            d: undefined,
            // execution function
            e: undefined,

            // On execution we have populated:
            // the execution error if any
            er: undefined,
            // in the case of TLA, the execution promise
            E: undefined,

            // On execution, L, I, E cleared

            // Promise for top-level completion
            C: undefined,

            // parent instantiator / executor
            p: undefined
        })
}

function instantiateAll(loader, load, parent, loaded) {
    if (!loaded[load.id]) {
        loaded[load.id] = true
        // load.L may be undefined for already-instantiated
        return Promise.resolve(load.L)
            .then(function () {
                if (!load.p || load.p.e === null) load.p = parent
                return Promise.all(
                    load.d.map(function (dep) {
                        return instantiateAll(loader, dep, parent, loaded)
                    })
                )
            })
            .catch(function (err) {
                if (load.er) throw err
                load.e = null
                throw err
            })
    }
}

function topLevelLoad(loader, load) {
    return (load.C = instantiateAll(loader, load, load, {})
        .then(function () {
            return postOrderExec(loader, load, {})
        })
        .then(function () {
            return load.n
        }))
}

// the closest we can get to call(undefined)
var nullContext = Object.freeze(Object.create(null))

// returns a promise if and only if a top-level await subgraph
// throws on sync errors
function postOrderExec(loader, load, seen) {
    if (seen[load.id]) return
    seen[load.id] = true

    if (!load.e) {
        if (load.er) throw load.er
        if (load.E) return load.E
        return
    }

    // From here we're about to execute the load.
    // Because the execution may be async, we pop the `load.e` first.
    // So `load.e === null` always means the load has been executed or is executing.
    // To inspect the state:
    // - If `load.er` is truthy, the execution has threw or has been rejected;
    // - otherwise, either the `load.E` is a promise, means it's under async execution, or
    // - the `load.E` is null, means the load has completed the execution or has been async resolved.
    var exec = load.e
    load.e = null

    // deps execute first, unless circular
    var depLoadPromises
    load.d.forEach(function (depLoad) {
        try {
            var depLoadPromise = postOrderExec(loader, depLoad, seen)
            if (depLoadPromise) (depLoadPromises = depLoadPromises || []).push(depLoadPromise)
        } catch (err) {
            load.er = err
            throw err
        }
    })
    if (depLoadPromises) return Promise.all(depLoadPromises).then(doExec)

    return doExec()

    function doExec() {
        try {
            var execPromise = exec.call(nullContext)
            if (execPromise) {
                execPromise = execPromise.then(
                    function () {
                        load.C = load.n
                        load.E = null // indicates completion
                    },
                    function (err) {
                        load.er = err
                        load.E = null
                        throw err
                    }
                )
                return (load.E = execPromise)
            }
            // (should be a promise, but a minify optimization to leave out Promise.resolve)
            load.C = load.n
            load.L = load.I = undefined
        } catch (err) {
            load.er = err
            throw err
        }
    }
}

envGlobal.System = new SystemJS()

// biome-ignore-end lint: vendored SystemJS core
