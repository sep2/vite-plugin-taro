import assert from 'node:assert/strict'
import { SourceMap } from 'node:module'
import test from 'node:test'
import { type PluginItem, type PluginTarget, transformSync } from '@babel/core'
import transformDynamicImport from '@babel/plugin-transform-dynamic-import'
import transformModulesSystemjs from '@babel/plugin-transform-modules-systemjs'
import { build } from 'rolldown'
import { transformSystemJs } from './system-js.ts'

type ModuleNamespace = Record<string, unknown>
type ExportBinding = (nameOrValues: string | ModuleNamespace, value?: unknown) => unknown
type RegistrationDeclaration = (
    exportBinding: ExportBinding,
    context: Readonly<{ import(reference: string): Promise<ModuleNamespace>; meta: Readonly<{ url: string }> }>
) => Readonly<{
    execute(): unknown
    setters?: Array<(namespace: ModuleNamespace) => void>
}>
type Registration = readonly [readonly string[], RegistrationDeclaration]
type Instance = Readonly<{
    beforeExecute: ModuleNamespace
    namespace: ModuleNamespace
    publications: readonly string[]
}>

/** Babel is retained only as the semantic oracle for observable SystemJS behavior and publication order. */
const babelPlugins: PluginItem[] = [transformDynamicImport, transformModulesSystemjs as PluginTarget]

test('matches Babel for mutable exports, aliases, shadowing, and declaration-time functions', async () => {
    const code = await buildFinalChunk(`
        let count = 1
        function prefix() { return ++count }
        function postfix() { return count++ }
        function assign(value) { return count = value }
        function shadow() { let count = 20; return count++ }
        let unset
        export { assign, count, count as value, postfix, prefix, shadow, unset }
    `)

    await compareOracle(
        code,
        async ({ namespace }) => {
            const prefix = requireFunction(namespace.prefix)
            const postfix = requireFunction(namespace.postfix)
            const assign = requireFunction(namespace.assign)
            const shadow = requireFunction(namespace.shadow)
            const observations = [namespace.count, namespace.value, namespace.unset]
            observations.push(prefix(), namespace.count, namespace.value)
            observations.push(postfix(), namespace.count, namespace.value)
            observations.push(assign(9), namespace.count, namespace.value)
            observations.push(shadow(), namespace.count, namespace.value)
            return observations
        },
        undefined
    )
})

test('matches Babel across compound, logical, nested, prefix, and postfix export writes', async () => {
    const code = await buildFinalChunk(`
        let value = 1
        function mutate() {
            const results = []
            results.push(value += 2)
            results.push(value *= 3)
            results.push(value &&= 4)
            results.push(value ||= 5)
            results.push(value ??= 6)
            results.push(--value)
            results.push(value--)
            results.push((value = 8) + (value = 9))
            return results
        }
        function shadow(value) { value += 100; return value }
        export { mutate, shadow, value, value as alias }
    `)

    await compareOracle(
        code,
        async ({ namespace }) => {
            const mutate = requireFunction(namespace.mutate)
            const shadow = requireFunction(namespace.shadow)
            return [mutate(), namespace.value, namespace.alias, shadow(2), namespace.value]
        },
        undefined
    )
})

test('matches Babel for property updates without republishing exported objects', async () => {
    const code = await buildFinalChunk(`
        const state = { value: 1 }
        function mutate() {
            return [state.value++, ++state.value, state['value']--, --state['value']]
        }
        export { mutate, state }
    `)

    await compareOracle(
        code,
        async ({ namespace }) => {
            const mutate = requireFunction(namespace.mutate)
            const results = mutate()
            assert.deepEqual(results, [1, 3, 3, 1])
            assert.deepEqual(namespace.state, { value: 1 })
            return [results, namespace.state]
        },
        undefined
    )
})

test('matches Babel for module var declarations nested in control flow', async () => {
    const code = `
        if (true) { var count = 1; }
        for (var index = 0; index < 2; index++) { count += index; }
        for (var key in { a: 1 }) { count += key.length; }
        for (var item of [2]) { count += item; }
        function read() { return [count, index, key, item]; }
        export { count, index, item, key, read };
    `

    await compareOracle(
        code,
        async ({ namespace }) => {
            const read = requireFunction(namespace.read)
            return [read(), namespace.count, namespace.index, namespace.key, namespace.item]
        },
        undefined
    )
})

