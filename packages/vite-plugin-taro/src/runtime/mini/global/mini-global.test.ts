import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { constants, createContext, Script } from 'node:vm'
import { miniGlobal } from './mini-global.ts'

test('exports only one shared synthetic namespace, without modifying the host', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'globalThis')
    const repeated = await import('./mini-global.ts')
    assert.deepEqual(Object.keys(repeated), ['miniGlobal'])
    assert.equal(repeated.miniGlobal, miniGlobal)
    assert.notEqual(miniGlobal, globalThis)
    assert.equal(Object.getPrototypeOf(miniGlobal), Object.prototype)
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'globalThis'), descriptor)
    assert.deepEqual(Object.getOwnPropertyDescriptor(miniGlobal, 'globalThis'), {
        value: miniGlobal,
        configurable: true,
        enumerable: false,
        writable: true
    })
    assert.deepEqual(Object.keys(miniGlobal), [])
})

test('shares additions, undefined values, descriptor changes and deletions as ordinary properties', async () => {
    const repeated = await import('./mini-global.ts')
    const key = Symbol('probe')
    try {
        assert.equal(Reflect.has(miniGlobal, key), false)
        Reflect.set(miniGlobal, key, undefined)
        assert.equal(Reflect.has(repeated.miniGlobal, key), true)
        assert.equal(Reflect.get(repeated.miniGlobal, key), undefined)
        Reflect.set(repeated.miniGlobal, key, 42)
        assert.equal(Reflect.get(miniGlobal, key), 42)
        Object.defineProperty(miniGlobal, key, { writable: false })
        assert.equal(Reflect.set(repeated.miniGlobal, key, 43), false)
        const failure = new RangeError('getter')
        Object.defineProperty(miniGlobal, key, {
            get() {
                throw failure
            }
        })
        assert.throws(
            () => Reflect.get(repeated.miniGlobal, key),
            (error) => error === failure
        )
    } finally {
        Reflect.deleteProperty(miniGlobal, key)
    }
    assert.equal(Reflect.has(repeated.miniGlobal, key), false)
})

test('initializes without native globalThis, eval, reflection-based discovery or native binding probes', async () => {
    const filename = fileURLToPath(new URL('./mini-global.ts', import.meta.url))
    const source = stripTypeScriptTypes(await readFile(filename, 'utf8')).replace(/^export /gm, '       ')
    const context = createContext(constants.DONT_CONTEXTIFY, { codeGeneration: { strings: false, wasm: false } })
    context.assert = assert
    new Script(`
        delete this.globalThis;
        Object.defineProperty(this, 'Math', { get() { throw new Error('eager native probe') } });
        Reflect.get = Reflect.set = Object.create = () => { throw new Error('unneeded reflection') };
    `).runInContext(context)
    new Script(`"use strict";\n${source}`, { filename }).runInContext(context)
    new Script(`
        "use strict";
        assert.equal(typeof globalThis, 'undefined');
        assert.equal(miniGlobal.globalThis, miniGlobal);
        assert.deepEqual(Object.getOwnPropertyNames(miniGlobal), ['globalThis']);
        assert.equal('Math' in miniGlobal, false);
        miniGlobal.globalThis = 42;
        assert.equal(miniGlobal.globalThis, 42);
        delete miniGlobal.globalThis;
        assert.equal('globalThis' in miniGlobal, false);
    `).runInContext(context)
})
