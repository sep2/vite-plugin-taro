import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { constants, createContext, Script } from 'node:vm'
import { walk } from 'oxc-walker'
import { RolldownMagicString } from 'rolldown'
import { parseSync } from 'rolldown/utils'
import { rewriteGlobal } from './rewrite-global.ts'

const runtimeFilename = fileURLToPath(new URL('../../../../runtime/mini/global/mini-global.ts', import.meta.url))
const runtimeSource = stripTypeScriptTypes(readFileSync(runtimeFilename, 'utf8')).replace(/^export /gm, '       ')
type Observation = { result: { value: unknown } | { error: unknown } }

/** Keep Node's native ESM linking, cycles and GC semantics, but load the fixture modules from stdin instead of disk. */
function runMemoryModules(modules: Readonly<Record<string, string>>, driver: string, flags: readonly string[]): string {
    return execFileSync(process.execPath, [...flags, '--input-type=module'], {
        input: `
            import { registerHooks } from 'node:module';
            const sources = new Map(Object.entries(${JSON.stringify(modules)}).map(([name, source]) => ['fixture:/' + name, source]));
            registerHooks({
                resolve(specifier, context, nextResolve) {
                    const url = context.parentURL?.startsWith('fixture:/')
                        ? new URL(specifier, context.parentURL).href : specifier;
                    return sources.has(url) ? { url, shortCircuit: true } : nextResolve(specifier, context);
                },
                load(url, context, nextLoad) {
                    return sources.has(url)
                        ? { format: 'module', source: sources.get(url), shortCircuit: true }
                        : nextLoad(url, context);
                }
            });
            ${driver}
        `,
        encoding: 'utf8',
        timeout: 10000
    })
}

function parse(code: string, preserveParens: boolean) {
    const parsed = parseSync('module.js', code, { sourceType: 'module', preserveParens })
    assert.deepEqual(parsed.errors, [])
    return parsed.program
}

function rewrite(code: string, preserveParens: boolean) {
    // Each invocation owns its editor; import insertion and source maps remain with the caller.
    const editor = new RolldownMagicString(code, { filename: 'module.js' })
    const alias = rewriteGlobal(parse(code, preserveParens), editor)
    const output = editor.toString()
    parse(output, preserveParens)
    return { code: output, alias }
}

function assertNames(code: string, expected: string[]) {
    const result = rewrite(code, false)
    // Only generated namespace checks use this hygienic alias; native fallbacks intentionally remain bare identifiers.
    const names = new Set<string>()
    walk(parse(result.code, false), {
        enter(node) {
            if (
                node.type === 'BinaryExpression' &&
                node.operator === 'in' &&
                node.right.type === 'Identifier' &&
                node.right.name === result.alias
            ) {
                assert.ok(node.left.type === 'Literal' && typeof node.left.value === 'string')
                names.add(node.left.value)
            }
        }
    })
    assert.deepEqual(Array.from(names).toSorted(), expected.toSorted())
    if (expected.length === 0) {
        assert.deepEqual(result, { code, alias: null })
    }
}

async function observe(code: string, transformed: boolean, setup: string): Promise<Observation> {
    // Ordinary realms avoid Node's contextified proxy, which suppresses some strict property-write errors.
    const context = createContext(constants.DONT_CONTEXTIFY, { codeGeneration: { strings: false, wasm: false } })
    new Script(`
        this.slot = 0;
        this.fetchCalls = 0;
        this.fetch = async function(value) { fetchCalls++; return [this === undefined, value] };
        this.vendorBridge = { value: 9, read() { return this.value } };
        ${setup}
    `).runInContext(context)
    if (transformed) {
        new Script('delete this.globalThis').runInContext(context)
    }
    // The rewriter only runs without native globalThis. Keep its namespace private, not an ambient native binding.
    const namespace: object | null = transformed
        ? new Script(`(() => { "use strict"; ${runtimeSource}; return miniGlobal; })()`).runInContext(context)
        : null
    const result = transformed ? rewrite(code, true) : { code, alias: null }
    try {
        const value =
            result.alias && namespace
                ? await new Script(
                      `"use strict"; (${result.alias}) => { return ${result.code.trimStart()} }`
                  ).runInContext(context)(namespace)
                : await new Script(`"use strict"; ${code}`).runInContext(context)
        return { result: { value: structuredClone(value) } }
    } catch (error) {
        // VM errors have another realm's prototype; messages and stack locations are engine-specific.
        assert.ok(typeof error === 'object' && error !== null && 'name' in error)
        return { result: { error: error.name } }
    }
}

async function assertEquivalent(code: string) {
    const expected = await observe(code, false, '')
    assert.ok('value' in expected.result, 'Native oracle must complete')
    assert.deepEqual((await observe(code, true, '')).result, expected.result, 'synthetic global')
}

test('discovers arbitrary free names, without whitelisting built-ins or scanning strings', () => {
    assertNames('Math.max(value, 1); fetch(url); vendorBridge.read(); missing?.(); typeof anotherMissing;', [
        'Math',
        'value',
        'fetch',
        'url',
        'vendorBridge',
        'missing',
        'anotherMissing'
    ])
    assertNames('"Math fetch"; // vendorBridge\nconst object = { fetch: 1 }; object.fetch;', [])
    assertNames(String.raw`M\u0061th.max(vendor\u0042ridge.value, 1);`, ['Math', 'vendorBridge'])
    assertNames('', [])
})