for (const sourcemap of [false, true]) {
    test(`indexes direct and nested declarations without changing export timing or order (maps: ${sourcemap})`, async () => {
        const code = [
            'var first;',
            'if (true) { var nestedBefore; var nestedValue = 2; }',
            'let second;',
            'var directValue = 3, sibling = directValue + nestedValue;',
            'if (true) { var nestedAfter; }',
            'const fixed = sibling * 2;',
            'for (var index = 0; index < 1; index++) { var loopValue = index; }',
            'function read() { var first = 99; return [nestedValue, directValue, sibling, fixed, first]; }',
            'export { first, first as alias, nestedBefore, second, nestedAfter, directValue, nestedValue, sibling, fixed, index, loopValue, read };'
        ].join('\n')
        const filename = 'assets/declarations.js'
        const result = transformSystemJs({
            code,
            filename,
            format: 'commonjs-registration',
            sourcemap,
            resolveReference: (reference) => reference
        })
        const actual = await instantiate(evaluateCommonJsRegistration(result.code), new Map())
        const babel = await instantiate(evaluateSystemRegistration(compileWithBabel(code)), new Map())
        assert.deepEqual(actual.beforeExecute, babel.beforeExecute)
        assert.deepEqual(actual.publications, babel.publications)
        assert.deepEqual(Object.keys(actual.beforeExecute), [
            'read',
            'first',
            'alias',
            'nestedBefore',
            'second',
            'nestedAfter'
        ])
        assert.deepEqual(actual.publications.slice(6), [
            'nestedValue',
            'directValue',
            'sibling',
            'fixed',
            'index',
            'loopValue',
            'index'
        ])
        assert.deepEqual(requireFunction(actual.namespace.read)(), [2, 3, 5, 10, 99])
        assert.equal(actual.namespace.first, undefined)
        assert.equal(actual.namespace.alias, undefined)
        assert.equal(actual.namespace.index, 1)
        assert.equal(actual.namespace.loopValue, 0)

        if (!sourcemap) {
            assert.equal(result.map, null)
            return
        }
        assert.ok(result.map)
        assert.deepEqual(result.map.sources, [filename])
        assert.deepEqual(result.map.sourcesContent, [code])
        const map = new SourceMap({
            file: filename,
            version: 3,
            sources: [filename],
            sourcesContent: [code],
            names: [],
            mappings: result.map.mappings,
            sourceRoot: ''
        })
        for (const text of ['nestedValue = 2', 'directValue = 3', 'directValue + nestedValue', 'first = 99']) {
            const entry = map.findEntry(...position(result.code, text))
            assert.ok('originalLine' in entry)
            assert.equal(entry.originalSource, filename)
            assert.deepEqual([entry.originalLine, entry.originalColumn], position(code, text))
        }
    })
}

test('indexes a large interleaved declaration set without duplicate initialization or publication', async () => {
    const declarations = Array.from({ length: 512 }, (_, value) => ({
        direct: `direct${value}`,
        nested: `nested${value}`,
        value
    }))
    const names = declarations.flatMap(({ direct, nested }) => [direct, nested])
    // Generate and execute all fixture source in memory; no disk fixtures or timing-sensitive assertions are needed.
    const code = `${declarations
        .map(({ direct, nested, value }) => `var ${direct} = ${value}; if (true) { var ${nested} = ${direct} + 1; }`)
        .join('\n')}\nexport { ${names.join(',')} };`
    const actual = await instantiate(evaluateCommonJsRegistration(compile(code).code), new Map())
    assert.deepEqual(actual.beforeExecute, {})
    assert.deepEqual(actual.publications, names)
    assert.deepEqual(
        actual.namespace,
        Object.fromEntries(
            declarations.flatMap(({ direct, nested, value }) => [
                [direct, value],
                [nested, value + 1]
            ])
        )
    )
})

