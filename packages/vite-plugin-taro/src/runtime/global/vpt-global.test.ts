import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { isNativeError } from 'node:util/types'
import { constants, createContext, Script } from 'node:vm'

const filename = fileURLToPath(new URL('./vpt-global.ts', import.meta.url))
const moduleSource = stripTypeScriptTypes(await readFile(filename, 'utf8'))
// ESM is strict. Replace its first comment, after erased types, without shifting any runtime source offsets.
const runtimeScript = new Script(
    moduleSource
        .replace(/^export /gm, '       ')
        .replace(/^\/\/[^\n]*/m, (comment) => '"use strict";'.padEnd(comment.length)),
    { filename }
)

function createHeap(setup: string) {
    const context = createContext(constants.DONT_CONTEXTIFY, { codeGeneration: { strings: false, wasm: false } })
    context.assert = assert
    new Script(setup).runInContext(context)
    return context
}

function assertDiscoveryFallback(context: ReturnType<typeof createHeap>, cacheKey: string | symbol): unknown {
    // Capture diagnostics only in this isolated heap, without changing the test runner's console.
    const errors: unknown[][] = []
    context.console = { error: (...args: unknown[]) => errors.push(args) }
    context.cacheKey = cacheKey
    runtimeScript.runInContext(context)
    const fallback: unknown = new Script('vptGlobal').runInContext(context)
    assert.ok(fallback && typeof fallback === 'object')
    assert.deepEqual(Reflect.ownKeys(fallback), ['Object', 'globalThis'])
    assert.equal(errors.length, 1)
    const [message, cause] = errors[0]
    assert.equal(message, 'Unable to resolve globalThis')
    new Script(`
        assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false);
        assert.notEqual(vptGlobal, this);
        assert.equal(Object.getPrototypeOf(vptGlobal), Object.prototype);
        assert.equal(vptGlobal.Object, Object);
        assert.equal(vptGlobal.globalThis, vptGlobal);
        assert.equal(typeof globalThis, 'undefined');
        assert.equal(vptGlobal.Math, undefined);
        assert.deepEqual(Object.getOwnPropertyDescriptor(Object, cacheKey), {
            value: vptGlobal,
            writable: false,
            enumerable: false,
            configurable: false
        });
        // A fallback is writable, but it does not copy other built-ins or turn its properties into host bindings.
        vptGlobal.fixtureValue = 42;
        assert.equal(getGlobalThis(), vptGlobal);
        assert.equal(getGlobalThis().fixtureValue, 42);
        assert.equal(Object.hasOwn(this, 'fixtureValue'), false);
        assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false);
    `).runInContext(context)
    assert.equal(errors.length, 3, 'Each failed discovery reports its cause, even when the fallback is cached')
    assert.ok(errors.every(([message]) => message === 'Unable to resolve globalThis'))
    return cause
}

