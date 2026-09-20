import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { renderNative } from './native.ts'

const chunk: Rolldown.RenderedChunk = {
    type: 'chunk',
    name: 'native',
    fileName: 'native.js',
    isEntry: true,
    isDynamicEntry: false,
    facadeModuleId: '/native.js',
    moduleIds: ['/native.js'],
    modules: {},
    exports: [],
    imports: [],
    dynamicImports: []
}

function compile(code: string, sourcemap: boolean) {
    return renderNative({
        code,
        chunk,
        chunks: {},
        bootstrapModuleId: '/bootstrap.js',
        getPhysicalChunkId: () => assert.fail('These external imports need no loader dependency'),
        classifyModule: () => assert.fail('These external imports need no chunk classification'),
        sourcemap
    })
}

/** Count naming work, not elapsed time. All fixtures and generated output stay in memory. */
function compileWithProbeCount(code: string, sourcemap: boolean) {
    const originalHas = Set.prototype.has
    // This test-local counter observes only import-namespace membership checks during the synchronous render.
    let probes = 0
    // Temporarily instrument the builtin without retaining mock call histories for the old quadratic implementation.
    // The worker runs these tests synchronously; restore the method before assertions or generated code can execute.
    Set.prototype.has = function (this: Set<unknown>, value: unknown) {
        if (typeof value === 'string' && /^__nativeImport\d*$/.test(value)) {
            probes += 1
        }
        return originalHas.call(this, value)
    }
    try {
        const output = compile(code, sourcemap)
        return { output, probes }
    } finally {
        Set.prototype.has = originalHas
    }
}

function importName(suffix: number): string {
    return suffix === 0 ? '__nativeImport' : `__nativeImport${suffix}`
}

const scenarios = [
    { name: 'sparse collisions', imports: 4, reserved: [1, 4, 10] },
    { name: '128 imports without collisions', imports: 128, reserved: [] },
    {
        name: '1024 imports after 64 collisions',
        imports: 1024,
        reserved: Array.from({ length: 64 }, (_, index) => index)
    }
]

for (const scenario of scenarios) {
    for (const sourcemap of [false, true]) {
        test(`allocates import namespaces with linear probes: ${scenario.name} (maps: ${sourcemap})`, () => {
            const indices = Array.from({ length: scenario.imports }, (_, index) => index)
            const reservedNames = scenario.reserved.map(importName)
            const code = [
                ...indices.map((index) => `import { value as value${index} } from 'dependency-${index}'`),
                `const values = [${indices.map((index) => `value${index}`).join(', ')}]`,
                `function inspect(${reservedNames.join(', ')}) { return [value0, value${scenario.imports - 1}, ...arguments] }`,
                'export { values, inspect }'
            ].join('\n')
            const availableSuffixes = Array.from(
                { length: scenario.imports + scenario.reserved.length },
                (_, index) => index
            ).filter((index) => !scenario.reserved.includes(index))
            const expectedSuffixes = availableSuffixes.slice(0, scenario.imports)
            const { output, probes } = compileWithProbeCount(code, sourcemap)
            assert.equal(probes, expectedSuffixes.at(-1)! + 1, 'Each candidate must be tested only once per chunk')
            const namespaces = [...output.code.matchAll(/var (__nativeImport\d*)=require\("dependency-\d+"\);/g)].map(
                (match) => match[1]
            )
            assert.deepEqual(namespaces, expectedSuffixes.map(importName))

            // Execution writes only this local export cell and dependency-order journal.
            const exports: Record<string, unknown> = {}
            const required: string[] = []
            Function(
                'require',
                'exports',
                output.code
            )((id: string) => {
                required.push(id)
                return { value: Number(id.slice('dependency-'.length)) }
            }, exports)
            assert.deepEqual(
                required,
                indices.map((index) => `dependency-${index}`)
            )
            assert.deepEqual(exports.values, indices)
            assert.ok(typeof exports.inspect === 'function')
            const authoredArguments = scenario.reserved.map((suffix) => `authored-${suffix}`)
            assert.deepEqual(Reflect.apply(exports.inspect, undefined, authoredArguments), [
                0,
                scenario.imports - 1,
                ...authoredArguments
            ])

            // A new render must start a fresh cursor and preserve byte-identical output and map data.
            assert.deepEqual(compile(code, sourcemap), output)
            if (sourcemap) {
                assert.deepEqual(output.map?.sourcesContent, [code])
                assert.ok(output.map?.mappings)
            } else {
                assert.equal(output.map, null)
            }
        })
    }
}