for (const sourcemap of [false, true]) {
    for (const format of ['commonjs-registration', 'system-register'] as const) {
        test(`collects declaration order across blocks and loops without leaking nested scopes (${format}, maps: ${sourcemap})`, async () => {
            const code = [
                'var first;',
                'if (true) { let last; var branch, initialized = 2; }',
                'let second;',
                'for (var index = 0; index < 1; index++) { var loop; }',
                'for (var key in { entry: 1 }) { var fromIn; }',
                'for (var item of [3]) { var fromOf; }',
                'switch (1) { case 1: var switched; break; default: var skipped; }',
                'try { var tried; } catch (error) { var caught; } finally { var finished; }',
                'function read() { var last; return [initialized, index, key, item]; }',
                'const arrow = () => { var last; };',
                'class Local { static { var last; } method() { var last; } };',
                'var repeated;',
                'if (false) { var repeated; }',
                'var last;',
                'export { last, repeated, finished, caught, tried, skipped, switched, fromOf, item, fromIn, key, loop, index, second, branch, initialized, first as alias, first, read as get, read };'
            ].join('\n')
            const result = transformSystemJs({
                code,
                filename: 'assets/declarations.js',
                format,
                sourcemap,
                resolveReference: (reference) => reference
            })
            const actual = await instantiate(
                format === 'commonjs-registration'
                    ? evaluateCommonJsRegistration(result.code)
                    : evaluateSystemRegistration(result.code),
                new Map()
            )
            const babel = await instantiate(evaluateSystemRegistration(compileWithBabel(code)), new Map())
            assert.deepEqual(actual.beforeExecute, babel.beforeExecute)
            assert.deepEqual(actual.publications, babel.publications)
            // Export-list order is deliberately reversed; variable availability must follow declaration source order.
            assert.deepEqual(Object.keys(actual.beforeExecute), [
                'get',
                'read',
                'alias',
                'first',
                'branch',
                'second',
                'loop',
                'key',
                'fromIn',
                'item',
                'fromOf',
                'switched',
                'skipped',
                'tried',
                'caught',
                'finished',
                'repeated',
                'last'
            ])
            assert.deepEqual(requireFunction(actual.namespace.read)(), [2, 1, 'entry', 3])
            assert.deepEqual(requireFunction(actual.namespace.get)(), requireFunction(babel.namespace.get)())
            if (sourcemap) {
                assert.deepEqual(result.map?.sourcesContent, [code])
                assert.ok(result.map?.mappings)
            } else {
                assert.equal(result.map, null)
            }
        })
    }

    test(`does not sort a large interleaved module declaration list (maps: ${sourcemap})`, async () => {
        const declarations = Array.from({ length: 1024 }, (_, index) => ({
            direct: `direct${index}`,
            nested: `nested${index}`
        }))
        const names = declarations.flatMap(({ direct, nested }) => [direct, nested])
        // The fixture and observations stay entirely in memory, including the 2,048 declaration-time exports.
        const code = `${declarations
            .map(({ direct, nested }) => `var ${direct}; if (false) { var ${nested}; }`)
            .join('\n')}\nexport { ${names.toReversed().join(',')} };`
        const { output, sortedDeclarations } = compileWithDeclarationSortStats(code, sourcemap)
        const actual = await instantiate(evaluateCommonJsRegistration(output.code), new Map())
        assert.deepEqual(Object.keys(actual.beforeExecute), names)
        assert.deepEqual(actual.publications, names)
        assert.deepEqual(actual.namespace, Object.fromEntries(names.map((name) => [name, undefined])))
        assert.equal(sortedDeclarations, 0)
    })
}

test('matches Babel for imports, exported imports, dynamic imports, and import.meta', async () => {
    const code = `
        import defaultValue, * as all from './dependency.js';
        import { named as local } from './dependency.js';
        const read = () => [defaultValue, all.named, local];
        const load = () => import('./lazy.js');
        const url = import.meta.url;
        export { local as forwarded, load, read, url };
    `
    const dependencies = new Map<string, ModuleNamespace>([
        ['./dependency.js', { default: 3, named: 7 }],
        ['./lazy.js', { value: 11 }]
    ])

    await compareOracle(
        code,
        async ({ namespace }) => {
            const read = requireFunction(namespace.read)
            const load = requireFunction(namespace.load)
            return [read(), namespace.forwarded, namespace.url, await load()]
        },
        dependencies
    )
})

