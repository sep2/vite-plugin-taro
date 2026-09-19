import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import type { VptTarget } from '../../../options.ts'
import { createConditionalDirectivePlugin } from './conditional-directives.ts'

/** Applies the conditional transform for one target. */
function transform(code: string, target: VptTarget): string {
    const hook = createConditionalDirectivePlugin(target).transform
    assert.ok(hook && typeof hook === 'object')
    const result: unknown = Reflect.apply(hook.handler, {}, [code, 'example.ts'])
    assert.ok(result && typeof result === 'object' && 'code' in result && typeof result.code === 'string')
    return result.code
}

test('bypasses sources without directives and dependencies outside application source', async () => {
    const hook = createConditionalDirectivePlugin('wx').transform
    assert.ok(hook)
    const handler = typeof hook === 'function' ? hook : hook.handler

    assert.equal(await Reflect.apply(handler, {}, ['export const value = true', 'example.ts']), undefined)
    assert.equal(
        await Reflect.apply(handler, {}, [
            '// #ifdef wx\nexport const value = true\n// #endif\n',
            '/node_modules/pkg/index.ts'
        ]),
        undefined
    )
    assert.equal(await Reflect.apply(handler, {}, ['// #ifdef wx\nvalue\n// #endif\n', 'example.txt']), undefined)
})

for (const target of ['wx', 'zfb', 'tt', 'h5'] as const) {
    test(`${target}: native filters invoke the handler only for eligible application sources`, async () => {
        const plugin = createConditionalDirectivePlugin(target)
        assert.equal(plugin.enforce, 'pre')
        const hook = plugin.transform
        assert.ok(hook && typeof hook === 'object')
        // Record actual JS entries while leaving Rolldown responsible for evaluating the original native filters.
        const calls: string[] = []
        plugin.transform = {
            ...hook,
            handler(code, id, options) {
                calls.push(id)
                return hook.handler.call(this, code, id, options)
            }
        }

        const extensions = [
            'js',
            'jsx',
            'ts',
            'tsx',
            'cjs',
            'cjsx',
            'cts',
            'ctsx',
            'mjs',
            'mjsx',
            'mts',
            'mtsx',
            'css',
            'scss',
            'sass',
            'less',
            'styl'
        ]
        const eligibleIds = new Set([
            ...extensions.flatMap((extension) => [
                `/fixture/src/example.${extension}`,
                `/fixture/src/example.${extension}?direct`
            ]),
            '/fixture/src/node_modules-like/example.ts',
            '/fixture/src/query.ts?source=/node_modules/pkg/index.js'
        ])
        const skippedIds = [
            '/fixture/node_modules/pkg/index.ts',
            '/fixture/node_modules/.pnpm/pkg@1/node_modules/pkg/index.css?direct',
            '/fixture/src/example.json',
            '/fixture/src/example.html',
            '/fixture/src/example.ts.map',
            '/fixture/src/no-extension',
            '/fixture/src/example.txt?filename=example.ts',
            '/fixture/src/example.ts.txt?direct'
        ]
        const otherTarget = target === 'h5' ? 'wx' : 'h5'
        const sources: ReadonlyMap<string, string> = new Map([
            ...Array.from(eligibleIds, (id, index) => {
                const directive = index % 2 === 0 ? `ifdef ${target}` : `ifndef ${otherTarget}`
                return [
                    id,
                    `/* #${directive} */\nglobalThis.fixture = 'retained-${target}'\n/* #else */\nglobalThis.fixture = 'discarded'\n/* #endif */\n`
                ] as const
            }),
            ...skippedIds.map(
                (id) => [id, `/* #ifdef ${otherTarget} */\nglobalThis.fixture = 'untouched'\n/* #endif */\n`] as const
            ),
            ['/fixture/src/plain.ts', "globalThis.fixture = 'untouched'"],
            ['/fixture/src/plain.css?direct', "globalThis.fixture = 'untouched'"],
            ['/fixture/src/other-directives.ts', "/* #else */\nglobalThis.fixture = 'untouched'\n/* #endif */"]
        ])
        const result = await build({
            input: Array.from(sources.keys()),
            plugins: [
                {
                    name: 'test:conditional-sources',
                    resolveId: (id) => (sources.has(id) ? id : undefined),
                    load(id) {
                        const code = sources.get(id)
                        assert.ok(code !== undefined)
                        // All fixtures use JS so stylesheet IDs test dispatch without requiring CSS preprocessors.
                        return { code, moduleType: 'js' }
                    }
                },
                plugin
            ],
            output: { format: 'es' },
            write: false
        })

        assert.deepEqual(calls.toSorted(), Array.from(eligibleIds).toSorted())
        const entries = result.output.filter((chunk) => chunk.type === 'chunk' && chunk.isEntry)
        assert.equal(entries.length, sources.size)
        for (const chunk of entries) {
            assert.ok(chunk.type === 'chunk' && chunk.facadeModuleId)
            const expected = eligibleIds.has(chunk.facadeModuleId) ? `retained-${target}` : 'untouched'
            assert.ok(chunk.code.includes(expected), chunk.facadeModuleId)
            assert.doesNotMatch(chunk.code, /discarded/)
        }
    })
}

test('keeps the active conditional branch and preserves line count', () => {
    const source = `// #ifdef wx
const platform = 'wx'
// #else
const platform = 'h5'
// #endif
`
    const result = transform(source, 'wx')

    assert.match(result, /const platform = 'wx'/)
    assert.doesNotMatch(result, /const platform = 'h5'/)
    assert.equal(result.split('\n').length, source.split('\n').length)
    assert.match(transform(source.trimEnd(), 'wx'), /const platform = 'wx'/)
})

test('supports nested ifndef blocks', () => {
    const source = `// #ifdef wx
// #ifndef h5
const enabled = true
// #endif
// #endif
`

    assert.match(transform(source, 'wx'), /const enabled = true/)
    assert.doesNotMatch(transform(source, 'h5'), /const enabled = true/)
})

test('keeps a nested else inactive when its parent target branch is inactive', () => {
    const source = `/* #ifdef h5 */
/* #ifdef wx */
const impossible = 'nested match'
/* #else */
const alsoImpossible = 'nested else'
/* #endif */
/* #endif */
const retained = true
`
    const result = transform(source, 'wx')

    assert.doesNotMatch(result, /nested match|nested else/)
    assert.match(result, /const retained = true/)
})

test('supports block-comment directives, case-insensitive targets, and CRLF line endings', () => {
    const source = [
        '/* #ifdef WX */',
        "const platform = 'wx'",
        '/* #else */',
        "const platform = 'h5'",
        '/* #endif */',
        ''
    ].join('\r\n')
    const result = transform(source, 'wx')

    assert.match(result, /const platform = 'wx'/)
    assert.doesNotMatch(result, /const platform = 'h5'/)
    assert.equal((result.match(/\r\n/g) ?? []).length, 5)
})

test('rejects expression directives', () => {
    assert.throws(
        () => transform('// #if wx && !h5\nconst enabled = true\n// #endif\n', 'wx'),
        /no longer supports #if/
    )
    assert.throws(
        () => transform('// #ifdef wx\nconst enabled = true\n// #elif h5\nconst fallback = true\n', 'wx'),
        /no longer supports #elif/
    )
})
