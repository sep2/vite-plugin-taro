import assert from 'node:assert/strict'
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
        },
        removeRefreshPreambleGuard: false
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
        },
        removeRefreshPreambleGuard: false
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
        },
        removeRefreshPreambleGuard: false
    })
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
