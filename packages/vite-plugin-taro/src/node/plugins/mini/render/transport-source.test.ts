import assert from 'node:assert/strict'
import { SourceMap } from 'node:module'
import test from 'node:test'
import { walk } from 'oxc-walker'
import { parseSync } from 'rolldown/utils'
import type { Rolldown } from 'vite'
import type { MiniExecutionKind, MiniModuleClassifier } from '../module/module.ts'
import { materializeTransport } from './transport.ts'

const source = '// retained prefix\nexports.load = __VPT_TRANSPORT__;\nexports.marker = 42;\n'
const transportChunk = createChunk('assets/transport-!~{001}~.js', 'native')
const bootstrap = createChunk('assets/bootstrap-!~{002}~.js', 'amphibious')
const eager = createChunk('assets/z-__VPT_TRANSPORT__-"quote\'\\\n-!~{003}~.js', 'capsule')
const lazy = createChunk('assets/lazy-!~{004}~.js', 'capsule')
const shell = createChunk('app.js', 'native')
const chunks = Object.fromEntries(
    [eager, lazy, shell, bootstrap, transportChunk].map((chunk) => [chunk.fileName, chunk])
)
const eagerPath = './quoted-"\'\\\n-!~{003}~.js'
const lazyPath = '../sub/lazy feature-!~{004}~.js'
const physicalPaths: ReadonlyMap<string, string> = new Map([
    [transportChunk.fileName, 'common/transport-!~{001}~.js'],
    [bootstrap.fileName, 'common/bootstrap-!~{002}~.js'],
    [eager.fileName, `common/${eagerPath.slice(2)}`],
    [lazy.fileName, 'sub/lazy feature-!~{004}~.js']
])

// Classification is explicit fixture data; the existing transport integration tests exercise the real module classifier.
const classifyModule: MiniModuleClassifier = ({ moduleIds }) => {
    const executionKind = moduleIds[0]
    assert.ok(executionKind === 'native' || executionKind === 'capsule' || executionKind === 'amphibious')
    return { entryRole: undefined, executionKind, isTransport: false }
}

function createChunk(fileName: string, kind: MiniExecutionKind): Rolldown.RenderedChunk {
    return {
        type: 'chunk',
        name: fileName,
        fileName,
        isEntry: false,
        isDynamicEntry: false,
        facadeModuleId: null,
        moduleIds: [kind],
        modules: {},
        exports: [],
        imports: [],
        dynamicImports: []
    }
}

/** Evaluate generated source directly in memory, without fixture or output files. */
function evaluate(code: string, require: (id: string) => unknown): (id: string) => unknown {
    // The generated CommonJS code writes only this test-local export cell.
    const exports: Record<string, unknown> = {}
    Function('exports', 'require', code)(exports, require)
    assert.equal(exports.marker, 42)
    const load = exports.load
    assert.ok(typeof load === 'function')
    return (id) => Reflect.apply(load, undefined, [id])
}