test('avoids imported and local binding names while preserving live imported exports', () => {
    const code = [
        "import { value as __nativeImport } from 'first'",
        "import { value as __nativeImport2 } from 'second'",
        "const __nativeImport1 = 'local'",
        'const read = () => [__nativeImport, __nativeImport2, __nativeImport1]',
        'export { __nativeImport, read }'
    ].join('\n')
    const { output, probes } = compileWithProbeCount(code, false)
    assert.equal(probes, 5)
    assert.match(output.code, /var __nativeImport3=require\("first"\)/)
    assert.match(output.code, /var __nativeImport4=require\("second"\)/)
    // These local dependency/export cells model a dependency changing after its importer has executed.
    const first = { value: 7 }
    const exports: Record<string, unknown> = {}
    Function('require', 'exports', output.code)((id: string) => (id === 'first' ? first : { value: 9 }), exports)
    assert.ok(typeof exports.read === 'function')
    assert.deepEqual(exports.read(), [7, 9, 'local'])
    assert.equal(exports.__nativeImport, 7)
    first.value = 11
    assert.deepEqual(exports.read(), [11, 9, 'local'])
    assert.equal(exports.__nativeImport, 11)
})

test('preserves namespace numbering and loading order across side-effect and capsule imports', () => {
    const code = [
        "import 'before'",
        "import config from './capsule.js'",
        "import './bootstrap.js'",
        "import laterConfig from './capsule.js'",
        "import { value as first } from 'first'",
        "import 'between'",
        "import { value as second } from 'second'",
        'const values = [config, laterConfig, first, second]',
        'export { values }'
    ].join('\n')
    const capsule: Rolldown.RenderedChunk = { ...chunk, fileName: 'capsule.js', moduleIds: ['/capsule.js'] }
    const output = renderNative({
        code,
        chunk,
        chunks: { 'capsule.js': capsule },
        bootstrapModuleId: '/bootstrap.js',
        getPhysicalChunkId: (chunk) => (typeof chunk === 'string' ? 'bootstrap.js' : chunk.fileName),
        classifyModule(imported) {
            assert.equal(imported, capsule)
            return { entryRole: 'capsule', executionKind: 'capsule' }
        },
        sourcemap: false
    })
    // Side-effect imports still reserve their original slots; capsule imports never allocate a native namespace.
    assert.match(output.code, /var __nativeImport2=require\("first"\)/)
    assert.match(output.code, /var __nativeImport4=require\("second"\)/)
    // These test-local cells observe the interleaved native and SystemJS dependency loading without filesystem output.
    const exports: Record<string, unknown> = {}
    const events: string[] = []
    Function(
        'require',
        'exports',
        'globalThis',
        output.code
    )(
        (id: string) => {
            events.push(`require:${id}`)
            if (id === './bootstrap.js') {
                return {
                    System: {
                        importSync(moduleId: string) {
                            events.push(`capsule:${moduleId}`)
                            return { default: 'capsule-value' }
                        }
                    }
                }
            }
            return { value: id }
        },
        exports,
        undefined
    )
    assert.deepEqual(events, [
        'require:./bootstrap.js',
        'require:before',
        'capsule:capsule.js',
        'capsule:capsule.js',
        'require:first',
        'require:between',
        'require:second'
    ])
    assert.deepEqual(exports.values, ['capsule-value', 'capsule-value', 'first', 'second'])
})
