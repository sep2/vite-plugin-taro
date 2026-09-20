import assert from 'node:assert/strict'
import test from 'node:test'
import { walk } from 'oxc-walker'
import { parseSync } from 'rolldown/utils'
import type { Rolldown } from 'vite'
import { type MiniChunkKind, type MiniModuleClassifier, miniTransportFileName } from '../module/module.ts'
import type { PackageLocation } from '../placer/placement.ts'
import { createTransportOutput } from './create-transport-output.ts'

// Fixture identities carry explicit classifications; the cross-package execution test uses the production classifier.
const classifyModule: MiniModuleClassifier = ({ moduleIds }) => {
    const kind = moduleIds[0]
    assert.ok(kind === 'native' || kind === 'entry-capsule' || kind === 'normal-capsule' || kind === 'amphibious')
    return kind
}

function createChunk(fileName: string, kind: MiniChunkKind): Rolldown.OutputChunk {
    return {
        __rolldown_external_memory_handle__: () => ({ freed: false }),
        type: 'chunk',
        code: '',
        name: fileName,
        fileName,
        preliminaryFileName: fileName.replace('-resolved', '-!~{001}~'),
        isEntry: false,
        isDynamicEntry: false,
        facadeModuleId: null,
        moduleIds: [kind],
        modules: {},
        exports: [],
        imports: [],
        dynamicImports: [],
        map: null,
        sourcemapFileName: null
    }
}

function getPackageLocation(chunk: Rolldown.OutputChunk): PackageLocation {
    return chunk.fileName.startsWith('sub/p_test/') ? { kind: 'subpackage', root: 'sub/p_test' } : { kind: 'main' }
}

function emit(bundle: Rolldown.OutputBundle) {
    return createTransportOutput({ bundle, classifyModule, getPackageLocation })
}

/** Evaluates the emitted CommonJS directly, without another code generator changing its literal paths. */
function evaluate(code: string, require: (id: string) => unknown): (id: string) => unknown {
    // Evaluation writes only this test-local CommonJS export cell.
    const exports: Record<string, unknown> = {}
    Function('exports', 'require', code)(exports, require)
    const transport = exports.transport
    assert.ok(typeof transport === 'function')
    return (id) => Reflect.apply(transport, undefined, [id])
}

test('emits compact deterministic routes with final physical paths and resolved logical hashes', () => {
    const bootstrap = createChunk('common/bootstrap-resolved.js', 'amphibious')
    const eager = createChunk('common/eager-resolved.js', 'entry-capsule')
    const lazy = createChunk('sub/p_test/common/lazy-resolved.js', 'normal-capsule')
    const shell = createChunk('app.js', 'native')
    const bundle: Rolldown.OutputBundle = {
        [lazy.fileName]: lazy,
        'app.json': {
            __rolldown_external_memory_handle__: () => ({ freed: false }),
            type: 'asset',
            fileName: 'app.json',
            name: undefined,
            originalFileName: null,
            names: [],
            originalFileNames: [],
            source: '{}'
        },
        [eager.fileName]: eager,
        [shell.fileName]: shell,
        [bootstrap.fileName]: bootstrap
    }
    const result = emit(bundle)
    assert.deepEqual(result, emit(Object.fromEntries(Object.entries(bundle).reverse())))
    assert.equal(result.type, 'asset')
    assert.equal(result.fileName, miniTransportFileName)
    assert.doesNotMatch(result.source, /\n|!~\{/)

    const parsed = parseSync(miniTransportFileName, result.source)
    assert.deepEqual(parsed.errors, [])
    // These local journals inspect grammar and native-loader arguments without changing generated output.
    const ids: string[] = []
    const paths: string[] = []
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
            if (
                (callee.type === 'Identifier' && callee.name === 'require') ||
                (callee.type === 'MemberExpression' &&
                    callee.object.type === 'Identifier' &&
                    callee.object.name === 'require')
            ) {
                const argument = node.arguments[0]
                assert.ok(argument?.type === 'Literal' && typeof argument.value === 'string')
                paths.push(argument.value)
            }
        }
    })
    assert.deepEqual(ids, ['common/bootstrap-resolved.js', 'common/eager-resolved.js', 'common/lazy-resolved.js'])
    assert.deepEqual(paths, [
        '../bootstrap-resolved.js',
        '../eager-resolved.js',
        '../../sub/p_test/common/lazy-resolved.js'
    ])
    const namespace = {}
    const load = evaluate(result.source, (id) => {
        assert.equal(id, '../eager-resolved.js')
        return namespace
    })
    assert.equal(load(eager.fileName), namespace)
    assert.throws(() => load(shell.fileName), { message: 'Unknown module: app.js' })
    assert.throws(() => load(lazy.fileName), { message: `Unknown module: ${lazy.fileName}` })
})

test('bridges amphibious namespaces lazily to avoid requiring bootstrap during initialization', () => {
    const bootstrap = createChunk('common/bootstrap.js', 'amphibious')
    const runtime = createChunk('common/rolldown-runtime.js', 'amphibious')
    const output = emit({ [bootstrap.fileName]: bootstrap, [runtime.fileName]: runtime })
    // Traces distinguish selecting a registration from executing its namespace bridge.
    const required: string[] = []
    const namespace = { value: 42 }
    const load = evaluate(output.source, (id) => {
        required.push(id)
        return namespace
    })
    for (const chunk of [bootstrap, runtime]) {
        const registration = load(chunk.fileName)
        assert.ok(Array.isArray(registration))
        assert.deepEqual(registration[0], [])
        // The registration publishes into this local cell only when execute runs.
        const published: unknown[] = []
        const declaration = registration[1]((value: unknown) => published.push(value))
        assert.deepEqual(required, [])
        assert.deepEqual(published, [])
        declaration.execute()
        assert.deepEqual(required.splice(0), [`../${chunk.fileName.slice('common/'.length)}`])
        assert.equal(published[0], namespace)
    }
})