for (const sourcemap of [false, true]) {
    test(`emits valid literal transport routes without regenerating surrounding code (maps: ${sourcemap})`, async () => {
        const input = {
            code: source,
            transportChunk,
            chunks,
            classifyModule,
            sourcemap,
            getLoadMode(chunk: Rolldown.RenderedChunk): 'sync' | 'async' {
                assert.notEqual(chunk.moduleIds[0], 'native')
                return chunk === lazy ? 'async' : 'sync'
            },
            getPhysicalChunkId(chunk: Rolldown.RenderedChunk): string {
                const physicalPath = physicalPaths.get(chunk.fileName)
                assert.ok(physicalPath)
                return physicalPath
            }
        }
        const result = await materializeTransport(input)
        const reordered = await materializeTransport({
            ...input,
            chunks: Object.fromEntries(Object.entries(chunks).reverse())
        })
        assert.deepEqual(result, reordered, 'Output must not depend on graph insertion order')
        assert.ok(result.code.startsWith('// retained prefix\nexports.load = '))
        assert.ok(result.code.endsWith(';\nexports.marker = 42;\n'))

        // Oxc checks generated grammar and literal arguments in tests, not during each consumer build.
        const parsed = parseSync(transportChunk.fileName, result.code)
        assert.deepEqual(parsed.errors, [])
        // These local journals collect AST observations without reading or writing any files.
        const ids: string[] = []
        const requires: { mode: string; id: string }[] = []
        walk(parsed.program, {
            enter(node) {
                if (node.type === 'SwitchCase' && node.test) {
                    assert.ok(node.test.type === 'Literal' && typeof node.test.value === 'string')
                    ids.push(node.test.value)
                }
                if (node.type !== 'CallExpression') {
                    return
                }
                const callee = node.callee
                const sync = callee.type === 'Identifier' && callee.name === 'require'
                const async =
                    callee.type === 'MemberExpression' &&
                    callee.object.type === 'Identifier' &&
                    callee.object.name === 'require' &&
                    callee.property.type === 'Identifier' &&
                    callee.property.name === 'async'
                if (!sync && !async) {
                    return
                }
                assert.equal(node.arguments.length, 1)
                const argument = node.arguments[0]
                assert.ok(argument?.type === 'Literal' && typeof argument.value === 'string')
                requires.push({ mode: sync ? 'sync' : 'async', id: argument.value })
            }
        })
        assert.deepEqual(ids, [bootstrap.fileName, lazy.fileName, eager.fileName])
        assert.deepEqual(requires, [
            { mode: 'sync', id: './bootstrap-!~{002}~.js' },
            { mode: 'async', id: lazyPath },
            { mode: 'sync', id: eagerPath }
        ])

        const namespace = { value: 42 }
        const pending = Promise.withResolvers<unknown>()
        const load = evaluate(
            result.code,
            Object.assign(
                (id: string) => {
                    assert.equal(id, eagerPath)
                    return namespace
                },
                {
                    async(id: string) {
                        assert.equal(id, lazyPath)
                        return pending.promise
                    }
                }
            )
        )
        // Selecting an amphibious registration must not require its namespace until execute() runs.
        assert.ok(Array.isArray(load(bootstrap.fileName)))
        assert.equal(load(eager.fileName), namespace)
        assert.equal(load(lazy.fileName), pending.promise)
        pending.resolve(namespace)
        assert.equal(await pending.promise, namespace)
        assert.throws(() => load(shell.fileName), /Unknown System module: app\.js/)

        if (!sourcemap) {
            assert.equal(result.map, null)
            return
        }
        assert.ok(result.map)
        assert.deepEqual(result.map.sources, [transportChunk.fileName])
        assert.deepEqual(result.map.sourcesContent, [source])
        const map = new SourceMap({
            file: transportChunk.fileName,
            version: 3,
            sources: [transportChunk.fileName],
            sourcesContent: [source],
            names: [],
            mappings: result.map.mappings,
            sourceRoot: ''
        })
        const line = result.code.split('\n').findIndex((text) => text.startsWith('exports.marker'))
        const entry = map.findEntry(line, 0)
        assert.ok('originalLine' in entry)
        assert.equal(entry.originalSource, transportChunk.fileName)
        assert.equal(entry.originalLine, 2)
        assert.equal(entry.originalColumn, 0)
    })
}

test('keeps default source maps and physical paths while normalizing logical route IDs', async () => {
    const page = createChunk('assets/pages/../page.js', 'capsule')
    const result = await materializeTransport({
        code: source,
        transportChunk,
        chunks: { [page.fileName]: page },
        classifyModule,
        getLoadMode: () => 'sync'
    })
    const load = evaluate(result.code, (id) => id)
    assert.equal(load('assets/page.js'), './page.js')
    assert.throws(() => load(page.fileName), /Unknown System module/)
    assert.ok(result.map?.mappings)
})

test('emits a closed empty transport without loading native-only chunks', async () => {
    const result = await materializeTransport({
        code: source,
        transportChunk,
        chunks: { [shell.fileName]: shell, [transportChunk.fileName]: transportChunk },
        classifyModule,
        getLoadMode: () => assert.fail('Native-only chunks must not be transported'),
        sourcemap: false
    })
    assert.deepEqual(parseSync(transportChunk.fileName, result.code).errors, [])
    const load = evaluate(result.code, () => assert.fail('Empty transport must not require a module'))
    assert.throws(() => load('missing.js'), /Unknown System module: missing\.js/)
})

test('requires exactly one transport slot before inserting generated routes', async () => {
    for (const [code, count] of [
        ['exports.load = 1', 0],
        ['exports.first = __VPT_TRANSPORT__; exports.second = __VPT_TRANSPORT__', 2]
    ] as const) {
        await assert.rejects(
            materializeTransport({
                code,
                transportChunk,
                chunks: {},
                classifyModule,
                getLoadMode: () => assert.fail('Empty graph'),
                sourcemap: false
            }),
            { message: `Expected one placeholder __VPT_TRANSPORT__, found ${count}` }
        )
    }
})
