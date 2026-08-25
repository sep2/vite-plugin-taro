import assert from 'node:assert/strict'
import test from 'node:test'
import * as types from '@babel/types'
import { replaceWithAst } from './transform.ts'

test('rejects absent and duplicate AST placeholders before transforming', async () => {
    await assert.rejects(
        () => replaceWithAst('export const value = 1', 'fixture.ts', { __VALUE__: types.numericLiteral(2) }, false),
        /Expected one placeholder __VALUE__, found 0/
    )
    await assert.rejects(
        () =>
            replaceWithAst(
                'export const first = __VALUE__; export const second = __VALUE__',
                'fixture.ts',
                { __VALUE__: types.numericLiteral(2) },
                false
            ),
        /Expected one placeholder __VALUE__, found 2/
    )
})

test('rejects placeholders that occur outside replaceable expressions', async () => {
    await assert.rejects(
        () =>
            replaceWithAst(
                "export const value = '__VALUE__'",
                'fixture.ts',
                { __VALUE__: types.numericLiteral(2) },
                false
            ),
        /Failed to replace placeholder __VALUE__ in fixture\.ts/
    )
})

test('returns transformed code without a map when sourcemaps are disabled', async () => {
    const transformed = await replaceWithAst(
        'export const value = __VALUE__',
        'fixture.ts',
        {
            __VALUE__: types.objectExpression([
                types.objectProperty(types.identifier('answer'), types.numericLiteral(42))
            ])
        },
        false
    )

    assert.match(transformed.code, /answer:\s*42/)
    assert.equal(transformed.map, null)
})
