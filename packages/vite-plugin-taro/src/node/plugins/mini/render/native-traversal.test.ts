import assert from 'node:assert/strict'
import { SourceMap } from 'node:module'
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

/** Compile and execute source strings directly: these regressions need no fixture or build-output writes. */
function compile(code: string, sourcemap: boolean) {
    return renderNative({
        code,
        chunk,
        chunks: {},
        classifyModule: () => assert.fail('These fixtures have no imported chunks to classify'),
        sourcemap
    })
}

function execute(code: string, require: (id: string) => unknown): Record<string, unknown> {
    // The generated CommonJS module publishes live bindings into this test-local export cell.
    const exports: Record<string, unknown> = {}
    Function('require', 'exports', code)(require, exports)
    return exports
}

for (const sourcemap of [false, true]) {
    test(`combines live-export updates and lexical this edits without losing source positions (maps: ${sourcemap})`, () => {
        const code = [
            "import { delta } from 'dependency'",
            'let count = 1',
            'const before = this',
            'function nested() { return () => this }',
            'const step = () => [count++, this, ++count, count += delta]',
            'const after = () => this',
            'export { count, count as alias, step, before, nested, after }'
        ].join('\n')
        const result = compile(code, sourcemap)
        const exports = execute(result.code, (id) => {
            assert.equal(id, 'dependency')
            return { delta: 2 }
        })
        assert.ok(typeof exports.step === 'function' && typeof exports.after === 'function')
        assert.ok(typeof exports.nested === 'function')
        assert.equal(exports.count, 1)
        assert.equal(exports.alias, 1)
        assert.deepEqual(exports.step(), [1, undefined, 3, 5])
        assert.equal(exports.count, 5)
        assert.equal(exports.alias, 5)
        assert.equal(exports.before, undefined)
        assert.equal(exports.after(), undefined)
        const receiver = { marker: true }
        const nested: unknown = Reflect.apply(exports.nested, receiver, [])
        assert.ok(typeof nested === 'function')
        assert.equal(nested(), receiver)

        if (!sourcemap) {
            assert.equal(result.map, null)
            return
        }
        assert.ok(result.map)
        assert.equal(result.map.file, chunk.fileName)
        assert.equal(result.map.version, 3)
        assert.deepEqual(result.map.sources, [chunk.fileName])
        assert.deepEqual(result.map.sourcesContent, [code])
        const map = new SourceMap({
            file: chunk.fileName,
            version: 3,
            sources: [chunk.fileName],
            sourcesContent: [code],
            names: [],
            mappings: result.map.mappings,
            sourceRoot: ''
        })
        for (const [generated, original] of [
            ['void 0', 'this'],
            ['count++', 'count++'],
            ['__nativeImport.delta]', 'delta]']
        ]) {
            const location = position(result.code, generated)
            const entry = map.findEntry(location.line, location.column)
            assert.ok('originalLine' in entry)
            assert.equal(entry.originalSource, chunk.fileName)
            assert.deepEqual({ line: entry.originalLine, column: entry.originalColumn }, position(code, original))
        }
    })
}

test('collects nested helper-name collisions before rewriting imported reads and postfix exports', () => {
    const result = compile(
        `
            import defaultValue from 'first'
            import * as values from 'second'
            let count = 1
            function inspect(__nativeImport, __nativeDefault, __nativeNamespace, __nativePostfix) {
                return [defaultValue, values.value, count++, __nativeImport, __nativeDefault, __nativeNamespace, __nativePostfix]
            }
            export { count, count as alias, inspect }
        `,
        false
    )
    const exports = execute(result.code, (id) => {
        assert.ok(id === 'first' || id === 'second')
        return id === 'first' ? 7 : { value: 9 }
    })
    assert.ok(typeof exports.inspect === 'function')
    assert.deepEqual(exports.inspect(10, 20, 30, 40), [7, 9, 1, 10, 20, 30, 40])
    assert.equal(exports.count, 2)
    assert.equal(exports.alias, 2)
})

test('resolves forward declarations and shadowing without allocating a postfix temp for unrelated updates', () => {
    const result = compile(
        `
            import { value } from 'dependency'
            let count = 1
            function lexical() {
                const read = () => [value, count++]
                let count = 10
                const value = 20
                return [read(), count]
            }
            function functionScoped() {
                const update = () => count++
                var count = 30
                return [update(), count]
            }
            function caught() { try { throw 7 } catch (count) { return count++ } }
            const prefix = () => ++count
            const state = { count: 5 }
            const property = () => state.count++
            let local = 8
            const unrelated = () => local++
            const readImport = () => value
            export { count, lexical, functionScoped, caught, prefix, property, unrelated, readImport }
        `,
        false
    )
    assert.doesNotMatch(result.code, /var __nativePostfix\d*;/)
    const exports = execute(result.code, () => ({ value: 99 }))
    const observations = ['lexical', 'functionScoped', 'caught', 'prefix', 'property', 'unrelated', 'readImport'].map(
        (name) => {
            const fn = exports[name]
            assert.ok(typeof fn === 'function')
            return Reflect.apply(fn, undefined, [])
        }
    )
    assert.deepEqual(observations, [[[20, 10], 11], [30, 31], 7, 2, 5, 8, 99])
    assert.equal(exports.count, 2)
})

test('restores lexical this tracking after function and class boundaries', () => {
    const result = compile(
        `
            const before = this
            const regular = function () { return (() => this)() }
            class Declared { field = () => this; static self = this }
            const Expression = class { field = this; static self = this }
            const after = () => this
            export { before, regular, Declared, Expression, after }
        `,
        false
    )
    const exports = execute(result.code, () => assert.fail('No imports'))
    assert.equal(exports.before, undefined)
    assert.ok(typeof exports.regular === 'function' && typeof exports.after === 'function')
    const receiver = { marker: true }
    assert.equal(Reflect.apply(exports.regular, receiver, []), receiver)
    assert.equal(exports.after(), undefined)
    for (const name of ['Declared', 'Expression']) {
        const exportedClass = exports[name]
        assert.ok(typeof exportedClass === 'function')
        assert.equal(Reflect.get(exportedClass, 'self'), exportedClass)
        const instance: object = Reflect.construct(exportedClass, [])
        const field: unknown = Reflect.get(instance, 'field')
        assert.equal(typeof field === 'function' ? field() : field, instance)
    }
})

test('combined declaration analysis still rejects nested direct eval', () => {
    assert.throws(
        () => compile("function read() { return () => eval('1') }; export { read }", false),
        /Unsupported final Rolldown native chunk native\.js: direct eval/
    )
})

function position(code: string, text: string): Readonly<{ line: number; column: number }> {
    const offset = code.indexOf(text)
    assert.notEqual(offset, -1, `Expected ${text} in generated or original source`)
    const prefix = code.slice(0, offset)
    return { line: prefix.split('\n').length - 1, column: offset - prefix.lastIndexOf('\n') - 1 }
}
