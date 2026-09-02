import assert from 'node:assert/strict'
import test from 'node:test'
import { type PluginTarget, transformSync } from '@babel/core'
import transformModulesCommonjs from '@babel/plugin-transform-modules-commonjs'
import type { Rolldown } from 'vite'
import type { RuntimeContract } from '../mini-contract.ts'
import { createMiniModuleClassifier } from '../module/module.ts'
import { renderNative } from './native.ts'

const runtime: RuntimeContract = {
    globalObject: 'global',
    modules: {
        bootstrap: '/runtime/bootstrap',
        transport: '/runtime/transport',
        appShell: '/runtime/app-shell',
        appCapsule: '/runtime/app-capsule',
        componentShell: '/runtime/component-shell',
        componentCapsule: '/runtime/component-capsule',
        customWrapperShell: '/runtime/custom-wrapper-shell',
        pageShell: '/runtime/page-shell',
        pageCapsule: '/runtime/page-capsule',
        devtoolsHmrRuntime: '/runtime/devtools-hmr',
        interpreterHmrRuntime: '/runtime/interpreter-hmr'
    }
}

const classifyModule = createMiniModuleClassifier(runtime.modules)

type ModuleNamespace = Record<string, unknown>
type CommonJsInstance = Readonly<{
    exports: ModuleNamespace
    required: readonly string[]
}>

/**
 * Babel remains the semantic oracle for native CommonJS behavior, but is not used by production rendering.
 *
 * These tests compare runtime observations rather than generated text because helper names and formatting are intentionally
 * different. Every fixture executes with the same CommonJS dependency map and compares exports, import order, receiver
 * behavior, declaration values, and mutation results. This guards the semantic boundary while allowing the Oxc renderer to
 * retain Rolldown's source and avoid Babel's whole-file code generation.
 */
test('matches Babel for ordinary imports, exported imports, shorthand properties, and top-level this', () => {
    const code = `
        import defaultValue, * as all from './dependency.js';
        import { named as local } from './dependency.js';
        const object = { local };
        const lexicalThis = () => this;
        function dynamicThis() { return this; }
        export { all, defaultValue, dynamicThis, lexicalThis, local, object };
    `
    const dependencies = new Map<string, ModuleNamespace>([
        ['./dependency.js', { __esModule: true, default: 3, named: 7 }]
    ])

    compareOracle(code, dependencies, ({ exports }) => {
        const lexicalThis = requireFunction(exports.lexicalThis)
        const dynamicThis = requireFunction(exports.dynamicThis)
        const receiver = { marker: true }
        return [
            exports.defaultValue,
            exports.local,
            exports.all,
            exports.object,
            lexicalThis(),
            Reflect.apply(dynamicThis, receiver, [])
        ]
    })
})

test('matches Babel for unbound calls of named and default imports', () => {
    const code = `
        import defaultCall from './dependency.js';
        import { namedCall } from './dependency.js';
        const call = () => [defaultCall(), namedCall(), (namedCall)()];
        export { call };
    `
    const dependency = {
        __esModule: true,
        default() {
            return this
        },
        namedCall() {
            return this
        }
    }

    compareOracle(code, new Map([['./dependency.js', dependency]]), ({ exports }) => {
        const call = requireFunction(exports.call)
        return call()
    })
})

test('constructing an imported class preserves constructor semantics', () => {
    const code = `
        import { ImportedClass } from './dependency.js';
        const create = () => new ImportedClass();
        export { create };
    `
    class ImportedClass {
        readonly value = 7
    }

    compareOracle(code, new Map([['./dependency.js', { ImportedClass }]]), ({ exports }) => {
        const create = requireFunction(exports.create)
        const instance = create()
        if (typeof instance !== 'object' || instance === null) assert.fail('Expected constructed object')
        return Reflect.get(instance, 'value')
    })
})

