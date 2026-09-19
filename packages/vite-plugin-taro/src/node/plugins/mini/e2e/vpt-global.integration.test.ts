import assert from 'node:assert/strict'
import { posix } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { constants, createContext, Script } from 'node:vm'
import { build, type OutputChunk } from 'rolldown'
import { transform } from 'rolldown/utils'

const runtimeId = fileURLToPath(new URL('../../../../runtime/global/vpt-global.ts', import.meta.url))
const entryId = '/vpt-global-fixture/entry.js'
const peerId = '/vpt-global-fixture/peer.js'
const localId = '/vpt-global-fixture/local.js'
const lazyId = '/vpt-global-fixture/lazy.js'
const inject = { globalThis: [runtimeId, 'vptGlobal'] } satisfies Record<string, [string, string]>
const define = { __VPT_NATIVE_GLOBAL_THIS__: 'globalThis' }

/** Exercise the compiler's two passes before linking, without modifying or excluding the real runtime source. */
async function bundleFixture(sources: ReadonlyMap<string, string>, input: string[], minify: boolean) {
    // Record the resolved graph to detect self-injection even when bundling would erase the circular import.
    const imports = new Map<string, readonly string[]>()
    const result = await build({
        input,
        plugins: [
            {
                name: 'test:global-injection-fixtures',
                resolveId: (id) => (sources.has(id) ? id : undefined),
                load: (id) => sources.get(id),
                moduleParsed(info) {
                    imports.set(info.id, info.importedIds)
                }
            },
            {
                name: 'test:inject-before-define',
                async transform(code, id) {
                    // A separate inject-only pass is intentional: combined options currently self-inject the runtime.
                    const result = await transform(id, code, { inject, sourcemap: true })
                    assert.deepEqual(result.errors, [])
                    assert.deepEqual(result.warnings, [])
                    return { code: result.code, map: result.map }
                }
            }
        ],
        transform: { define },
        checks: { circularDependency: true },
        onwarn(warning) {
            assert.fail(warning.message)
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs', chunkFileNames: '[name]-[hash].cjs', minify },
        write: false
    })
    return { chunks: result.output.filter((chunk) => chunk.type === 'chunk'), imports }
}

/** Execute emitted CommonJS, including split chunks, in a strict host realm with eval and Function disabled. */
function createBundleHeap(chunks: readonly OutputChunk[], setup: string) {
    const context = createContext(constants.DONT_CONTEXTIFY, { codeGeneration: { strings: false, wasm: false } })
    context.assert = assert
    const files = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
    // CommonJS owns this per-heap module cache; registering before evaluation also models cycles accurately.
    const modules = new Map<string, { exports: unknown }>()

    function run(code: string): unknown {
        return new Script(`"use strict";\n${code}`).runInContext(context)
    }

    function load(fileName: string): unknown {
        const cached = modules.get(fileName)
        if (cached) {
            return cached.exports
        }
        const chunk = files.get(fileName)
        assert.ok(chunk, `Unexpected external require: ${fileName}`)
        const module = { exports: {} }
        modules.set(fileName, module)
        const execute: unknown = run(`(function(module, exports, require) {\n${chunk.code}\n})`)
        assert.ok(typeof execute === 'function')
        execute(module, module.exports, (request: string) => load(posix.join(posix.dirname(fileName), request)))
        return module.exports
    }

    run(`
        this.host = this;
        // Realm-local observations distinguish discovery from application initialization and lazy execution.
        this.events = [];
        this.discoveries = 0;
        const defineProperty = Object.defineProperty;
        Object.defineProperty = (target, key, descriptor) => {
            if (key === '__vpt_global__') { host.discoveries += 1; }
            return defineProperty(target, key, descriptor);
        };
        this.fetch = function(value) { return [this, value]; };
        this.tt = { showToast() { assert.equal(this, tt); return 'toast'; } };
        ${setup}
        const globalDescriptor = Object.getOwnPropertyDescriptor(host, 'globalThis');
        const prototypeKeys = Reflect.ownKeys(Object.prototype);
    `)
    return { context, load, run }
}

const applicationSources: ReadonlyMap<string, string> = new Map([
    [localId, "export const globalThis = { marker: 'local globalThis' };"],
    [
        peerId,
        `
            globalThis.events.push('peer');
            export const peerRoot = globalThis;
            export const initialized = globalThis.Math.max(3, 4);
            export const readPeer = () => globalThis.later;
            export function writePeer(value) { globalThis.later = value; }
        `
    ],
    [
        entryId,
        `
            export { peerRoot, initialized, readPeer, writePeer } from '${peerId}';
            export { globalThis as localRoot } from '${localId}';
            globalThis.events.push('entry');
            export const root = globalThis;
            export const shorthand = { globalThis };
            export const escaped = glo\\u0062alThis;
            export const kind = typeof globalThis;
            export const candidateMatchesMath = globalThis.Math === Math;
            export const nativeBindings = [Math, Promise, fetch, tt];
            export const readBare = () => later;
            export const callFetch = (value) => fetch(value);
            export const toast = () => globalThis.tt.showToast();
            export const optional = () => globalThis?.['Math'].max(1, 2);
            // Deliberately collide with the runtime export's spelling to exercise linker name hygiene.
            const vptGlobal = 'application local';
            export const localName = vptGlobal;
        `
    ]
])

for (const minify of [false, true]) {
    for (const state of ['native', 'absent', 'shadowed'] as const) {
        test(`ordered injection: ${state} globalThis, minify ${minify}`, async () => {
            const { chunks, imports } = await bundleFixture(applicationSources, [entryId], minify)
            assert.equal(chunks.length, 1)
            assert.deepEqual(imports.get(runtimeId), [], 'The runtime must have no injected dependency on itself')
            assert.deepEqual(imports.get(peerId), [runtimeId])
            assert.deepEqual(imports.get(localId), [])
            assert.deepEqual(imports.get(entryId)?.toSorted(), [peerId, localId, runtimeId].toSorted())
            assert.doesNotMatch(chunks[0].code, /__VPT_NATIVE_GLOBAL_THIS__/)

            const setup = {
                native: 'Object.freeze(Object.prototype);',
                absent: 'delete this.globalThis;',
                shadowed: 'let globalThis;'
            }[state]
            const heap = createBundleHeap(chunks, setup)
            heap.context.fixture = heap.load(chunks[0].fileName)
            heap.run(`
                assert.equal(fixture.root, host);
                assert.equal(fixture.peerRoot, host);
                assert.equal(fixture.shorthand.globalThis, host);
                assert.equal(fixture.escaped, host);
                assert.equal(fixture.kind, 'object');
                assert.equal(fixture.initialized, 4);
                assert.equal(fixture.candidateMatchesMath, true);
                assert.equal(fixture.localName, 'application local');
                assert.deepEqual(fixture.localRoot, { marker: 'local globalThis' });
                assert.deepEqual(fixture.nativeBindings, [Math, Promise, fetch, tt]);
                assert.deepEqual(fixture.callFetch(7), [undefined, 7]);
                assert.equal(fixture.toast(), 'toast');
                assert.equal(fixture.optional(), 2);
                assert.deepEqual(events, ['peer', 'entry']);
                assert.equal(discoveries, ${state === 'native' ? 0 : 1});
                assert.deepEqual(Object.getOwnPropertyDescriptor(host, 'globalThis'), globalDescriptor);
                assert.deepEqual(Reflect.ownKeys(Object.prototype), prototypeKeys);

                fixture.writePeer(8);
                assert.equal(later, 8);
                assert.equal(fixture.readBare(), 8);
                later = 9;
                assert.equal(fixture.readPeer(), 9);
                delete host.later;
                assert.equal(fixture.readPeer(), undefined);
                assert.throws(fixture.readBare, ReferenceError);
            `)
        })
    }

    test(`typeof-only use still injects the recovered global, minify ${minify}`, async () => {
        const sources = new Map([[entryId, 'export const kind = typeof globalThis;']])
        const { chunks, imports } = await bundleFixture(sources, [entryId], minify)
        assert.deepEqual(imports.get(entryId), [runtimeId])
        assert.deepEqual(imports.get(runtimeId), [])
        const heap = createBundleHeap(chunks, 'delete this.globalThis;')
        heap.context.fixture = heap.load(chunks[0].fileName)
        heap.run(`
            assert.equal(fixture.kind, 'object');
            assert.equal(typeof globalThis, 'undefined');
            assert.equal(discoveries, 1);
        `)
    })

    test(`CommonJS .js dependencies share the injected global with ESM consumers, minify ${minify}`, async () => {
        const commonJsId = '/vpt-global-fixture/dependency.js'
        const sources = new Map([
            [commonJsId, 'module.exports = { root: globalThis, matchesMath: globalThis.Math === Math };'],
            [entryId, `import dependency from '${commonJsId}'; export { dependency }; export const root = globalThis;`]
        ])
        const { chunks, imports } = await bundleFixture(sources, [entryId], minify)
        assert.deepEqual(imports.get(commonJsId), [runtimeId])
        assert.deepEqual(imports.get(runtimeId), [])
        const heap = createBundleHeap(chunks, 'delete this.globalThis;')
        heap.context.fixture = heap.load(chunks[0].fileName)
        heap.run(`
            assert.equal(fixture.dependency.root, host);
            assert.equal(fixture.root, host);
            assert.equal(fixture.dependency.matchesMath, true);
            assert.equal(discoveries, 1);
        `)
    })

    test(`split entries and a lazy module share one recovered global, minify ${minify}`, async () => {
        const sources = new Map([
            [entryId, `export const root = globalThis; export const loadLazy = () => import('${lazyId}');`],
            [peerId, 'export const root = globalThis; export const read = () => globalThis.later;'],
            [lazyId, "globalThis.events.push('lazy'); export const root = globalThis;"]
        ])
        const { chunks, imports } = await bundleFixture(sources, [entryId, peerId], minify)
        assert.deepEqual(imports.get(runtimeId), [])
        const runtimeChunks = chunks.filter((chunk) => chunk.moduleIds.includes(runtimeId))
        assert.equal(runtimeChunks.length, 1)
        assert.equal(runtimeChunks[0].isEntry, false)
        const entry = chunks.find((chunk) => chunk.facadeModuleId === entryId)
        const peer = chunks.find((chunk) => chunk.facadeModuleId === peerId)
        assert.ok(entry && peer)
        const heap = createBundleHeap(chunks, 'delete this.globalThis;')
        heap.context.first = heap.load(entry.fileName)
        heap.context.second = heap.load(peer.fileName)
        await heap.run(`
            (async () => {
                assert.equal(first.root, host);
                assert.equal(second.root, host);
                assert.deepEqual(events, []);
                assert.equal(discoveries, 1);
                const lazy = await first.loadLazy();
                assert.equal(lazy.root, host);
                assert.deepEqual(events, ['lazy']);
                lazy.root.later = 42;
                assert.equal(second.read(), 42);
                assert.equal(later, 42);
                assert.equal((await first.loadLazy()).root, host);
                assert.deepEqual(events, ['lazy']);
                assert.equal(discoveries, 1);
                assert.equal(typeof globalThis, 'undefined');
                assert.equal(Object.hasOwn(Object.prototype, '__vpt_global__'), false);
            })();
        `)
    })
}

test('local globalThis bindings, property names, text and comments never trigger injection', async () => {
    const comment = '/*! globalThis and __VPT_NATIVE_GLOBAL_THIS__ must remain text. */'
    const sources = new Map([
        [peerId, "export const value = 'imported local';"],
        [
            entryId,
            `
                ${comment}
                import { value as globalThis } from '${peerId}';
                export { globalThis as imported };
                export const text = 'globalThis __VPT_NATIVE_GLOBAL_THIS__';
                export const property = { globalThis: 'property' };
                export function parameter(globalThis) { return globalThis; }
                export function destructured({ globalThis }) { return globalThis; }
                export function local() { const globalThis = 'local'; return globalThis; }
                export function caught() { try { throw 'caught'; } catch (globalThis) { return globalThis; } }
                export function placeholder(__VPT_NATIVE_GLOBAL_THIS__) { return __VPT_NATIVE_GLOBAL_THIS__; }
            `
        ]
    ])
    const { chunks, imports } = await bundleFixture(sources, [entryId], false)
    assert.equal(imports.has(runtimeId), false)
    assert.deepEqual(imports.get(entryId), [peerId])
    assert.ok(chunks[0].code.includes(comment))
    const heap = createBundleHeap(chunks, 'delete this.globalThis;')
    heap.context.fixture = heap.load(chunks[0].fileName)
    heap.run(`
        assert.equal(fixture.imported, 'imported local');
        assert.equal(fixture.text, 'globalThis __VPT_NATIVE_GLOBAL_THIS__');
        assert.deepEqual(fixture.property, { globalThis: 'property' });
        assert.equal(fixture.parameter('parameter'), 'parameter');
        assert.equal(fixture.destructured({ globalThis: 'destructured' }), 'destructured');
        assert.equal(fixture.local(), 'local');
        assert.equal(fixture.caught(), 'caught');
        assert.equal(fixture.placeholder('placeholder local'), 'placeholder local');
        assert.equal(discoveries, 0);
    `)
})

test('other free globals remain native and do not load the runtime', async () => {
    const sources = new Map([
        [
            entryId,
            `
                export const bindings = [Math, Promise, fetch, tt];
                export const callFetch = (value) => fetch(value);
                export const windowKind = typeof window;
                export const selfKind = typeof self;
                export const missingKind = typeof futureApi;
                export const readProperty = (object) => object.globalThis;
            `
        ]
    ])
    const { chunks, imports } = await bundleFixture(sources, [entryId], false)
    assert.deepEqual(imports.get(entryId), [])
    assert.equal(imports.has(runtimeId), false)
    const heap = createBundleHeap(chunks, 'delete this.globalThis;')
    heap.context.fixture = heap.load(chunks[0].fileName)
    heap.run(`
        assert.deepEqual(fixture.bindings, [Math, Promise, fetch, tt]);
        assert.deepEqual(fixture.callFetch(3), [undefined, 3]);
        assert.equal(fixture.windowKind, 'undefined');
        assert.equal(fixture.selfKind, 'undefined');
        assert.equal(fixture.missingKind, 'undefined');
        assert.equal(fixture.readProperty({ globalThis: 4 }), 4);
        assert.equal(discoveries, 0);
    `)
})

test('ordered source injection currently fails to reparse its ESM import in a .cjs file', async () => {
    const commonJsId = '/vpt-global-fixture/dependency.cjs'
    const sources = new Map([
        [commonJsId, 'module.exports = globalThis;'],
        [entryId, `export { default as root } from '${commonJsId}';`]
    ])
    // Characterize the current boundary rather than treating the successful .js case as proof of .cjs support.
    await assert.rejects(bundleFixture(sources, [entryId], false), /Cannot use import statement outside a module/)
})

test('combined Rolldown inject and define options currently self-inject the runtime', async () => {
    // Keep this failure mode observable: the runtime must not acquire its native probe through its own export.
    const imports: string[] = []
    const warnings: string[] = []
    const result = await build({
        input: runtimeId,
        plugins: [
            {
                name: 'test:combined-global-passes',
                moduleParsed(info) {
                    imports.push(...info.importedIds)
                }
            }
        ],
        transform: { inject, define },
        checks: { circularDependency: true },
        onwarn(warning) {
            warnings.push(warning.code ?? warning.message)
        },
        output: { format: 'cjs', minify: false },
        write: false
    })
    assert.deepEqual(imports, [runtimeId])
    assert.deepEqual(warnings, ['CIRCULAR_DEPENDENCY'])
    const chunks = result.output.filter((chunk) => chunk.type === 'chunk')
    const heap = createBundleHeap(chunks, 'Object.freeze(Object.prototype);')
    assert.throws(() => heap.load(chunks[0].fileName), { name: 'ReferenceError' })
})