test('matches Babel for classes, destructured initialization, and collision-prone helper names', async () => {
    const code = `
        const __systemExport = 1;
        const __systemContext = 2;
        const __systemDependency0 = 3;
        const { first, nested: { second = 5 } } = { first: 4, nested: {} };
        class Counter { static value = first + second; }
        export { Counter, __systemContext, __systemDependency0, __systemExport, first, second };
    `

    await compareOracle(
        code,
        async ({ namespace }) => {
            const Counter = requireClass(namespace.Counter)
            return [
                namespace.__systemExport,
                namespace.__systemContext,
                namespace.__systemDependency0,
                namespace.first,
                namespace.second,
                Counter.value
            ]
        },
        undefined
    )
})

test('matches Babel for array holes and rest declarations', async () => {
    const code = `
        const [first, , ...rest] = [1, 2, 3, 4];
        export { first, rest };
    `

    await compareOracle(code, async ({ namespace }) => [namespace.first, namespace.rest], undefined)
})

test('allocates a dependency prefix beyond every concrete source collision', () => {
    const result = compile(`
        import { value } from './dependency.js';
        const __systemDependency0 = 'collision';
        export { __systemDependency0, value };
    `)

    assert.match(result.code, /function\(__systemDependency10\)/)
    assert.doesNotMatch(result.code, /function\(__systemDependency0\)/)
})

const nameAllocationCases = [
    {
        name: 'no dependencies',
        dependencies: 0,
        reserved: ['__systemDependency0', '__systemDependency10'],
        exportBinding: '__systemExport',
        context: '__systemContext',
        dependencyPrefix: '__systemDependency'
    },
    {
        name: 'unused prefix base and sparse helper suffixes',
        dependencies: 1,
        reserved: ['__systemDependency', '__systemContext1', '__systemExport1'],
        exportBinding: '__systemExport',
        context: '__systemContext',
        dependencyPrefix: '__systemDependency'
    },
    {
        name: 'first, middle, and last setter collisions',
        dependencies: 3,
        reserved: [
            '__systemContext',
            '__systemContext1',
            '__systemExport',
            '__systemExport1',
            '__systemDependency2',
            '__systemDependency10',
            '__systemDependency21'
        ],
        exportBinding: '__systemExport2',
        context: '__systemContext2',
        dependencyPrefix: '__systemDependency3'
    },
    {
        name: '1024 dependencies with late collisions',
        dependencies: 1024,
        reserved: ['__systemDependency1023', '__systemDependency1999', '__systemDependency2512'],
        exportBinding: '__systemExport',
        context: '__systemContext',
        dependencyPrefix: '__systemDependency3'
    }
]