test('matches Babel for unbound optional calls and imported tags', () => {
    const code = `
        import { optionalCall, tag } from './dependency.js';
        const run = () => [optionalCall?.(), (optionalCall)?.(), tag\`value\`, (tag)\`value\`];
        export { run };
    `
    const dependency = {
        optionalCall() {
            return this
        },
        tag() {
            return this
        }
    }

    compareOracle(code, new Map([['./dependency.js', dependency]]), ({ exports }) => {
        const run = requireFunction(exports.run)
        return run()
    })
})

test('matches Babel for mutable export writes, aliases, shadowing, and update completion values', () => {
    const code = `
        let value = 1;
        function mutate() {
            const results = [value += 2, ++value, value--, value];
            value = 9;
            return results;
        }
        function shadow(value) { return value++; }
        export { mutate, shadow, value, value as alias };
    `

    compareOracle(code, new Map(), ({ exports }) => {
        const mutate = requireFunction(exports.mutate)
        const shadow = requireFunction(exports.shadow)
        return [mutate(), exports.value, exports.alias, shadow(20), exports.value]
    })
})

test('matches Babel for side-effect import order and local declaration exports', () => {
    const code = `
        import './first.js';
        import './second.js';
        const value = 4;
        function read() { return value; }
        class Counter { static value = value; }
        let unset;
        export { Counter, read, unset, value, value as alias };
    `
    const dependencies = new Map<string, ModuleNamespace>([
        ['./first.js', {}],
        ['./second.js', {}]
    ])

    compareOracle(code, dependencies, ({ exports, required }) => {
        const Counter = requireClass(exports.Counter)
        const read = requireFunction(exports.read)
        return [required, exports.value, exports.alias, exports.unset, read(), Counter.value]
    })
})

function compile(code: string) {
    const chunk = { fileName: 'assets/native.js', moduleIds: [runtime.modules.bootstrap] } as Rolldown.RenderedChunk
    return renderNative({
        code,
        chunk,
        chunks: {},
        runtime: runtime,
        classifyModule: classifyModule,
        sourcemap: false
    })
}

/** Executes both compilers against identical dependencies and compares their observable module namespaces. */
function compareOracle(
    code: string,
    dependencies: ReadonlyMap<string, ModuleNamespace>,
    observe: (instance: CommonJsInstance) => unknown
): void {
    const transformed = compile(code)
    const oxc = executeCommonJs(transformed.code, dependencies)
    const babel = executeCommonJs(compileWithBabel(code), dependencies)

    assert.deepEqual(observe(oxc), observe(babel))
    assert.deepEqual(Object.keys(oxc.exports).sort(), Object.keys(babel.exports).sort())
}

function compileWithBabel(code: string): string {
    const transformed = transformSync(code, {
        babelrc: false,
        comments: false,
        compact: true,
        configFile: false,
        plugins: [transformModulesCommonjs as PluginTarget],
        sourceMaps: false,
        sourceType: 'module'
    })
    assert.ok(transformed?.code)
    return transformed.code
}

function executeCommonJs(code: string, dependencies: ReadonlyMap<string, ModuleNamespace>): CommonJsInstance {
    const commonJsModule: { exports: ModuleNamespace } = { exports: {} }
    const required: string[] = []
    Function(
        'require',
        'module',
        'exports',
        code
    )(
        (reference: string) => {
            required.push(reference)
            const dependency = dependencies.get(reference)
            if (!dependency) assert.fail(`Missing dependency ${reference}`)
            return dependency
        },
        commonJsModule,
        commonJsModule.exports
    )
    return { exports: commonJsModule.exports, required }
}

function requireFunction(value: unknown): (...args: unknown[]) => unknown {
    if (typeof value !== 'function') assert.fail('Expected function')
    return function invoke(this: unknown, ...args: unknown[]): unknown {
        return Reflect.apply(value, this, args)
    }
}

function requireClass(value: unknown): { value: unknown } {
    if (typeof value !== 'function') assert.fail('Expected class')
    return { value: Reflect.get(value, 'value') }
}
