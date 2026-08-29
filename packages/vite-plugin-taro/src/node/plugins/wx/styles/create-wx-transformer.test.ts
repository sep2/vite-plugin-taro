import assert from 'node:assert/strict'
import test from 'node:test'
import { createWxTransformer } from './create-wx-transformer.ts'

const classSet = new Set(['px-1.25', 'py-5.5', 'w-1/2'])

test('rewrites only generated Tailwind classes in strings and template elements', () => {
    const transformer = createWxTransformer()
    const code = [
        "const classes = 'py-5.5 w-1/2 pages/home/index mr-4.5'",
        'const template = `px-1.25 $' + '{value} py-5.5`'
    ].join('\n')

    assert.equal(
        transformer.transformJavaScript({ classSet, code, filename: 'entry.js' }),
        [
            "const classes = 'py-5_d5 w-1_f2 pages/home/index mr-4.5'",
            'const template = `px-1_d25 $' + '{value} py-5_d5`'
        ].join('\n')
    )
})

test('detects escaped source spellings before parsing arbitrary-value classes', () => {
    const transformer = createWxTransformer()
    const quotedClassSet = new Set(["before:content-['x']"])
    const code = "const value = 'before:content-[\\'x\\']'"

    assert.equal(
        transformer.transformJavaScript({ classSet: quotedClassSet, code, filename: 'entry.js' }),
        "const value = 'before_ccontent-_b_ax_a_B'"
    )
})

test('rejects malformed final JavaScript before exposing partial class rewrites', () => {
    const transformer = createWxTransformer()

    assert.throws(
        () => transformer.transformJavaScript({ classSet, code: "export const = 'py-5.5'", filename: 'entry.js' }),
        /Failed to transform Tailwind classes/
    )
})