test('preserves module interfaces, keys, private names and labels', () => {
    assertNames(
        `
        import { Math as local } from './host.js'; export { local as Math };
        export { fetch } from './host.js'; export * as namespace from './other.js';
        label: for (;;) { break label }
        const object = { Math() {}, [computed](Math) { return Math } };
        class Type { #fetch; fetch() { return this.#fetch } field = vendorBridge; }
        object.Math; import.meta.url; export default local;
    `,
        ['computed', 'vendorBridge']
    )
    assertNames('export { missing };', [])
})

test('respects imports, hoisting, TDZ, named expressions, loops and shadow restoration', () => {
    for (const source of [
        'import Math from "./host.js"; Math;',
        'import * as fetch from "./host.js"; fetch;',
        'Math; const Math = 1;',
        'fetch(); function fetch() {}',
        'slot; var slot;',
        'function run() { slot; { var slot; } }',
        'const read = function vendorBridge() { return vendorBridge };',
        'const Type = class Math extends Math { method() { return Math } };',
        'const read = ({ slot }) => slot;',
        'try {} catch (fetch) { fetch; }',
        'for (let Math of Math.items) { Math; }',
        'for (var slot in {}) { slot; } slot;',
        'for (let slot = 0; slot < 3; slot++) {}'
    ]) {
        assertNames(source, [])
    }
    assertNames('{ let Math; { let Math; Math; } Math; } Math;', ['Math'])
    assertNames('{ let fetch; fetch; } { fetch; }', ['fetch'])
    assertNames('const read = function vendorBridge() { return vendorBridge }; vendorBridge;', ['vendorBridge'])
    assertNames('class Type { static { var slot; slot; } static { slot; } } slot;', ['slot'])
})

test('separates parameter/default and body environments', () => {
    assertNames('function read(value = Math) { var Math; }', ['Math'])
    assertNames('function read(value = Math, Math) { var Math; }', [])
    assertNames('const read = function(value = fetch) { var fetch; };', ['fetch'])
    assertNames('const read = (value = slot) => { var slot; };', ['slot'])
    assertNames('function read(value = (() => { var local; return slot })()) { var slot; }', ['slot'])
    assertNames('try {} catch ({ slot = slot }) { slot; }', [])
    assertNames('try {} catch ({ value = fetch }) { let fetch; }', ['fetch'])
    assertNames('try {} catch ({ [key]: value = fallback }) {}', ['key', 'fallback'])
})

test('tracks implicit arguments without treating it as a host-name whitelist', () => {
    assertNames('function read() { return (() => arguments[0])() }', [])
    assertNames('const read = function self() { return arguments[0] + self };', [])
    assertNames('const object = { [arguments]() { return arguments[0] } }; const arrow = () => arguments;', [
        'arguments'
    ])
    assertNames('typeof arguments; eval;', ['arguments', 'eval'])
})

test('keeps nested switch discriminants outside shared case bindings', () => {
    assertNames(
        `
        switch ((() => {
            switch (slot) { default: let slot; slot; }
            return Math;
        })()) { case Math: let Math; Math; default: Math; }
        switch (fetch) {}
        function run(slot) { switch (slot) { case slot: let slot; } }
    `,
        ['slot', 'Math', 'fetch']
    )
})

test('allocates hygienic names across all scopes and preserves directives, hashbangs and comments', () => {
    const code =
        '#!/usr/bin/env node\n"use client";\n// 🚀 keep\nconst __miniGlobal0 = 1; function read(__miniGlobal1) { return Math.max(__miniGlobal0, __miniGlobal1) }\n'
    const result = rewrite(code, false)
    assert.equal(result.alias, '__miniGlobal2')
    assert.ok(result.code.startsWith('#!/usr/bin/env node\n"use client";\n// 🚀 keep\n'))
    assertNames(code, ['Math'])
})

test('uses real native Math/fetch and arbitrary host bindings when globalThis is absent', async () => {
    await assertEquivalent(`(async () => {
        const result = await fetch(Math.max(2, 5));
        return [result, fetchCalls, vendorBridge.read(), typeof missingBinding];
    })()`)
})

test('emits direct reads, typeof, calls and updates without factories, caches or native-global guards', async () => {
    const result = rewrite('Math; fetch(1); typeof missing; ++slot; slot++;', true)
    const global = result.alias
    assert.ok(global)
    assert.ok(result.code.includes(`("Math" in ${global} ? ${global}.Math : Math)`))
    assert.ok(result.code.includes(`("fetch" in ${global} ? ${global}.fetch : fetch)(1)`))
    assert.ok(result.code.includes(`("missing" in ${global} ? typeof ${global}.missing : typeof missing)`))
    assert.ok(result.code.includes(`("slot" in ${global} ? ++${global}.slot : ++slot)`))
    assert.ok(result.code.includes(`("slot" in ${global} ? ${global}.slot++ : slot++)`))
    assert.doesNotMatch(result.code, /createGlobalBinding|globalThis|\bvar\b|\bget\b|\bset\b|\|\||&&/)
    const code = `(() => { let total = 0; for (let i = 0; i < 100; i++) total += Math.max(i, 1); return total })()`
    assert.deepEqual((await observe(code, true, '')).result, { value: 4951 })
})

test('reads live native bindings, including falsy values and global lexical bindings', async () => {
    await assertEquivalent(`(() => { const first = fetch; fetch = () => 7; return [fetch(), first !== fetch] })()`)
    await assertEquivalent(`(() => {
        const values = [];
        for (const value of [0, false, '', null, undefined]) { slot = value; values.push(slot, typeof slot) }
        return values;
    })()`)
    const code = '(() => [Math.max(1, 2), typeof Math])()'
    const setup = 'let Math = { max() { return 99 } };'
    const expected = await observe(code, false, setup)
    assert.deepEqual(expected.result, { value: [99, 'object'] })
    assert.deepEqual((await observe(code, true, setup)).result, expected.result)
})

