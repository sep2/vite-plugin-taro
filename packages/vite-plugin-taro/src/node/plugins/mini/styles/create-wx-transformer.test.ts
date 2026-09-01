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

test('rewrites TypeScript template spans without consuming their delimiters', () => {
    const transformer = createWxTransformer()
    const code = 'const template = `px-1.25 $' + '{first} py-5.5 $' + '{second} w-1/2`'

    assert.equal(
        transformer.transformJavaScript({ classSet, code, filename: 'entry.ts' }),
        'const template = `px-1_d25 $' + '{first} py-5_d5 $' + '{second} w-1_f2`'
    )
})

test('leaves slash paths and URLs intact while rewriting slash-based classes', () => {
    const transformer = createWxTransformer()
    const slashClassSet = new Set([
        '//cdn.example.com/app.js',
        'http://example.com/app.js',
        'https://example.com/app.js',
        'pages/home/index',
        'w-[1/2]',
        'variant:w-1/2'
    ])
    const code =
        "const value = '//cdn.example.com/app.js http://example.com/app.js https://example.com/app.js pages/home/index w-[1/2] variant:w-1/2'"

    assert.equal(
        transformer.transformJavaScript({ classSet: slashClassSet, code, filename: 'entry.js' }),
        "const value = '//cdn.example.com/app.js http://example.com/app.js https://example.com/app.js pages/home/index w-_b1_f2_B variant_cw-1_f2'"
    )
})

test('detects every escaped JavaScript spelling in arbitrary-value classes', () => {
    const transformer = createWxTransformer()
    const escapedClassSet = new Set([
        'before:content-["x"]',
        "before:content-['x\\y']",
        "before:content-['x\ny']",
        "before:content-['x\ry']",
        "before:content-['x\u2028y']",
        "before:content-['x\u2029y']"
    ])
    const code = [
        `const doubleQuote = 'before:content-["x"]'`,
        String.raw`const backslash = 'before:content-[\'x\\y\']'`,
        String.raw`const newline = 'before:content-[\'x\ny\']'`,
        String.raw`const carriageReturn = 'before:content-[\'x\ry\']'`,
        String.raw`const lineSeparator = 'before:content-[\'x\u2028y\']'`,
        String.raw`const paragraphSeparator = 'before:content-[\'x\u2029y\']'`
    ].join('\n')

    assert.equal(
        transformer.transformJavaScript({ classSet: escapedClassSet, code, filename: 'entry.js' }),
        [
            "const doubleQuote = 'before_ccontent-_b_qx_q_B'",
            "const backslash = 'before_ccontent-_b_ax_ry_a_B'",
            String.raw`const newline = 'before_ccontent-_b_ax\ny_a_B'`,
            String.raw`const carriageReturn = 'before_ccontent-_b_ax\ry_a_B'`,
            "const lineSeparator = 'before_ccontent-_b_axu_x2028_y_a_B'",
            "const paragraphSeparator = 'before_ccontent-_b_axu_x2029_y_a_B'"
        ].join('\n')
    )
})

test('rejects malformed final JavaScript before exposing partial class rewrites', () => {
    const transformer = createWxTransformer()

    assert.throws(
        () => transformer.transformJavaScript({ classSet, code: "export const = 'py-5.5'", filename: 'entry.js' }),
        /Failed to transform Tailwind classes/
    )
})
