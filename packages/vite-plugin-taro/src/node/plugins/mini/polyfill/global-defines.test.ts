import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'

test('global defines bypass host shadowing without rewriting text or local bindings', async () => {
    // A retained comment makes an accidental text replacement observable in the emitted bundle.
    const comment = '/*! URL and self in comments must remain text. */'
    const entryId = '\0global-defines-fixture.js'
    const result = await build({
        input: entryId,
        plugins: [
            {
                name: 'test:global-defines-fixture',
                resolveId: (id) => (id === entryId ? id : undefined),
                load: (id) =>
                    id === entryId
                        ? `
                            ${comment}
                            export const text = 'URL and self';
                            export const globalURL = () => URL;
                            export const globalSelf = () => self;
                            export function parameters(URL, self) {
                                return [URL, self];
                            }
                            export function variables() {
                                const URL = 'local URL';
                                const self = 'local self';
                                return [URL, self];
                            }
                        `
                        : undefined
            }
        ],
        transform: { define: { URL: 'globalThis.URL', self: 'globalThis.self' } },
        output: { format: 'iife', name: 'fixture', minify: false },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk?.type === 'chunk')
    assert.ok(chunk.code.includes(comment), 'global names inside comments must remain unchanged')

    // Only this isolated VM context receives a self alias. A synthetic host wrapper tests shadowing, not platform behavior.
    runInNewContext(
        `
            globalThis.self = globalThis;
            (function(URL, self) {
                ${chunk.code}
                assert.equal(fixture.text, 'URL and self');
                assert.equal(fixture.globalURL(), globalThis.URL);
                assert.equal(fixture.globalSelf(), globalThis.self);
                assert.deepEqual(fixture.parameters('parameter URL', 'parameter self'), ['parameter URL', 'parameter self']);
                assert.deepEqual(fixture.variables(), ['local URL', 'local self']);
            })(undefined, undefined);
        `,
        { assert, URL },
        { contextCodeGeneration: { strings: false, wasm: false } }
    )
})