test('native fallbacks cannot capture unrelated shadowed names and preserve lexical arguments', async () => {
    await assertEquivalent(`(async () => {
        function first(Math) { return fetch(Math) }
        function second(fetch) { return Math.max(2, 3) }
        return [await first(4), second(0)];
    })()`)
    const code = '(() => [arguments, typeof arguments])()'
    const setup = 'this.arguments = "host arguments";'
    const expected = await observe(code, false, setup)
    assert.deepEqual(expected.result, { value: ['host arguments', 'string'] })
    assert.deepEqual((await observe(code, true, setup)).result, expected.result)
})

const assignmentOperators = [
    '=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '**=',
    '<<=',
    '>>=',
    '>>>=',
    '&=',
    '|=',
    '^=',
    '&&=',
    '||=',
    '??='
]

for (const name of ['slot', 'vendorValue', 'globalThis']) {
    for (const operator of assignmentOperators) {
        test(`preserves ${name} ${operator} evaluation and result`, async () => {
            await assertEquivalent(`(() => {
                globalThis.vendorValue = 0;
                let calls = 0;
                ${name} = 8;
                const result = (${name} ${operator} (++calls, 2));
                return [result, ${name}, calls];
            })()`)
        })
    }
}

test('preserves literal, local and free identifier RHSs across every assignment operator', async () => {
    for (const operator of assignmentOperators) {
        for (const right of ['2', 'local', 'futureValue']) {
            const code = `(() => { const local = 2; slot = 8; const result = (slot ${operator} ${right}); return [result, slot] })()`
            const compiled = rewrite(code, false)
            assert.doesNotMatch(compiled.code, /createGlobalBinding|globalThis/)
            const setup = 'this.futureValue = 2;'
            const expected = await observe(code, false, setup)
            assert.ok('value' in expected.result)
            assert.deepEqual((await observe(code, true, setup)).result, expected.result)
        }
    }
    assertNames('slot = other;', ['slot', 'other'])
    assertNames('function run(other) { slot += other; }', ['slot'])
    assertNames('let slot; slot = other;', ['other'])
    await assertEquivalent(`(() => {
        globalThis.slot = 1;
        slot ||= missing;
        globalThis.slot = 0;
        slot &&= missing;
        slot ??= missing;
        return slot;
    })()`)
})

test('preserves logical assignment short-circuiting', async () => {
    for (const initial of ['false', '0', 'null', 'undefined', '42']) {
        for (const operator of ['&&=', '||=', '??=']) {
            await assertEquivalent(
                `(() => { let calls = 0; slot = ${initial}; const result = (slot ${operator} (++calls, 9)); return [result, slot, calls] })()`
            )
        }
    }
})

test('preserves prefix/postfix values, BigInt and numeric coercion', async () => {
    for (const operation of ['++slot', 'slot++', '--slot', 'slot--']) {
        for (const initial of ['5n', '"5"', '{ valueOf() { trace.push("coerce"); return 5 } }']) {
            await assertEquivalent(
                `(() => { const trace = []; slot = ${initial}; const result = ${operation}; return [result, slot, trace] })()`
            )
        }
    }
})

test('preserves destructuring keys, shorthand, defaults, rest and side-effect order', async () => {
    await assertEquivalent(`(() => {
        const trace = [];
        const key = () => (trace.push('key'), 'value');
        const fallback = () => (trace.push('default'), 7);
        const source = { get value() { trace.push('get'); return undefined }, extra: 8 };
        const result = ({ [key()]: slot = fallback() } = source);
        trace.push(slot, result === source, ({ slot }).slot);
        ({ slot = 9 } = {});
        trace.push(slot);
        [, slot, ...slot] = [0, 1, 2, 3];
        trace.push(slot);
        ({ extra: slot, ...slot } = { extra: 8, other: 9 });
        trace.push(slot);
        slot = {};
        ({ value: slot.value = 10 } = {});
        trace.push(slot.value);
        return trace;
    })()`)
})

test('preserves for-in/of/await-of and iterator cleanup', async () => {
    await assertEquivalent(`(async () => {
        const trace = [];
        for (slot in { a: 1, b: 2 }) trace.push(slot);
        for ({ value: slot = 3 } of [{}, { value: 4 }]) trace.push(slot);
        for await (slot of [Promise.resolve(5), 6]) trace.push(slot);
        function* values() { try { yield 7; yield 8 } finally { trace.push('closed') } }
        for (slot of values()) { trace.push(slot); break; }
        return trace;
    })()`)
})

test('preserves unbound calls, optional calls, tags, constructors, spread and property receivers', async () => {
    await assertEquivalent(`(() => {
        const trace = [];
        slot = function(...args) { trace.push(this === undefined, args.length); return args.length };
        slot(...[1, 2]); (slot)?.(3); ((slot))\`tag\${4}\`;
        ({ slot }).slot(5);
        slot = class { constructor(value) { this.value = value } };
        trace.push(new slot(6).value, new (slot)(7).value);
        slot = null; trace.push(slot?.());
        slot = { read() { return this.value }, value: 8 };
        trace.push(slot.read());
        return trace;
    })()`)
})

for (const value of [
    'function() { return slot }',
    '() => slot',
    'async () => slot',
    'function*() { yield slot }',
    'class { static capturedName = this.name; static previous = slot }'
]) {
    test(`preserves anonymous name inference for ${value}`, async () => {
        for (const assignment of [`slot = (${value})`, `slot ||= (${value})`, `({ slot = (${value}) } = {})`]) {
            await assertEquivalent(
                `(() => { slot = null; ${assignment}; const value = slot; slot = 42; return [value.name, value.capturedName, value.previous] })()`
            )
        }
    })
}