test('exports only one shared native object across repeated ESM imports', async () => {
    const url = `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
    const before = Object.getOwnPropertyDescriptor(globalThis, 'globalThis')
    const first: Record<string, unknown> = await import(url)
    const repeated: Record<string, unknown> = await import(url)
    assert.equal(first, repeated)
    assert.deepEqual(Object.keys(first), ['vptGlobal'])
    assert.equal(first.vptGlobal, globalThis)
    assert.equal(repeated.vptGlobal, first.vptGlobal)
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'globalThis'), before)
    assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false)
})

test('prefers native globalThis without probing fallbacks or modifying a frozen prototype', () => {
    const context = createHeap(`
        Object.defineProperty(this, 'globalThis', { value: this, writable: false, configurable: false });
        for (const name of ['self', 'window']) {
            Object.defineProperty(this, name, { get() { throw new Error('Unexpected ' + name + ' probe'); } });
        }
        Object.freeze(Object.prototype);
    `)
    runtimeScript.runInContext(context)
    new Script('assert.equal(vptGlobal, globalThis); assert.equal(vptGlobal.Math, Math);').runInContext(context)
})

for (const state of ['absent', 'shadowed'] as const) {
    test(`recovers the real host with ${state} globalThis without eval or installing an alias`, () => {
        const context = createHeap(`
            this.host = this;
            ${state === 'absent' ? 'delete this.globalThis;' : "this.globalThis = { marker: 'existing' }; let globalThis;"}
            const descriptor = Object.getOwnPropertyDescriptor(this, 'globalThis');
            const prototypeKeys = Reflect.ownKeys(Object.prototype);
            this.tt = { showToast() { assert.equal(this, tt); return 'toast'; } };
        `)
        runtimeScript.runInContext(context)
        new Script(`
            "use strict";
            assert.equal(vptGlobal, host);
            assert.equal(vptGlobal.Math, Math);
            assert.equal(vptGlobal.Math.max(3, 4), 4);
            assert.equal(vptGlobal.Promise, Promise);
            assert.equal(vptGlobal.tt.showToast(), 'toast');
            assert.equal(typeof globalThis, 'undefined');
            assert.deepEqual(Object.getOwnPropertyDescriptor(host, 'globalThis'), descriptor);
            assert.deepEqual(Reflect.ownKeys(Object.prototype), prototypeKeys);
            assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false);

            // These changes belong only to this realm and prove that the result is the host, not a copied namespace.
            vptGlobal.freeBinding = () => 42;
            assert.equal(freeBinding(), 42);
            freeBinding = () => 43;
            assert.equal(vptGlobal.freeBinding(), 43);
            Object.defineProperty(vptGlobal, 'later', { get() { return freeBinding(); }, configurable: true });
            assert.equal(later, 43);
            delete vptGlobal.later;
            delete vptGlobal.freeBinding;
            assert.equal(typeof later, 'undefined');
            assert.equal(typeof freeBinding, 'undefined');
        `).runInContext(context)
    })
}

test('uses self before window or prototype recovery when native globalThis is null', () => {
    const context = createHeap(`
        this.globalThis = null;
        this.self = this;
        Object.defineProperty(this, 'window', { get() { throw new Error('Unexpected window probe'); } });
        Object.freeze(Object.prototype);
    `)
    runtimeScript.runInContext(context)
    new Script('assert.equal(vptGlobal, this); assert.equal(this.globalThis, null);').runInContext(context)
})

test('uses window before prototype recovery when native globalThis is absent and self is null', () => {
    const context = createHeap(
        'delete this.globalThis; this.self = null; this.window = this; Object.freeze(Object.prototype);'
    )
    runtimeScript.runInContext(context)
    new Script('assert.equal(vptGlobal, this); assert.equal(typeof globalThis, "undefined");').runInContext(context)
})

test('returns an explicit object receiver when native names are unavailable', () => {
    const context = createHeap('')
    runtimeScript.runInContext(context)
    new Script(`
        delete this.globalThis;
        this.self = null;
        this.window = null;
        Object.freeze(Object.prototype);
        const receiver = Object.create(null);
        assert.equal(getGlobalThis.call(receiver), receiver);
    `).runInContext(context)
})

for (const receiver of ['undefined', 'null', '42']) {
    test(`uses prototype recovery when the receiver is ${receiver}`, () => {
        const context = createHeap('delete this.globalThis; this.self = false; this.window = null;')
        runtimeScript.runInContext(context)
        new Script(`
            assert.equal(getGlobalThis.call(${receiver}), this);
            assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false);
        `).runInContext(context)
    })
}

test('the temporary getter retains its self fallback when called without a receiver', () => {
    const context = createHeap(`
        delete this.globalThis;
        const defineProperty = Object.defineProperty;
        // Capture the actual getter locally while still performing its ordinary installation and cleanup.
        let getter;
        Object.defineProperty = (target, key, descriptor) => {
            if (key === '__vpt_global__') { getter = descriptor.get; }
            return defineProperty(target, key, descriptor);
        };
    `)
    runtimeScript.runInContext(context)
    new Script(`
        Object.defineProperty = defineProperty;
        assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false);
        this.self = this;
        assert.equal(getter.call(undefined), this);
    `).runInContext(context)
})

test('strict execution retains a fallback when inherited lookup returns undefined without throwing', () => {
    const context = createHeap(`
        delete this.globalThis;
        this.self = undefined;
        const defineProperty = Object.defineProperty;
        Object.defineProperty = (object, key, descriptor) => {
            if (key === '__vpt_global__') {
                const getter = descriptor.get;
                descriptor.get = () => Reflect.apply(getter, undefined, []);
            }
            return defineProperty(object, key, descriptor);
        };
    `)
    // Record diagnostics only in this deliberately strict heap; native output is tested separately in non-strict mode.
    const errors: unknown[][] = []
    context.console = { error: (...args: unknown[]) => errors.push(args) }
    runtimeScript.runInContext(context)
    new Script(`
        assert.equal(vptGlobal, Object[Symbol.for('vpt.fake.global')]);
        assert.notEqual(vptGlobal, this);
        assert.equal(vptGlobal.globalThis, vptGlobal);
        assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false);
    `).runInContext(context)
    assert.deepEqual(errors, [['Unable to resolve globalThis, might in strict mode']])
})

test('returns a native proxy without inspecting it or touching an existing recovery key', () => {
    const context = createHeap(`
        const native = Proxy.revocable({}, {});
        native.revoke();
        this.globalThis = native.proxy;
        Object.defineProperty(Object.prototype, '__vpt_global__', { value: 'existing' });
        const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, '__vpt_global__');
        for (const name of ['self', 'window']) {
            Object.defineProperty(this, name, { get() { throw new Error('Unexpected ' + name + ' probe'); } });
        }
    `)
    runtimeScript.runInContext(context)
    new Script(`
        assert.equal(vptGlobal, native.proxy);
        assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype, '__vpt_global__'), descriptor);
    `).runInContext(context)
})

for (const name of ['self', 'window']) {
    test(`returns a null-prototype ${name} object as-is rather than recovering the host`, () => {
        const context = createHeap(`
            this.globalThis = false;
            this.self = null;
            this.window = null;
            const candidate = Object.create(null);
            this.${name} = candidate;
            Object.freeze(Object.prototype);
        `)
        runtimeScript.runInContext(context)
        new Script('assert.equal(vptGlobal, candidate); assert.notEqual(vptGlobal, this);').runInContext(context)
    })
}

test('recovers the host receiver through multiple prototype levels without changing its prototype', () => {
    const context = createHeap(`
        delete this.globalThis;
        const prototype = Object.create(Object.getPrototypeOf(this));
        Object.setPrototypeOf(this, prototype);
        const keys = Reflect.ownKeys(Object.prototype);
    `)
    runtimeScript.runInContext(context)
    new Script(`
        assert.equal(vptGlobal, this);
        assert.equal(Object.getPrototypeOf(vptGlobal), prototype);
        assert.deepEqual(Reflect.ownKeys(Object.prototype), keys);
        assert.equal('__vpt_global__' in vptGlobal, false);
    `).runInContext(context)
})

for (const name of ['globalThis', 'self', 'window']) {
    test(`propagates an error from the ${name} probe without starting prototype recovery`, () => {
        const context = createHeap(`
            delete this.globalThis;
            this.self = null;
            this.window = null;
            this.failure = new Error('probe failed');
            Object.defineProperty(this, '${name}', { get() { throw failure; } });
            const keys = Reflect.ownKeys(Object.prototype);
        `)
        assert.throws(
            () => runtimeScript.runInContext(context),
            (error) => error === context.failure
        )
        new Script('assert.deepEqual(Reflect.ownKeys(Object.prototype), keys);').runInContext(context)
    })
}

test('logs an arbitrary lookup cause and removes only the temporary getter', () => {
    const context = createHeap(`
        delete this.globalThis;
        this.failure = { reason: 'host lookup failed' };
        Object.defineProperty(this, '__vpt_global__', { get() { throw failure; }, configurable: true });
        const descriptor = Object.getOwnPropertyDescriptor(this, '__vpt_global__');
    `)
    assert.strictEqual(assertDiscoveryFallback(context, Symbol.for('vpt.fake.global')), context.failure)
    new Script(`
        assert.deepEqual(Object.getOwnPropertyDescriptor(this, '__vpt_global__'), descriptor);
    `).runInContext(context)
})

for (const restriction of ['preventExtensions', 'seal', 'freeze']) {
    test(`returns a shared fallback when Object.${restriction} blocks discovery`, () => {
        const context = createHeap(`delete this.globalThis; Object.${restriction}(Object.prototype);`)
        const cause = assertDiscoveryFallback(context, Symbol.for('vpt.fake.global'))
        assert.ok(isNativeError(cause))
        assert.equal(cause.name, 'TypeError')
    })
}

test('returns a shared fallback and cleans up when the host does not inherit Object.prototype', () => {
    const context = createHeap('delete this.globalThis; Object.setPrototypeOf(this, null);')
    const cause = assertDiscoveryFallback(context, Symbol.for('vpt.fake.global'))
    assert.ok(isNativeError(cause))
    assert.equal(cause.name, 'ReferenceError')
})

for (const setup of ['delete this.Symbol;', 'this.Symbol = undefined;', 'Symbol.for = undefined;']) {
    test(`shares the fallback through a string key when ${setup}`, () => {
        const context = createHeap(`delete this.globalThis; Object.freeze(Object.prototype); ${setup}`)
        const cause = assertDiscoveryFallback(context, 'vpt.fake.global')
        assert.ok(isNativeError(cause))
        assert.equal(cause.name, 'TypeError')
    })
}

test('propagates cache installation failure when the Object constructor is not extensible', () => {
    const context = createHeap('delete this.globalThis; Object.freeze(Object.prototype); Object.freeze(Object);')
    // Suppress only this heap's expected discovery diagnostic; the cache failure itself must remain observable.
    context.console = { error() {} }
    assert.throws(
        () => runtimeScript.runInContext(context),
        (error) => {
            assert.ok(isNativeError(error))
            assert.equal(error.name, 'TypeError')
            return true
        }
    )
    new Script(`
        assert.equal(Object.hasOwn(Object, Symbol.for('vpt.fake.global')), false);
        assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false);
    `).runInContext(context)
})

test('cleans up the temporary getter even when fallback logging throws', () => {
    const context = createHeap(`
        delete this.globalThis;
        const lookupFailure = { reason: 'host lookup failed' };
        this.loggingFailure = new Error('logging failed');
        Object.defineProperty(this, '__vpt_global__', { get() { throw lookupFailure; }, configurable: true });
        const descriptor = Object.getOwnPropertyDescriptor(this, '__vpt_global__');
        this.console = {
            error(message, cause) {
                assert.equal(message, 'Unable to resolve globalThis');
                assert.equal(cause, lookupFailure);
                throw loggingFailure;
            }
        };
    `)
    assert.throws(
        () => runtimeScript.runInContext(context),
        (error) => error === context.loggingFailure
    )
    new Script(`
        assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false);
        assert.deepEqual(Object.getOwnPropertyDescriptor(this, '__vpt_global__'), descriptor);
        assert.equal(Object.hasOwn(Object, Symbol.for('vpt.fake.global')), false);
    `).runInContext(context)
})

for (const outcome of ['return', 'throw'] as const) {
    test(`preserves a native cleanup error when host lookup attempts to ${outcome}`, () => {
        const context = createHeap(`
            delete this.globalThis;
            Object.defineProperty(this, '__vpt_global__', {
                get() {
                    // Restrict only this realm after recovery installs its temporary getter, forcing cleanup to fail.
                    Object.freeze(Object.prototype);
                    ${outcome === 'return' ? 'return this;' : "throw new RangeError('lookup failed');"}
                }
            });
        `)
        assert.throws(
            () => runtimeScript.runInContext(context),
            (error) => {
                assert.ok(isNativeError(error))
                assert.equal(error.name, 'TypeError')
                assert.match(error.message, /Cannot delete property '__vpt_global__'/)
                assert.equal(error.cause, undefined)
                return true
            }
        )
    })
}

// Adapt the old rewriter's behavioral cases to the actual host object, without rewriting any free identifiers.
for (const state of ['native', 'recovered'] as const) {
    const setup = `"use strict"; this.host = this; ${state === 'recovered' ? 'delete this.globalThis;' : ''}`

    test(`${state}: observes live native replacements, future APIs, falsy values and deletion`, () => {
        const context = createHeap(`
            ${setup}
            const nativeMath = Math;
            this.vendorBridge = { value: 1, read() { return this.value; } };
            const originalBridge = vendorBridge;
        `)
        runtimeScript.runInContext(context)
        new Script(`
            "use strict";
            assert.equal(vptGlobal.vendorBridge, originalBridge);
            vendorBridge = { value: 2, read: originalBridge.read };
            assert.equal(vptGlobal.vendorBridge.read(), 2);
            vptGlobal.vendorBridge = originalBridge;
            assert.equal(vendorBridge.read(), 1);

            for (const value of [0, false, '', null, undefined, NaN, 5n]) {
                host.vendorValue = value;
                assert.equal(vptGlobal.vendorValue, value);
                assert.equal('vendorValue' in vptGlobal, true);
                vptGlobal.futureValue = value;
                assert.equal(futureValue, value);
            }

            Math = { max() { return 99; } };
            assert.equal(vptGlobal.Math.max(1, 2), 99);
            vptGlobal.Math = nativeMath;
            assert.equal(Math, nativeMath);
            delete vptGlobal.Math;
            assert.equal(typeof Math, 'undefined');
            assert.equal(vptGlobal.Math, undefined);
            assert.equal('Math' in vptGlobal, false);
            host.Math = nativeMath;
            assert.equal(vptGlobal.Math.max(1, 2), 2);

            vptGlobal.futureApi = () => 42;
            assert.equal(futureApi(), 42);
            delete host.futureApi;
            assert.equal(vptGlobal.futureApi, undefined);
            assert.equal(typeof futureApi, 'undefined');
            assert.throws(() => futureApi, ReferenceError);
        `).runInContext(context)
    })

    test(`${state}: keeps accessor reads lazy and preserves update and short-circuit order`, () => {
        const context = createHeap(`
            ${setup}
            // This realm-local journal and backing value expose duplicate probes, coercions and setter calls.
            const events = [];
            let value = 1;
            Object.defineProperty(this, 'slot', {
                get() { assert.equal(this, host); events.push('get'); return value; },
                set(next) { assert.equal(this, host); events.push(['set', next]); value = next; }
            });
        `)
        runtimeScript.runInContext(context)
        new Script(`
            "use strict";
            assert.deepEqual(events, []);
            vptGlobal.slot = (events.push('rhs'), 2);
            assert.equal(vptGlobal.slot++, 2);
            assert.equal(++vptGlobal.slot, 4);
            assert.equal(vptGlobal.slot += (events.push('rhs'), 3), 7);
            assert.deepEqual(events, [
                'rhs', ['set', 2], 'get', ['set', 3], 'get', ['set', 4], 'get', 'rhs', ['set', 7]
            ]);

            events.length = 0;
            value = 0;
            assert.equal(vptGlobal.slot &&= assert.fail('Unexpected RHS'), 0);
            assert.equal(vptGlobal.slot ??= assert.fail('Unexpected RHS'), 0);
            assert.equal(vptGlobal.slot ||= (events.push('rhs'), 9), 9);
            assert.deepEqual(events, ['get', 'get', 'get', 'rhs', ['set', 9]]);

            events.length = 0;
            value = 5n;
            assert.equal(vptGlobal.slot++, 5n);
            assert.equal(--vptGlobal.slot, 5n);
            assert.deepEqual(events, ['get', ['set', 6n], 'get', ['set', 5n]]);

            events.length = 0;
            value = { [Symbol.toPrimitive](hint) { events.push(hint); return 5; } };
            assert.equal(vptGlobal.slot++, 5);
            assert.deepEqual(events, ['get', 'number', ['set', 6]]);
        `).runInContext(context)
    })

    test(`${state}: does not probe unrelated accessors or wrap their thrown values`, () => {
        const context = createHeap(`
            ${setup}
            const readFailure = new RangeError('read failed');
            const writeFailure = { reason: 'write failed' };
            Object.defineProperty(this, 'brokenApi', {
                get() { throw readFailure; },
                set(value) { throw writeFailure; }
            });
        `)
        runtimeScript.runInContext(context)
        new Script(`
            "use strict";
            assert.throws(() => vptGlobal.brokenApi, error => error === readFailure);
            assert.throws(() => typeof vptGlobal.brokenApi, error => error === readFailure);
            assert.throws(() => { vptGlobal.brokenApi = 1; }, error => error === writeFailure);
        `).runInContext(context)
    })

    test(`${state}: preserves symbols, descriptors, readonly properties and present undefined`, () => {
        const context = createHeap(`
            ${setup}
            const symbol = Symbol('host API');
            const descriptor = { value: { marker: true }, writable: true, configurable: true, enumerable: false };
            Object.defineProperty(this, symbol, descriptor);
            Object.defineProperty(this, 'hiddenApi', descriptor);
            Object.defineProperty(this, 'locked', { value: 7 });
            this.present = undefined;
        `)
        runtimeScript.runInContext(context)
        new Script(`
            "use strict";
            assert.deepEqual(Object.getOwnPropertyDescriptor(vptGlobal, symbol), descriptor);
            assert.deepEqual(Object.getOwnPropertyDescriptor(vptGlobal, 'hiddenApi'), descriptor);
            assert.equal(vptGlobal[symbol], host.hiddenApi);
            assert.equal(Reflect.ownKeys(vptGlobal).includes(symbol), true);
            assert.equal(Object.keys(vptGlobal).includes('hiddenApi'), false);
            vptGlobal[symbol] = 8;
            assert.equal(host[symbol], 8);
            assert.equal(delete vptGlobal[symbol], true);
            assert.equal(Object.hasOwn(host, symbol), false);

            assert.equal(vptGlobal.present, undefined);
            assert.equal(vptGlobal.missing, undefined);
            assert.equal(Object.hasOwn(vptGlobal, 'present'), true);
            assert.equal(Reflect.has(vptGlobal, 'missing'), false);
            Object.defineProperty(vptGlobal, 'present', { get() { return 9; }, configurable: true });
            assert.equal(present, 9);
            assert.equal(delete vptGlobal.present, true);
            assert.equal(Object.hasOwn(host, 'present'), false);

            assert.equal(vptGlobal.locked, 7);
            assert.throws(() => { vptGlobal.locked = 8; }, TypeError);
            assert.throws(() => { delete vptGlobal.locked; }, TypeError);
            assert.equal(Reflect.set(vptGlobal, 'locked', 8), false);
            assert.equal(Reflect.deleteProperty(vptGlobal, 'locked'), false);
            assert.equal(host.locked, 7);
        `).runInContext(context)
    })

    test(`${state}: preserves function identity, call receivers, tags and constructors`, () => {
        const context = createHeap(`
            ${setup}
            this.read = function(...values) { return [this, values]; };
            this.tag = function(strings, ...values) { return [this, [...strings], values]; };
            this.HostType = class HostType {
                #value;
                constructor(value) { this.#value = value; this.target = new.target; }
                read() { return this.#value; }
            };
            this.vendorBridge = { value: 8, read() { return this.value; } };
        `)
        runtimeScript.runInContext(context)
        new Script(`
            "use strict";
            const detached = vptGlobal.read;
            assert.equal(detached, host.read);
            assert.deepEqual(vptGlobal.read(...[1, 2]), [host, [1, 2]]);
            assert.deepEqual(vptGlobal.read?.(3), [host, [3]]);
            assert.deepEqual(detached(4), [undefined, [4]]);
            assert.deepEqual((0, vptGlobal.read)(5), [undefined, [5]]);
            const receiver = {};
            assert.deepEqual(vptGlobal.read.call(receiver, 6), [receiver, [6]]);
            assert.equal(vptGlobal.missingApi?.(assert.fail('Unexpected argument')), undefined);
            assert.deepEqual(vptGlobal.tag\`value:\${7}\`, [host, ['value:', ''], [7]]);
            assert.equal(vptGlobal.vendorBridge.read(), 8);

            assert.equal(vptGlobal.HostType, HostType);
            const instance = new vptGlobal.HostType(...[9]);
            assert.equal(Object.getPrototypeOf(instance), HostType.prototype);
            assert.equal(instance.target, HostType);
            assert.equal(instance.read(), 9);
            class Derived extends vptGlobal.HostType {}
            const derived = new Derived(10);
            assert.equal(derived instanceof HostType, true);
            assert.equal(derived.target, Derived);
            assert.equal(derived.read(), 10);
        `).runInContext(context)
    })

    test(`${state}: shares object-backed globals without capturing lexical bindings or installing globalThis`, () => {
        const context = createHeap(`
            ${setup}
            var objectValue = 1;
            let lexicalValue = 2;
            const lexicalConstant = 3;
            const descriptor = Object.getOwnPropertyDescriptor(this, 'globalThis');
        `)
        runtimeScript.runInContext(context)
        new Script(`
            "use strict";
            vptGlobal.objectValue = 4;
            assert.equal(objectValue, 4);
            objectValue = 5;
            assert.equal(vptGlobal.objectValue, 5);
            assert.equal(Object.hasOwn(vptGlobal, 'lexicalValue'), false);
            assert.equal(Object.hasOwn(vptGlobal, 'lexicalConstant'), false);
            vptGlobal.lexicalValue = 6;
            vptGlobal.lexicalConstant = 7;
            assert.equal(lexicalValue, 2);
            assert.equal(lexicalConstant, 3);
            lexicalValue = 8;
            assert.equal(vptGlobal.lexicalValue, 6);

            // An injected local alias works without creating or modifying a host globalThis property.
            (() => {
                const globalThis = vptGlobal;
                const Math = { max() { return 99; } };
                assert.equal(globalThis, host);
                assert.equal(globalThis.Math.max(3, 4), 4);
                assert.equal(Math.max(3, 4), 99);
            })();
            assert.deepEqual(Object.getOwnPropertyDescriptor(host, 'globalThis'), descriptor);
            host.globalThis = { replacement: true };
            assert.equal(vptGlobal, host);
            assert.notEqual(vptGlobal, host.globalThis);
        `).runInContext(context)
    })

    test(`${state}: honors descriptor changes and deletion during assignment RHS evaluation`, () => {
        const context = createHeap(`${setup} this.slot = 1;`)
        runtimeScript.runInContext(context)
        new Script(`
            "use strict";
            assert.equal(vptGlobal.slot += (delete host.slot, 2), 3);
            assert.equal(host.slot, 3);
            assert.throws(() => {
                vptGlobal.slot += (Object.defineProperty(host, 'slot', { writable: false }), 4);
            }, TypeError);
            assert.equal(host.slot, 3);

            Object.defineProperty(host, 'slot', { value: 1, writable: true });
            // Record the replacement setter's receiver and value, without invoking its throwing getter.
            const writes = [];
            const descriptor = {
                configurable: true,
                get() { assert.fail('Unexpected replacement getter'); },
                set(value) { writes.push([this, value]); }
            };
            assert.equal(vptGlobal.slot += (Object.defineProperty(host, 'slot', descriptor), 4), 5);
            assert.deepEqual(writes, [[host, 5]]);
        `).runInContext(context)
    })

    test(`${state}: preserves destructuring order, rest targets, loop writes and iterator cleanup`, () => {
        const context = createHeap(setup)
        runtimeScript.runInContext(context)
        new Script(`
            "use strict";
            // Record effects locally to distinguish source reads, defaults, writes and iterator closing.
            const events = [];
            Object.defineProperty(host, 'slot', {
                configurable: true,
                set(value) { assert.equal(this, host); events.push(['set', value]); }
            });
            const source = { get value() { events.push('get'); return undefined; }, extra: 8 };
            const result = ({
                [(events.push('key'), 'value')]: vptGlobal.slot = (events.push('default'), 7),
                ...vptGlobal.rest
            } = source);
            assert.equal(result, source);
            assert.deepEqual(events, ['key', 'get', 'default', ['set', 7]]);
            assert.deepEqual(host.rest, { extra: 8 });

            events.length = 0;
            [vptGlobal.slot, ...vptGlobal.rest] = [1, 2, 3];
            assert.deepEqual(host.rest, [2, 3]);
            for (vptGlobal.slot of [4, 5]) {}
            for (vptGlobal.slot in { a: 1, b: 2 }) {}
            assert.deepEqual(events, [['set', 1], ['set', 4], ['set', 5], ['set', 'a'], ['set', 'b']]);

            const failure = new Error('write failed');
            Object.defineProperty(host, 'slot', { set() { throw failure; } });
            function* values() {
                try { yield 9; yield 10; } finally { events.push('closed'); }
            }
            events.length = 0;
            assert.throws(() => { [vptGlobal.slot] = values(); }, error => error === failure);
            assert.throws(() => { for (vptGlobal.slot of values()) {} }, error => error === failure);
            assert.deepEqual(events, ['closed', 'closed']);
        `).runInContext(context)
    })

    test(`${state}: retains assignment references across await and yield`, async () => {
        const context = createHeap(`${setup} this.slot = 1;`)
        runtimeScript.runInContext(context)
        await new Script(`
            "use strict";
            (async () => {
                const { promise, resolve } = Promise.withResolvers();
                const pending = (async () => vptGlobal.slot += await promise)();
                host.slot = 100;
                resolve(2);
                assert.equal(await pending, 3);
                assert.equal(host.slot, 3);

                function* assign() { return vptGlobal.slot = yield 4; }
                const iterator = assign();
                assert.deepEqual(iterator.next(), { value: 4, done: false });
                delete host.slot;
                assert.deepEqual(iterator.next(9), { value: 9, done: true });
                assert.equal(host.slot, 9);
                for await (vptGlobal.slot of [Promise.resolve(10), 11]) {
                    assert.equal(vptGlobal.slot, host.slot);
                }
                assert.equal(host.slot, 11);
            })();
        `).runInContext(context)
    })

    test(`${state}: keeps inherited APIs and special property names without reflection helpers on access`, () => {
        const context = createHeap(`
            ${setup}
            const prototype = Object.create(Object.getPrototypeOf(host), {
                inheritedApi: { value() { return this; } }
            });
            Object.setPrototypeOf(host, prototype);
        `)
        runtimeScript.runInContext(context)
        new Script(`
            "use strict";
            assert.equal('inheritedApi' in vptGlobal, true);
            assert.equal(Object.hasOwn(vptGlobal, 'inheritedApi'), false);
            assert.equal(vptGlobal.inheritedApi(), host);
            for (const name of ['constructor', '__proto__']) {
                const inherited = host[name];
                Object.defineProperty(vptGlobal, name, { value: 1, writable: true, configurable: true });
                assert.equal(++vptGlobal[name], 2);
                assert.equal(host[name], 2);
                assert.equal(Object.getPrototypeOf(vptGlobal), prototype);
                assert.equal(delete vptGlobal[name], true);
                assert.equal(vptGlobal[name], inherited);
            }

            // Patch only this realm after discovery; ordinary host access needs no reflection adapters.
            Reflect.get = Reflect.set = Object.defineProperty = Object.create = Object.setPrototypeOf = () => {
                assert.fail('Unexpected reflection helper');
            };
            vptGlobal.slot = 1;
            assert.equal(vptGlobal.slot++, 1);
            assert.equal(host.slot, 2);
            assert.equal(vptGlobal.Math.max(1, 2), 2);
            assert.equal(delete vptGlobal.slot, true);
        `).runInContext(context)
    })
}

test('does not overwrite a read-only undefined globalThis property during recovery', () => {
    const context = createHeap(`
        Object.defineProperty(this, 'globalThis', { value: undefined, writable: false, configurable: false });
    `)
    runtimeScript.runInContext(context)
    new Script(`
        assert.equal(vptGlobal, this);
        assert.equal(vptGlobal.globalThis, undefined);
        assert.deepEqual(Object.getOwnPropertyDescriptor(this, 'globalThis'), {
            value: undefined, writable: false, configurable: false, enumerable: false
        });
        assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false);
    `).runInContext(context)
})