for (const scenario of nameAllocationCases) {
    for (const sourcemap of [false, true]) {
        test(`allocates SystemJS names without temporary collections: ${scenario.name} (maps: ${sourcemap})`, async () => {
            const indices = Array.from({ length: scenario.dependencies }, (_, index) => index)
            const code = [
                ...indices.map((index) => `import { value as value${index} } from './dependency-${index}.js';`),
                ...scenario.reserved.map((name, index) => `const ${name} = 'authored-${index}';`),
                // This property name belongs only to the source-identifier set, not to any binding or export set.
                'const marker = { __systemNameAllocationSentinel: true };',
                `const values = [${indices.map((index) => `value${index}`).join(',')}];`,
                `const authored = [${scenario.reserved.join(',')}];`,
                'const url = import.meta.url;',
                "const load = () => import('./lazy.js');",
                'export { values, authored, url, load };'
            ].join('\n')
            const { output, stats } = compileWithNameAllocationStats(code, sourcemap)
            assert.ok(output.code.includes(`function(${scenario.exportBinding},${scenario.context})`))
            const setterNames = [...output.code.matchAll(/function\((__systemDependency\d+)\)\{/g)].map(
                (match) => match[1]
            )
            assert.deepEqual(
                setterNames,
                indices.map((index) => `${scenario.dependencyPrefix}${index}`)
            )

            const lazy = { value: 'lazy' }
            const dependencies = new Map<string, ModuleNamespace>([
                ...indices.map((index): [string, ModuleNamespace] => [`./dependency-${index}.js`, { value: index }]),
                ['./lazy.js', lazy]
            ])
            const registration = evaluateCommonJsRegistration(output.code)
            assert.deepEqual(
                registration[0],
                indices.map((index) => `./dependency-${index}.js`)
            )
            const instance = await instantiate(registration, dependencies)
            assert.deepEqual(instance.namespace.values, indices)
            assert.deepEqual(
                instance.namespace.authored,
                scenario.reserved.map((_, index) => `authored-${index}`)
            )
            assert.equal(instance.namespace.url, 'assets/chunk.js')
            assert.equal(await requireFunction(instance.namespace.load)(), lazy)
            if (sourcemap) {
                assert.deepEqual(output.map?.sourcesContent, [code])
                assert.ok(output.map?.mappings)
            } else {
                assert.equal(output.map, null)
            }
            assert.deepEqual(stats, { identifierSetIterations: 0, candidateArrays: 0, candidateArrayEntries: 0 })
        })
    }
}

test('avoids imported setter names and nested context/export bindings without changing published values', async () => {
    const code = [
        "import { value as __systemDependency0 } from './dependency.js';",
        'function inspect(__systemContext, __systemExport) {',
        '    return [__systemDependency0, import.meta.url, __systemContext, __systemExport];',
        '}',
        "const load = (__systemContext1) => import('./lazy.js');",
        'export { __systemDependency0, inspect, load };'
    ].join('\n')
    const output = compile(code)
    assert.match(output.code, /function\(__systemExport1,__systemContext2\)/)
    assert.match(output.code, /function\(__systemDependency10\)/)
    const lazy = { value: 9 }
    const instance = await instantiate(
        evaluateCommonJsRegistration(output.code),
        new Map([
            ['./dependency.js', { value: 7 }],
            ['./lazy.js', lazy]
        ])
    )
    assert.equal(instance.namespace.__systemDependency0, 7)
    assert.deepEqual(requireFunction(instance.namespace.inspect)('context', 'export'), [
        7,
        'assets/chunk.js',
        'context',
        'export'
    ])
    assert.equal(await requireFunction(instance.namespace.load)('unused'), lazy)
})

test('matches Babel for unexported object rest bindings consumed by a hoisted function', async () => {
    const code = `
        const { first, ...rest } = { first: 1, second: 2 };
        function read() { return [first, rest]; }
        export { read };
    `

    await compareOracle(
        code,
        async ({ namespace }) => Reflect.apply(requireFunction(namespace.read), undefined, []),
        undefined
    )
})

test('supports quoted import and export names through bracket member access', async () => {
    const code = `
        import { 'kebab-name' as kebab } from './dependency.js';
        export { kebab as 'public-name' };
    `
    const dependencies = new Map<string, ModuleNamespace>([['./dependency.js', { 'kebab-name': 42 }]])

    await compareOracle(code, async ({ namespace }) => namespace['public-name'], dependencies)
})

test('matches Babel for top-level this and lexical versus dynamic this', async () => {
    const code = `
        const moduleThis = this;
        const lexical = () => this;
        function dynamic() { return this; }
        export { dynamic, lexical, moduleThis };
    `

    await compareOracle(
        code,
        async ({ namespace }) => {
            const lexical = requireFunction(namespace.lexical)
            const dynamic = requireFunction(namespace.dynamic)
            const receiver = { marker: true }
            return [namespace.moduleThis, lexical(), Reflect.apply(dynamic, receiver, [])]
        },
        undefined
    )
})

test('matches Babel for top-level await', async () => {
    const code = `
        let value;
        value = await Promise.resolve(42);
        export { value };
    `

    await compareOracle(code, async ({ namespace }) => [namespace.value], undefined)
})

test('renders empty and local-only chunks without export notifications', () => {
    const empty = compile('')
    const localOnly = compile('const local = 1; class Local {}; void [local, Local]')

    assert.doesNotMatch(empty.code, /\bvar\s/)
    assert.doesNotMatch(localOnly.code, /__systemExport\(["']/)
})

test('resolves static and literal dynamic references by kind', () => {
    const references: Array<readonly [string, string]> = []
    const result = transformSystemJs({
        code: `import { value } from './dependency.js'; const load = () => import('./lazy.js'); export { load, value };`,
        filename: 'assets/root.js',
        format: 'commonjs-registration',
        sourcemap: false,
        resolveReference(reference, kind) {
            references.push([reference, kind])
            return reference.slice(2)
        }
    })
    const registration = evaluateCommonJsRegistration(result.code)

    assert.deepEqual(registration[0], ['dependency.js'])
    assert.match(result.code, /\.import\(["']lazy\.js["']\)/)
    assert.deepEqual(references, [
        ['./lazy.js', 'dynamic'],
        ['./dependency.js', 'static']
    ])
})

test('emits composable source maps while preserving hoisted function edits', async () => {
    const result = transformSystemJs({
        code: `let value = 1; function increment() { return value++; } export { increment, value };`,
        filename: 'assets/root.js',
        format: 'system-register',
        sourcemap: true,
        resolveReference(reference) {
            return reference
        }
    })

    const map = result.map
    assert.ok(map)
    assert.deepEqual(map.sources, ['assets/root.js'])
    assert.ok(map.mappings)
    const instance = await instantiate(evaluateSystemRegistration(result.code), new Map())
    const increment = requireFunction(instance.namespace.increment)
    assert.equal(increment(), 1)
    assert.equal(instance.namespace.value, 2)
})

test('preserves adjacent hoisted functions and an unmapped function ending at EOF', async () => {
    const code =
        "function first(){return ++count}function second(){return count++}import{value}from'./dependency.js';let count=value;export{count,first,second,last};function last(){return count+=value}"
    const dependencies = new Map([['./dependency.js', { value: 2 }]])
    for (const sourcemap of [false, true]) {
        const result = transformSystemJs({
            // MagicString's existing move path needs a destination beyond the function, as in newline-ended Rolldown output.
            code: sourcemap ? `${code}\n` : code,
            filename: 'assets/chunk.js',
            format: 'commonjs-registration',
            sourcemap,
            resolveReference(reference) {
                return reference
            }
        })
        const instance = await instantiate(evaluateCommonJsRegistration(result.code), dependencies)
        assert.equal(instance.beforeExecute.first, 'function')
        assert.equal(instance.beforeExecute.second, 'function')
        assert.equal(instance.beforeExecute.last, 'function')
        assert.equal(instance.namespace.count, 2)
        assert.equal(requireFunction(instance.namespace.first)(), 3)
        assert.equal(requireFunction(instance.namespace.second)(), 3)
        assert.equal(requireFunction(instance.namespace.last)(), 6)
        assert.equal(instance.namespace.count, 6)
    }
})

test('renders a large hoisted function set without losing declaration-time exports or nested edits', async () => {
    const names = Array.from({ length: 512 }, (_, index) => `increment${index}`)
    const code = `let count = 0;${names.map((name) => `function ${name}() { return ++count; }`).join('')}export { count, ${names.join(',')} };`
    const instance = await instantiate(evaluateCommonJsRegistration(compile(code).code), new Map())
    for (const [index, name] of names.entries()) {
        assert.equal(instance.beforeExecute[name], 'function')
        assert.equal(requireFunction(instance.namespace[name])(), index + 1)
    }
    assert.equal(instance.namespace.count, names.length)
})

test('rejects source-level module forms outside final Rolldown chunk grammar', () => {
    assert.throws(() => compile(`export const value = 1;`), /declaration exports/)
    assert.throws(() => compile(`export default 1;`), /source-level ExportDefaultDeclaration/)
    assert.throws(() => compile(`export * from './dependency.js';`), /source-level ExportAllDeclaration/)
    assert.throws(() => compile(`export { value } from './dependency.js';`), /re-exports/)
    assert.throws(
        () => compile(`import value from './dependency.json' with { type: 'json' }; export { value };`),
        /import phases, attributes, or type-only imports/
    )
    assert.throws(() => compile(`export { missing };`), /export of non-module binding/)
    assert.throws(
        () => compile(`let value; ({ value } = source); export { value };`),
        /destructuring write to exported binding/
    )
    assert.throws(
        () => compile(`let value; for ({ value } of values) {} export { value };`),
        /destructuring write to exported binding/
    )
    assert.throws(
        () => compile(`const load = () => import('./lazy.js', { with: { type: 'json' } }); export { load };`),
        /dynamic import options or phases/
    )
    assert.throws(() => compile(`using value = resource; export { value };`), /using or ambient variable declaration/)
    assert.throws(() => compile(`const value = eval('1'); export { value };`), /direct eval/)
    assert.throws(() => compile(`export {`), /Failed to parse assets\/chunk\.js with Oxc/)
})

/** Executes Babel and Oxc registrations through the same runtime model and compares every observable phase. */
async function compareOracle(
    code: string,
    observe: (instance: Instance) => Promise<unknown>,
    dependencies: ReadonlyMap<string, ModuleNamespace> | undefined
): Promise<void> {
    const dependencyModules = dependencies ?? new Map<string, ModuleNamespace>()
    const babel = await instantiate(evaluateSystemRegistration(compileWithBabel(code)), dependencyModules)
    const oxc = await instantiate(evaluateCommonJsRegistration(compile(code).code), dependencyModules)

    assert.deepEqual(oxc.beforeExecute, babel.beforeExecute)
    assert.deepEqual(oxc.publications, babel.publications)
    const oxcObservation = await observe(oxc)
    const babelObservation = await observe(babel)
    assert.deepEqual(oxcObservation, babelObservation)
    assert.deepEqual(oxc.publications, babel.publications)
}

/** Compiles the fixture through the production final-chunk path. */
function compile(code: string) {
    return transformSystemJs({
        code,
        filename: 'assets/chunk.js',
        format: 'commonjs-registration',
        sourcemap: false,
        resolveReference(reference) {
            return reference
        }
    })
}

/** Observe allocation work through the public compiler without adding a production test seam or writing fixtures. */
function compileWithNameAllocationStats(code: string, sourcemap: boolean) {
    const originalIterator = Set.prototype[Symbol.iterator]
    const originalFrom = Array.from
    // These counters are local to one synchronous transform; no call histories or fixture outputs are retained.
    const stats = { identifierSetIterations: 0, candidateArrays: 0, candidateArrayEntries: 0 }
    // Instrument only while compiling in this isolated test worker and restore both builtins before any async work.
    Set.prototype[Symbol.iterator] = function (this: Set<unknown>) {
        if (this.has('__systemNameAllocationSentinel')) {
            stats.identifierSetIterations += 1
        }
        return originalIterator.call(this)
    }
    Array.from = new Proxy(originalFrom, {
        apply(target, thisArgument: unknown, argumentsList: unknown[]) {
            const result: unknown = Reflect.apply(target, thisArgument, argumentsList)
            if (Array.isArray(result) && typeof result[0] === 'string' && result[0].startsWith('__systemDependency')) {
                stats.candidateArrays += 1
                stats.candidateArrayEntries += result.length
            }
            return result
        }
    })
    try {
        const output = transformSystemJs({
            code,
            filename: 'assets/chunk.js',
            format: 'commonjs-registration',
            sourcemap,
            resolveReference: (reference) => reference
        })
        return { output, stats }
    } finally {
        Set.prototype[Symbol.iterator] = originalIterator
        Array.from = originalFrom
    }
}

/** Counts declaration sorting only during one synchronous transform, restoring the builtin before async execution. */
function compileWithDeclarationSortStats(code: string, sourcemap: boolean) {
    const originalSort = Array.prototype.sort
    // This invocation-local counter observes work, not elapsed time or retained mock-call histories.
    let sortedDeclarations = 0
    Array.prototype.sort = new Proxy(originalSort, {
        apply(target, thisArgument: unknown, argumentsList: unknown[]) {
            if (Array.isArray(thisArgument)) {
                const first: unknown = thisArgument[0]
                if (
                    typeof first === 'object' &&
                    first !== null &&
                    'type' in first &&
                    first.type === 'VariableDeclaration'
                ) {
                    sortedDeclarations += thisArgument.length
                }
            }
            return Reflect.apply(target, thisArgument, argumentsList)
        }
    })
    try {
        const output = transformSystemJs({
            code,
            filename: 'assets/declarations.js',
            format: 'commonjs-registration',
            sourcemap,
            resolveReference: (reference) => reference
        })
        return { output, sortedDeclarations }
    } finally {
        Array.prototype.sort = originalSort
    }
}

/** Compiles the same fixture through Babel's generic SystemJS implementation as the correctness baseline. */
function compileWithBabel(code: string): string {
    const result = transformSync(code, {
        babelrc: false,
        comments: false,
        compact: true,
        configFile: false,
        filename: 'assets/chunk.js',
        plugins: babelPlugins,
        sourceMaps: false,
        sourceType: 'module'
    })
    const transformedCode = result?.code
    assert.ok(transformedCode)
    return transformedCode
}

function evaluateSystemRegistration(code: string): Registration {
    // The callback writes exactly once while evaluating Babel's one anonymous System.register expression.
    let registration: Registration | undefined
    const System = {
        register(dependencies: readonly string[], declaration: RegistrationDeclaration) {
            registration = [dependencies, declaration]
        }
    }
    Function('System', code)(System)
    if (!registration) assert.fail('Babel did not emit a System registration')
    return registration
}

function evaluateCommonJsRegistration(code: string): Registration {
    const commonJsModule: { exports?: unknown } = {}
    Function('module', code)(commonJsModule)
    assertRegistration(commonJsModule.exports)
    return commonJsModule.exports
}

/** Simulates the synchronous declaration/setter phases and potentially asynchronous execute phase used by our runtime. */
async function instantiate(
    registration: Registration,
    dependencies: ReadonlyMap<string, ModuleNamespace>
): Promise<Instance> {
    // Namespace and publication order are the observable mutable SystemJS state reduced by this one registration.
    const namespace: ModuleNamespace = {}
    const publications: string[] = []
    const exportBinding: ExportBinding = (nameOrValues, value) => {
        if (typeof nameOrValues === 'string') {
            namespace[nameOrValues] = value
            publications.push(nameOrValues)
            return value
        }
        Object.assign(namespace, nameOrValues)
        publications.push(...Object.keys(nameOrValues))
        return nameOrValues
    }
    const declaration = registration[1](exportBinding, {
        import(reference) {
            return Promise.resolve(requireDependency(dependencies, reference))
        },
        meta: { url: 'assets/chunk.js' }
    })
    const setters = declaration.setters ?? []
    assert.equal(setters.length, registration[0].length)
    setters.forEach((setter, index) => {
        setter(requireDependency(dependencies, registration[0][index] ?? ''))
    })
    const beforeExecute = Object.fromEntries(
        Object.entries(namespace).map(([name, value]) => [name, typeof value === 'function' ? 'function' : value])
    )
    await declaration.execute()
    return { beforeExecute, namespace, publications }
}

/** Normalizes source through Rolldown when a test specifically depends on final emitted-chunk shape. */
async function buildFinalChunk(source: string): Promise<string> {
    const result = await build({
        input: 'entry.js',
        plugins: [
            {
                name: 'test:virtual-entry',
                resolveId(id) {
                    return id === 'entry.js' ? id : null
                },
                load(id) {
                    return id === 'entry.js' ? source : null
                }
            }
        ],
        output: { format: 'es' },
        write: false
    })
    const [chunk] = result.output
    assert.equal(chunk?.type, 'chunk')
    return chunk.code
}

function requireDependency(dependencies: ReadonlyMap<string, ModuleNamespace>, reference: string): ModuleNamespace {
    const dependency = dependencies.get(reference)
    if (!dependency) assert.fail(`Missing dependency ${reference}`)
    return dependency
}

function assertRegistration(value: unknown): asserts value is Registration {
    assert.ok(Array.isArray(value))
    assert.equal(value.length, 2)
    assert.ok(Array.isArray(value[0]))
    assert.equal(typeof value[1], 'function')
}

function requireFunction(value: unknown): (...args: unknown[]) => unknown {
    if (typeof value !== 'function') assert.fail('Expected a function export')
    return function invoke(this: unknown, ...args: unknown[]): unknown {
        return Reflect.apply(value, this, args)
    }
}

function requireClass(value: unknown): { value: unknown } {
    if (typeof value !== 'function') assert.fail('Expected a class export')
    return { value: Reflect.get(value, 'value') }
}

function position(code: string, text: string): readonly [number, number] {
    const offset = code.indexOf(text)
    assert.notEqual(offset, -1, `Expected ${text} in generated or original source`)
    const prefix = code.slice(0, offset)
    return [prefix.split('\n').length - 1, offset - prefix.lastIndexOf('\n') - 1]
}