test('handles __proto__ names and nested inference without adding function self-bindings', async () => {
    await assertEquivalent(`(() => {
        Object.defineProperty(globalThis, '__proto__', { value: null, writable: true, configurable: true });
        __proto__ = function() { return __proto__ };
        const first = __proto__; __proto__ = 42;
        slot = () => slot = () => typeof slot;
        const outer = slot; const inner = outer(); slot = 42;
        return [first.name, first(), outer.name, inner.name, inner()];
    })()`)
    await assertEquivalent(`(() => { slot = function named() { return named.name }; return [slot.name, slot()] })()`)
})

for (const target of ['native', 'namespace']) {
    test(`preserves ${target} __proto__ shorthand data properties without changing the object prototype`, async () => {
        for (const value of ['42', 'null', '{ marker: 1 }']) {
            // Remove inherited namespace properties only for the native case, so __proto__ must use the host fallback.
            const initialize =
                target === 'native'
                    ? 'Object.setPrototypeOf(globalThis, null);'
                    : `Object.defineProperty(globalThis, '__proto__', { value: ${value} });`
            const setup = target === 'native' ? `Object.defineProperty(this, '__proto__', { value: ${value} });` : ''
            const code = `(() => {
                ${initialize}
                const object = { __proto__ };
                return [Object.getOwnPropertyDescriptor(object, '__proto__'), Object.getPrototypeOf(object) === Object.prototype];
            })()`
            const expected = await observe(code, false, setup)
            assert.ok('value' in expected.result, 'Native oracle must complete')
            assert.deepEqual((await observe(code, true, setup)).result, expected.result, target)
        }
    })
}

test('allows repeated __proto__ shorthand keys, explicit prototypes and destructuring defaults', async () => {
    await assertEquivalent(`(() => {
        Object.defineProperty(globalThis, '__proto__', { value: 1, writable: true });
        const repeated = { __proto__, __proto__ };
        const explicit = { __proto__, __proto__: null };
        const first = ({ __proto__ } = { ['__proto__']: 2 });
        const assigned = __proto__;
        ({ __proto__ = 3 } = Object.create(null));
        const defaulted = __proto__;
        ({ __proto__ = () => 4 } = Object.create(null));
        return [
            Object.keys(repeated), repeated.__proto__,
            Object.keys(explicit), explicit.__proto__, Object.getPrototypeOf(explicit),
            first.__proto__, assigned, defaulted, __proto__.name, __proto__()
        ];
    })()`)
})

test('preserves missing names, present undefined, readonly globals and TDZ', async () => {
    await assertEquivalent(`(() => {
        const trace = [typeof missingBinding, typeof ((missingBinding)), typeof undefined];
        for (const action of [() => missingBinding, () => missingBinding(), () => ++missingBinding, () => missingBinding = 1, () => undefined = 1]) {
            try { action() } catch (error) { trace.push(error.name) }
        }
        try { typeof missingBinding.value } catch (error) { trace.push(error.name) }
        globalThis.createdLater = undefined;
        trace.push(createdLater, typeof createdLater);
        globalThis.createdLater = 42;
        trace.push(createdLater);
        return trace;
    })()`)
    for (const code of [
        '(() => { Math; let Math; })()',
        '((slot = slot) => 0)()',
        '(() => { const Type = class Math extends Math {}; })()'
    ]) {
        for (const transformed of [false, true]) {
            assert.deepEqual((await observe(code, transformed, '')).result, { error: 'ReferenceError' })
        }
    }
})

test('preserves accessor errors and get/set order without eager native probes', async () => {
    const code = `(() => { const first = slot++; const second = (slot += 3); return [first, second, typeof slot, trace] })()`
    const setup = `this.trace = []; let current = 1; Object.defineProperty(this, 'slot', {
        configurable: true,
        get() { trace.push('get'); return current },
        set(value) { trace.push('set', value); current = value }
    });`
    const expected = await observe(code, false, setup)
    assert.ok('value' in expected.result)
    assert.deepEqual((await observe(code, true, setup)).result, expected.result)
    for (const code of ['(() => slot)()', '(() => typeof slot)()', '(() => { slot = 1 })()']) {
        const setup =
            "Object.defineProperty(this, 'slot', { get() { throw new RangeError('get') }, set() { throw new RangeError('set') }, configurable: true });"
        assert.deepEqual((await observe(code, true, setup)).result, { error: 'RangeError' })
    }
})

test('does not invoke reflection helpers patched by application code', async () => {
    await assertEquivalent(`(() => {
        Object.defineProperty(Object.prototype, '__proto__', { set() { throw new Error('patched prototype setter') } });
        Reflect.get = Reflect.set = Object.defineProperty = Object.create = Object.setPrototypeOf = () => { throw new Error('patched') };
        slot = 3;
        return [slot, Math.max(1, 2), typeof missingBinding];
    })()`)
})

test('observes readonly and accessor descriptor changes during the RHS', async () => {
    for (const change of [
        "Object.defineProperty(root, 'globalThis', { value: 1, writable: false })",
        "Object.defineProperty(root, 'globalThis', { get() { return 1 }, set() { throw new RangeError('set') } })"
    ]) {
        await assertEquivalent(
            `(() => { const root = globalThis; const trace = []; try { globalThis = (${change}, trace.push('rhs'), 2) } catch (error) { trace.push(error.name) } return trace })()`
        )
    }
})

