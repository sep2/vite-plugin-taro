import assert from 'node:assert/strict'
import test from 'node:test'
import type { VptTarget } from '../../../options.ts'
import { createConditionalDirectivePlugin } from './conditional-directives.ts'

/** Applies the conditional transform for one target. */
function transform(code: string, target: VptTarget): string {
    const hook = createConditionalDirectivePlugin(target).transform
    if (!hook) {
        throw new Error('Expected a transform hook')
    }
    const handler = typeof hook === 'function' ? hook : hook.handler
    const result = handler.call({} as never, code, 'example.ts')
    if (!result || result instanceof Promise || typeof result === 'string' || !result.code) {
        throw new Error('Expected transformed code')
    }
    return result.code as string
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
