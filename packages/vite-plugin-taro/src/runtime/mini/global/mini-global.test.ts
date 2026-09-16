import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createContext, Script } from 'node:vm'

test('reuses the native global without changing its self-reference and shares it across imports', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'globalThis')
    const { miniGlobal } = await import('./mini-global.ts')
    const repeated = await import('./mini-global.ts')

    assert.equal(miniGlobal, globalThis)
    assert.equal(Reflect.get(miniGlobal, 'globalThis'), miniGlobal)
    assert.equal(repeated.miniGlobal, miniGlobal)
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'globalThis'), descriptor)
})

test('creates a writable plain fallback with a self-reference when globalThis is absent', async () => {
    const filename = fileURLToPath(new URL('./mini-global.ts', import.meta.url))
    const source = stripTypeScriptTypes(await readFile(filename, 'utf8'))
    // Remove only the export keyword, preserving source offsets for coverage in this isolated VM.
    const executable = source.replace('export const miniGlobal', '       const miniGlobal')
    const context = createContext({ assert }, { codeGeneration: { strings: false, wasm: false } })
    new Script('delete this.globalThis').runInContext(context)
    new Script(executable, { filename }).runInContext(context)

    // Property writes stay on the fallback object, not the host global or a manufactured bare binding.
    new Script(`
        assert.equal(Object.getPrototypeOf(miniGlobal), Object.prototype);
        assert.equal(miniGlobal.globalThis, miniGlobal);
        assert.deepEqual(Object.keys(miniGlobal), []);
        miniGlobal.probe = 42;
        assert.equal(miniGlobal.globalThis.probe, 42);
        assert.equal(typeof globalThis, 'undefined');
        assert.equal(typeof probe, 'undefined');
    `).runInContext(context)
})