test('keeps the selected namespace property target when the RHS deletes it, rather than switching to native', async () => {
    // Namespace targets have ordinary property semantics: deletion followed by a write recreates that selected property.
    // They are not the host's GlobalEnvironmentRecord, whose strict binding write can instead throw after deletion.
    const result = await observe(
        `(() => {
        const root = globalThis;
        const assigned = (globalThis = (delete root.globalThis, 2));
        root.slot = 8;
        const added = (slot += (delete root.slot, 3));
        const managed = slot;
        delete root.slot;
        return [assigned, root.globalThis, added, managed, slot];
    })()`,
        true,
        ''
    )
    assert.deepEqual(result.result, { value: [2, 2, 11, 11, 0] })
})

test('does not redirect a native assignment when the RHS adds a namespace property', async () => {
    const result = await observe(
        `(() => {
        const root = globalThis;
        const assigned = (slot = (root.slot = 100, 2));
        const managed = slot;
        delete root.slot;
        const native = slot;
        const trace = [];
        try { missing = (root.missing = 1, 2) } catch (error) { trace.push(error.name) }
        return [assigned, managed, native, root.missing, trace];
    })()`,
        true,
        ''
    )
    assert.deepEqual(result.result, { value: [2, 100, 2, 1, ['ReferenceError']] })
})

test('preserves ASI, including plain reads, assignments, typeof and single-statement control-flow bodies', async () => {
    await assertEquivalent(`(() => {
        const trace = [];
        slot = () => trace.push('call');
        trace.push('before')
        slot()
        trace.push('read')
        Math
        trace.push('assign')
        slot = () => trace.push('tag')
        slot\`value\`
        trace.push('typeof')
        typeof (slot)
        if (false) slot(); else trace.push('else');
        for (let i = 0; i < 1; i++) slot();
        do slot(); while (false);
        label: slot();
        return trace;
    })()`)
})

// A bare initializer selects the native slot; globalThis creates a namespace override for subsequent free references.
for (const target of ['slot', 'globalThis.slot']) {
    test(`preserves ASI after inferred arrow names before arrays, calls and templates (${target})`, async () => {
        for (const operator of ['=', '&&=', '||=', '??=']) {
            for (const next of [
                '[1].forEach(value => trace.push(value))',
                '(() => trace.push("call"))()',
                '`plain template`'
            ]) {
                await assertEquivalent(`(() => {
                    const trace = [];
                    ${target} = ${operator === '&&=' ? '1' : 'null'};
                    slot ${operator} () => { trace.push('unexpected invocation') }
                    ${next}
                    return [slot.name, trace];
                })()`)
            }
        }
    })
}

test('terminates inferred-name wrappers once, outside nested suffixes and never inside loop headers', async () => {
    await assertEquivalent(`(() => {
        const trace = [];
        if (true) slot = () => slot = () => Math
        else trace.push('wrong');
        const outer = slot;
        const inner = outer();
        trace.push(outer.name, inner.name, inner().max(1, 2));
        if (true) slot = () => slot = () => {}
        else trace.push('wrong');
        trace.push(slot.name, slot().name);
        const declared = slot = () => {}
        [3].forEach(value => trace.push(value));
        trace.push(declared.name);
        function read() { return slot = () => {}
            [4].forEach(value => trace.push(value));
        }
        trace.push(read().name);
        try { throw slot = () => {}
            [5].forEach(value => trace.push(value));
        } catch (error) { trace.push(error.name) }
        for (slot = () => 6; false;) {}
        trace.push(slot.name, slot());
        return trace;
    })()`)
    const source = 'export default slot = () => {}\n[1].forEach(() => {});'
    for (const preserveParens of [false, true]) {
        assert.deepEqual(
            parse(rewrite(source, preserveParens).code, preserveParens).body.map((node) => node.type),
            ['ExportDefaultDeclaration', 'ExpressionStatement', 'FunctionDeclaration', 'VariableDeclaration']
        )
    }
})

test('supports reads and writes through cyclic ESM calls before module evaluation, without native globalThis', () => {
    const a = rewrite(
        'import "./b.mjs"; export function answer() { nativeSlot += (0, 1); return Math.max(nativeSlot, 1) } export const noArguments = typeof arguments;',
        false
    )
    assert.ok(a.alias)
    const output = runMemoryModules(
        {
            'runtime.mjs': `${runtimeSource}\nexport { miniGlobal };`,
            'a.mjs': `import { miniGlobal as ${a.alias} } from './runtime.mjs';\n${a.code}`,
            'b.mjs': 'import { answer } from "./a.mjs"; export const early = answer();'
        },
        `
        globalThis.nativeSlot = 0;
        delete globalThis.globalThis;
        const module = await import('fixture:/a.mjs');
        const dependency = await import('fixture:/b.mjs');
        const runtime = await import('fixture:/runtime.mjs');
        const values = [dependency.early, module.answer(), module.noArguments];
        runtime.miniGlobal.Math = { max() { return 99 } };
        values.push(module.answer());
        console.log(JSON.stringify(values));
    `,
        []
    )
    assert.deepEqual(JSON.parse(output), [1, 2, 'undefined', 99])
})

test('keeps analysis bounded across deep scopes, many vars and large parameter lists', () => {
    for (const depth of [8, 64, 256]) {
        const source = `${'{ let local;'.repeat(depth)}${'var repeated;'.repeat(1000)}${'Math; fetch;'.repeat(500)}${'}'.repeat(depth)}`
        assertNames(source, ['Math', 'fetch'])
    }
    const parameters = Array.from({ length: 1000 }, (_, index) => `local${index}`).join(', ')
    assertNames(`function run(${parameters}) { return [${parameters}, vendorBridge] }`, ['vendorBridge'])
})

