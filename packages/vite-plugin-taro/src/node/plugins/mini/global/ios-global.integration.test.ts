import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'
import { build } from 'rolldown'
import { vptGlobalBindingId } from '../module/module.ts'
import { createMiniGlobalPlugin } from './create-mini-global-plugin.ts'

for (const minify of [false, true]) {
    test(`iOS: non-strict discovery shares real globals with strict application modules, minify ${minify}`, async () => {
        const [globalPlugin] = createMiniGlobalPlugin({
            getPhysicalChunkId(chunk) {
                assert.ok(typeof chunk !== 'string')
                return chunk.fileName
            }
        })
        const result = await build({
            input: 'fixture',
            transform: { inject: { globalThis: [vptGlobalBindingId, 'vptGlobal'] } },
            plugins: [
                {
                    name: 'test:ios-global',
                    resolveId: (id) => (id === 'fixture' ? id : undefined),
                    load: (id) =>
                        id === 'fixture'
                            ? `
                                globalThis.helloVpt = () => 'hello';
                                globalThis.URL = class { constructor(value) { this.value = value; } };
                                export const root = globalThis;
                                export function check() { return [helloVpt(), new URL('url').value]; }
                                export function receiver() { return this; }
                            `
                            : undefined
                },
                {
                    name: globalPlugin.name,
                    resolveId: globalPlugin.resolveId,
                    load: globalPlugin.load,
                    renderChunk: globalPlugin.renderChunk,
                    generateBundle: globalPlugin.generateBundle
                }
            ],
            output: { format: 'cjs', strict: true, entryFileNames: 'entry.js', minify },
            write: false
        })
        const files = new Map(
            result.output.filter((output) => output.type === 'chunk').map((chunk) => [chunk.fileName, chunk.code])
        )
        const context = createContext({}, { codeGeneration: { strings: false, wasm: false } })
        runInContext(
            `
                // Model iOS's undefined getter receiver, and record whether discovery needed the getter at all.
                this.getterCalls = 0;
                const defineProperty = Object.defineProperty;
                Object.defineProperty = function (object, key, descriptor) {
                    if (key === '__vpt_global__') {
                        const getter = descriptor.get;
                        descriptor.get = function () {
                            getterCalls += 1;
                            return Reflect.apply(getter, undefined, []);
                        };
                    }
                    return defineProperty(object, key, descriptor);
                };
            `,
            context
        )
        // Native CommonJS modules share one cache, but each source owns its strictness independently of its caller.
        const modules = new Map<string, { exports: unknown }>()
        function load(fileName: string): unknown {
            const cached = modules.get(fileName)
            if (cached) {
                return cached.exports
            }
            const code = files.get(fileName)
            assert.ok(code !== undefined, `Missing native file: ${fileName}`)
            const module: { exports: unknown } = { exports: {} }
            modules.set(fileName, module)
            const execute: unknown = runInContext(
                `(function(require, module, exports, globalThis, self, window) {\n${code}\n})`,
                context
            )
            assert.ok(typeof execute === 'function')
            execute(
                (request: string) => load(path.posix.join(path.posix.dirname(fileName), request)),
                module,
                module.exports
            )
            return module.exports
        }
        const fixture = load('entry.js')
        assert.ok(fixture && typeof fixture === 'object')
        assert.strictEqual(Reflect.get(fixture, 'root'), runInContext('this', context))
        context.fixture = fixture
        assert.equal(runInContext('JSON.stringify(fixture.check())', context), '["hello","url"]')
        assert.equal(runInContext('(0, fixture.receiver)()', context), undefined, 'application code must remain strict')
        assert.equal(runInContext('getterCalls', context), 0, 'the existing this probe recovers the host first')
        assert.equal(runInContext('Object.hasOwn(Object.prototype, "__vpt_global__")', context), false)
        assert.equal(runInContext('Object.hasOwn(Object, Symbol.for("vpt.fake.global"))', context), false)
    })
}