test('preserves the native asynchronous promise until the subpackage finishes loading', async () => {
    const lazy = createChunk('sub/p_test/common/lazy.js', 'normal-capsule')
    const output = emit({ [lazy.fileName]: lazy })
    const pending = Promise.withResolvers<unknown>()
    const namespace = {}
    const load = evaluate(
        output.source,
        Object.assign(() => assert.fail('Lazy chunks must use require.async'), {
            async(id: string) {
                assert.equal(id, '../../sub/p_test/common/lazy.js')
                return pending.promise
            }
        })
    )
    const loading = load('common/lazy.js')
    assert.equal(loading, pending.promise)
    // This observation must remain false until the mocked native download completes.
    let settled = false
    void pending.promise.then(() => {
        settled = true
    })
    await Promise.resolve()
    assert.equal(settled, false)
    pending.resolve(namespace)
    assert.equal(await loading, namespace)
    assert.equal(settled, true)
})

test('normalizes logical route IDs and physical paths for main and subpackage capsules', async () => {
    const main = createChunk('assets/pages/../page.js', 'entry-capsule')
    const lazy = createChunk('sub/p_test/assets/pages/../lazy.js', 'normal-capsule')
    const output = emit({ [main.fileName]: main, [lazy.fileName]: lazy })
    const load = evaluate(
        output.source,
        Object.assign((id: string) => id, { async: (id: string) => Promise.resolve(id) })
    )

    assert.equal(load('assets/page.js'), '../../assets/page.js')
    assert.equal(await load('assets/lazy.js'), '../../sub/p_test/assets/lazy.js')
    for (const id of [main.fileName, 'assets/pages/../lazy.js', lazy.fileName]) {
        assert.throws(() => load(id), { message: `Unknown module: ${id}` })
    }
})

for (const name of [
    'feature.js',
    `"quoted"/back\`tick/\${literal}/feature.js`,
    'back\\slash/line\nnext\u2028end.js',
    '功能.js'
]) {
    test(`preserves the quoted async path ${JSON.stringify(name)}`, async () => {
        const logicalId = `common/${name}`
        const chunk = createChunk(`sub/p_test/${logicalId}`, 'normal-capsule')
        const output = emit({ [chunk.fileName]: chunk })
        const requirePath = `../../${chunk.fileName}`
        assert.deepEqual(parseSync(miniTransportFileName, output.source).errors, [])
        assert.ok(output.source.includes(`require.async(${JSON.stringify(requirePath)})`))

        const namespace = {}
        const load = evaluate(
            output.source,
            Object.assign(() => assert.fail('Subpackage paths must use require.async'), {
                async(id: string) {
                    assert.equal(id, requirePath)
                    return Promise.resolve(namespace)
                }
            })
        )
        assert.equal(await load(logicalId), namespace)
    })
}

test('JSON-encodes special characters without changing module IDs or literal require paths', () => {
    const name = 'quoted-"\'`\\\n抖音.js'
    const chunk = createChunk(`common/vpt/${name}`, 'normal-capsule')
    const output = emit({ [chunk.fileName]: chunk })
    assert.deepEqual(parseSync(miniTransportFileName, output.source).errors, [])
    const load = evaluate(output.source, (id) => id)
    assert.equal(load(chunk.fileName), `./${name}`)
    assert.ok(output.source.includes(`require(${JSON.stringify(`./${name}`)})`))
})

test('regenerates a closed routing table from each final bundle without retaining removed routes', () => {
    const oldChunk = createChunk('common/old.js', 'normal-capsule')
    const newChunk = createChunk('sub/p_test/common/new.js', 'normal-capsule')
    const first = emit({ [oldChunk.fileName]: oldChunk })
    const second = emit({ [newChunk.fileName]: newChunk })
    assert.ok(first.source.includes('common/old.js'))
    assert.doesNotMatch(second.source, /old\.js/)
    assert.ok(second.source.includes('require.async("../../sub/p_test/common/new.js")'))
    assert.deepEqual(first, emit({ [oldChunk.fileName]: oldChunk }))
})

test('emits an empty table without loading native shells', () => {
    const shell = createChunk('app.js', 'native')
    const output = createTransportOutput({
        bundle: { [shell.fileName]: shell },
        classifyModule,
        getPackageLocation: () => assert.fail('Native shells have no transport route')
    })
    const load = evaluate(output.source, () => assert.fail('An empty table must never load a module'))
    assert.throws(() => load('missing.js'), { message: 'Unknown module: missing.js' })
})

test('rejects amphibious modules outside the main package', () => {
    const bootstrap = createChunk('sub/p_test/common/bootstrap.js', 'amphibious')
    assert.throws(() => emit({ [bootstrap.fileName]: bootstrap }), {
        message: `Amphibious module must be in the main package: ${bootstrap.fileName}`
    })
})