test('restores zero-count bindings across many sibling scopes without leaking locals', () => {
    const siblings = Array.from(
        { length: 1000 },
        (_, index) => `function run${index}(slot) {
            const next = slot;
            { let slot; slot; next; }
            return slot;
        }`
    ).join('\n')
    assertNames(siblings, [])
    assertNames(`${siblings}\nslot; next; arguments;`, ['slot', 'next', 'arguments'])
    assertNames(`let slot; ${siblings}\nslot; next;`, ['next'])
})

test('resolves later enclosing declarations before editing queued reads, writes and inferred names', () => {
    const code = `
        function run() {
            function nested() {
                slot = () => slot;
                return { slot, other };
            }
            { var slot; }
            let other;
            return nested;
        }
        run();
    `
    assertNames(code, [])
    assertNames(`${code}\nslot; other;`, ['slot', 'other'])
})

test('traverses AST children once, then resolves references and allocates aliases without revisiting them', () => {
    const source = 'function read() { return [later, Math] } const later = 1; function reserve(__miniGlobal0) {}'
    const program = parse(source, false)
    const body = program.body
    const declaration = body[0]
    assert.ok(declaration.type === 'FunctionDeclaration' && declaration.body)
    const statement = declaration.body.body[0]
    assert.ok(statement.type === 'ReturnStatement' && statement.argument?.type === 'ArrayExpression')
    const array = statement.argument
    const elements = array.elements
    // Count only traversal-owned child accesses, not declaration/pattern scans or emitted-code parsing.
    let bodyReads = 0
    let elementReads = 0
    Object.defineProperty(program, 'body', {
        get() {
            bodyReads++
            return body
        }
    })
    Object.defineProperty(array, 'elements', {
        get() {
            elementReads++
            return elements
        }
    })
    const editor = new RolldownMagicString(source)
    const alias = rewriteGlobal(program, editor)
    assert.equal(bodyReads, 1)
    assert.equal(elementReads, 1)
    assert.equal(alias, '__miniGlobal1')
    assert.equal(
        editor.toString(),
        `function read() { return [later, ("Math" in ${alias} ? ${alias}.Math : Math)] } const later = 1; function reserve(__miniGlobal0) {}`
    )
    parse(editor.toString(), false)
})

test('combines leading ASI repair with overwrites instead of adding one editor call per statement', (context) => {
    const source = 'visit()\nslot++\nMath\n'
    // Instrument the caller-owned editor without changing its behavior; operation counts are deterministic.
    const editor = new RolldownMagicString(source)
    const prependLeft = context.mock.method(editor, 'prependLeft')
    const overwrite = context.mock.method(editor, 'overwrite')
    const alias = rewriteGlobal(parse(source, false), editor)
    assert.ok(alias)
    assert.equal(prependLeft.mock.callCount(), 0)
    assert.equal(overwrite.mock.callCount(), 3)
    assert.equal(
        editor.toString(),
        `;("visit" in ${alias} ? ${alias}.visit : visit)()\n;("slot" in ${alias} ? ${alias}.slot++ : slot++);\n;("Math" in ${alias} ? ${alias}.Math : Math);\n`
    )
    parse(editor.toString(), false)
})

test('does not confuse other unary operators or member updates with bare typeof/update operations', async () => {
    await assertEquivalent(`(() => {
        slot = 7;
        const values = [+slot, -slot, !slot, ~slot, void slot, typeof -slot, typeof !slot];
        slot = { value: 1 };
        values.push(slot.value++, ++slot.value, delete slot.value, typeof slot.value);
        return values;
    })()`)
    for (const operation of ['+missing', '-missing', '!missing', '~missing', 'void missing', 'typeof missing.value']) {
        assert.deepEqual((await observe(`(() => ${operation})()`, true, '')).result, { error: 'ReferenceError' })
    }
})

test('observes namespace additions, undefined, getters and deletion without snapshotting native bindings', async () => {
    const result = await observe(
        `(() => {
        const root = globalThis;
        const nativeMath = Math;
        const trace = [];
        root.Math = { max() { return 99 } };
        trace.push(Math.max(1, 2));
        delete root.Math;
        trace.push(Math === nativeMath);
        root.futureApi = undefined;
        trace.push(futureApi, typeof futureApi);
        Object.defineProperty(root, 'futureApi', {
            configurable: true,
            get() { trace.push('get'); return 42 }
        });
        const first = futureApi;
        const kind = typeof futureApi;
        delete root.futureApi;
        trace.push(first, kind, typeof futureApi);
        try { futureApi } catch (error) { trace.push(error.name) }
        return trace;
    })()`,
        true,
        ''
    )
    assert.deepEqual(result.result, {
        value: [99, true, undefined, 'undefined', 'get', 'get', 42, 'number', 'undefined', 'ReferenceError']
    })
})

test('uses native lexical const and TDZ bindings without eagerly reading assignment targets', async () => {
    for (const setup of ['const slot = 1;', 'let slot = 1;']) {
        const code = `(() => { const trace = []; try { slot = (trace.push('rhs'), 2) } catch (error) { trace.push(error.name) } return trace })()`
        const expected = await observe(code, false, setup)
        assert.deepEqual((await observe(code, true, setup)).result, expected.result)
    }
    const code = '(() => { trace.push("rhs-before-set"); slot = 1; })()'
    const setup = `this.trace = []; Object.defineProperty(this, 'slot', { get() { throw new Error('must not read') }, set(value) { trace.push(value) } });`
    assert.deepEqual((await observe(code, true, setup)).result, { value: undefined })
    await assertEquivalent(`(() => {
        function write(value = (slot = 3)) { var slot = 9; return [value, slot] }
        return [write(), slot];
    })()`)
})

test('keeps native getter/setter routing fixed even when the getter installs a namespace override', async () => {
    const result = await observe(
        `(() => {
        const root = globalThis;
        const trace = [];
        Object.defineProperty(host, 'slot', {
            get() { trace.push('get'); root.slot = 99; return 2 },
            set(value) { trace.push('set', value) }
        });
        const value = (slot += 3);
        return [value, slot, trace];
    })()`,
        true,
        'this.host = this;'
    )
    assert.deepEqual(result.result, { value: [5, 99, ['get', 'set', 5]] })
})

test('uses direct updates and unbound calls for namespace properties as well as native names', async () => {
    for (const operation of ['++slot', 'slot++', '--slot', 'slot--']) {
        for (const initial of ['5n', '"5"', '{ valueOf() { trace.push("coerce"); return 5 } }']) {
            await assertEquivalent(`(() => {
                const trace = [];
                globalThis.slot = ${initial};
                const result = ${operation};
                return [result, slot, trace];
            })()`)
        }
    }
    await assertEquivalent(`(() => {
        const root = globalThis;
        root.slot = function(...values) { return [this === undefined, values.length] };
        const values = [slot(1), (slot)?.(2), ((slot))\`tag\${3}\`, ({ slot }).slot(4)];
        root.slot = class { constructor(value) { this.value = value; this.same = new.target === slot } };
        const instance = new slot(7);
        root.slot = undefined;
        return [values, instance.value, instance.same, slot?.()];
    })()`)
})

test('allocates an assignment adapter only on first native use and reuses it across override changes', () => {
    const result = rewrite('(value) => { slot = value; return slot }', false)
    const footer = parse(result.code, false).body.at(-1)
    assert.ok(footer?.type === 'VariableDeclaration')
    assert.equal(footer.kind, 'var')
    assert.equal(footer.declarations.length, 1)
    const declaration = footer.declarations[0]
    assert.equal(declaration.init, null)
    assert.ok(declaration.id.type === 'Identifier')
    const context = createContext(constants.DONT_CONTEXTIFY)
    new Script('this.slot = 0; delete this.globalThis;').runInContext(context)
    const namespace: object = new Script(`(() => { ${runtimeSource}; return miniGlobal })()`).runInContext(context)
    const instance: { write: (value: number) => number; target: () => object | undefined } = new Script(`
        "use strict";
        (${result.alias}) => {
            const write = ${result.code};
            return { write, target: () => ${declaration.id.name} };
        }
    `).runInContext(context)(namespace)
    assert.equal(instance.target(), undefined)
    Reflect.set(namespace, 'slot', 10)
    assert.equal(instance.write(11), 11)
    assert.equal(instance.target(), undefined)
    assert.equal(context.slot, 0)
    Reflect.deleteProperty(namespace, 'slot')
    assert.equal(instance.write(1), 1)
    const target = instance.target()
    assert.ok(target)
    assert.deepEqual(Object.getOwnPropertyNames(target), [])
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'slot')
    assert.equal(typeof descriptor?.get, 'function')
    assert.equal(typeof descriptor?.set, 'function')
    assert.equal(instance.write(2), 2)
    assert.equal(instance.target(), target)
    Reflect.set(namespace, 'slot', 20)
    assert.equal(instance.write(21), 21)
    assert.equal(context.slot, 2)
    Reflect.deleteProperty(namespace, 'slot')
    assert.equal(instance.write(3), 3)
    assert.equal(instance.target(), target)
})

test('does not retain caller closures through cached native assignment adapters', () => {
    const source = `export function attach(data) {
        subscribe(() => data);
        slot = 1;
    }`
    const result = rewrite(source, false)
    assert.ok(result.alias)
    const output = runMemoryModules(
        {
            'runtime.mjs': `${runtimeSource}\nexport { miniGlobal };`,
            'original.mjs': source,
            'rewritten.mjs': `import { miniGlobal as ${result.alias} } from './runtime.mjs';\n${result.code}`
        },
        `
        import assert from 'node:assert/strict';
        const host = globalThis;
        host.slot = 0;
        // The subscription is the application's only strong reference to each caller's data.
        host.callback = null;
        host.subscribe = callback => { host.callback = callback };
        delete host.globalThis;
        const original = await import('fixture:/original.mjs');
        const rewritten = await import('fixture:/rewritten.mjs');
        function probe(module) {
            const data = { payload: new Array(10000).fill('payload') };
            module.attach(data);
            assert.equal(host.callback(), data);
            const reference = new WeakRef(data);
            host.callback = null;
            return reference;
        }
        const references = [probe(original), probe(rewritten)];
        // Leave the WeakRef creation job before forcing collection; do not dereference between GC passes.
        for (let pass = 0; pass < 10; pass++) {
            await new Promise(resolve => setImmediate(resolve));
            gc();
        }
        console.log(JSON.stringify(references.map(reference => reference.deref() === undefined)));
    `,
        ['--expose-gc']
    )
    assert.deepEqual(JSON.parse(output), [true, true], 'unsubscribed data must be collectable in both modules')
})

test('retains the selected assignment target across await and yield without moving the RHS into a callback', async () => {
    const result = await observe(
        `(async () => {
        const root = globalThis;
        slot = 1;
        let finish;
        const pending = (async () => slot += await new Promise(resolve => { finish = resolve }))();
        root.slot = 100;
        finish(2);
        const added = await pending;
        const managed = slot;
        delete root.slot;
        const native = slot;
        function* assign() { return slot = yield 4 }
        const iterator = assign();
        const yielded = iterator.next().value;
        root.slot = 200;
        const assigned = iterator.next(9).value;
        const override = slot;
        delete root.slot;
        return [added, managed, native, yielded, assigned, override, slot];
    })()`,
        true,
        ''
    )
    assert.deepEqual(result.result, { value: [3, 100, 3, 4, 9, 200, 9] })
    await assertEquivalent(`(async () => {
        slot = 1;
        const resumes = [];
        const add = async () => slot += await new Promise(resolve => resumes.push(resolve));
        const first = add(), second = add();
        resumes[1](20);
        const secondValue = await second;
        resumes[0](10);
        return [await first, secondValue, slot];
    })()`)
})

test('native adapter accessors support constructor and __proto__ names without special-case binding lists', async () => {
    const setup = `
        Object.defineProperty(this, 'constructor', { value: 0, writable: true });
        Object.defineProperty(this, '__proto__', { value: 0, writable: true });
    `
    const result = await observe(
        `(() => {
        Object.setPrototypeOf(globalThis, null);
        constructor = 7;
        __proto__ = 8;
        constructor += 1;
        __proto__ += 1;
        return [constructor, __proto__];
    })()`,
        true,
        setup
    )
    assert.deepEqual(result.result, { value: [8, 9] })
})

test('keeps pattern defaults in their original async/generator, super and arguments environments', async () => {
    await assertEquivalent(`(async () => {
        class Base { async read(value) { return value + 1 } }
        class Derived extends Base {
            async write(value) { [slot = await super.read(arguments[0])] = []; return slot }
        }
        const first = await new Derived().write(6);
        function* assign() { ({ value: slot = yield 1 } = {}); return slot }
        const iterator = assign();
        return [first, iterator.next().value, iterator.next(8).value];
    })()`)
})

test('selects each destructuring target at its own evaluation point, including defaults and iterator cleanup', async () => {
    const result = await observe(
        `(() => {
        const root = globalThis;
        const source = {
            get value() { root.slot = 100; return undefined }
        };
        ({ value: slot = 3 } = source);
        const managed = slot;
        delete root.slot;
        const native = slot;
        const trace = [];
        function* values() { try { yield 7; yield 8 } finally { trace.push('closed') } }
        Object.defineProperty(root, 'slot', { value: 0, writable: false, configurable: true });
        try { [slot] = values() } catch (error) { trace.push(error.name) }
        return [managed, native, trace];
    })()`,
        true,
        ''
    )
    assert.deepEqual(result.result, { value: [100, 3, ['closed', 'TypeError']] })
})

test('preserves ASI after postfix updates in statements, declarations, returns and exports', async () => {
    await assertEquivalent(`(() => {
        const trace = [];
        slot = 1;
        slot++
        [3].forEach(value => trace.push(value))
        slot++
        (() => trace.push('call'))()
        const previous = slot++
        [4].forEach(value => trace.push(value))
        function read() { return slot++
            [5].forEach(value => trace.push(value))
        }
        if (true) slot++
        else trace.push('wrong');
        for (var index = slot; index < 6; index++) trace.push(index);
        for (var value of [1]) trace.push(value);
        for (var key in { a: 1 }) trace.push(key);
        return [previous, read(), slot, trace];
    })()`)
    const source = 'export default slot++\n[1].forEach(() => {});'
    assert.deepEqual(
        parse(rewrite(source, false).code, false).body.map((node) => node.type),
        ['ExportDefaultDeclaration', 'ExpressionStatement']
    )
})

for (const target of ['slot', 'globalThis.slot']) {
    test(`preserves ASI in class fields before computed methods and fields (${target})`, async () => {
        await assertEquivalent(`(() => {
            ${target} = 1;
            class Type {
                static first = slot++
                static ['read']() { return this.first }
                #previous = slot++
                ['read']() { return this.#previous }
                next = slot--
                ['last'] = slot++
                callback = slot = () => {}
                ['name']() { return this.callback.name }
            }
            const instance = new Type();
            return [Type.read(), instance.read(), instance.next, instance.last, instance.name()];
        })()`)
        for (const preserveParens of [false, true]) {
            rewrite(`${target} = 1; class Type { field = slot++\n["method"]() {} }`, preserveParens)
        }
    })
}

test('emits nested assignment RHSs once, with linear output growth rather than duplicated branches', async () => {
    // Geometric input sizes catch recursive branch duplication without timing-dependent assertions.
    const sizes = [8, 64, 256].map((depth) => {
        const source = `(() => { slot = ${'slot += ('.repeat(depth)}1${')'.repeat(depth)}; return slot })()`
        const result = rewrite(source, false)
        assert.equal((result.code.match(/\+=/g) ?? []).length, depth)
        assert.equal(parse(result.code, false).body.filter((node) => node.type === 'VariableDeclaration').length, 1)
        assert.ok(result.code.length < source.length * 30)
        return result.code.length
    })
    assert.ok(sizes[2] < sizes[1] * 4.1)
    await assertEquivalent(
        `(() => { const trace = []; slot = 1; slot += (slot += (trace.push('rhs'), 2)); return [slot, trace] })()`
    )
})

test('leaves the original AST unchanged and source-map generation with the caller', () => {
    const code = 'const host = Math;\nconst object = { fetch };\n'
    const program = parse(code, false)
    const before = JSON.stringify(program)
    // The caller owns this mutable buffer and generates its map after all source edits and import insertion.
    const editor = new RolldownMagicString(code, { filename: 'module.js' })
    assert.ok(rewriteGlobal(program, editor))
    assert.equal(JSON.stringify(program), before)
    const map = editor.generateMap({ source: 'module.js', includeContent: true, hires: 'boundary' })
    assert.deepEqual(map.sources, ['module.js'])
    assert.deepEqual(map.sourcesContent, [code])
    assert.ok(map.mappings.length > 0)
    assert.equal(rewrite(code, false).code, editor.toString())
})
