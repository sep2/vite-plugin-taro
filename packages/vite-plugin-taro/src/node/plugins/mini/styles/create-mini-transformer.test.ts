import assert from 'node:assert/strict'
import test from 'node:test'
import { createMiniTransformer } from './create-mini-transformer.ts'

const classSet = new Set(['px-1.25', 'py-5.5', 'w-1/2'])

test('provides only scoped HTML display defaults once in every complete global projection', async () => {
    const transformer = createMiniTransformer()
    const css = await transformer.transformStylesheet('')
    assert.match(css, /\.h5-span,\s*\.h5-a\s*\{\s*display:\s*inline/)
    assert.match(css, /\.h5-button,\s*\.h5-input,\s*\.h5-textarea,\s*\.h5-progress\s*\{\s*display:\s*inline-block/)
    assert.match(css, /\.h5-template,\s*\.h5-datalist\s*\{\s*display:\s*none/)
    assert.doesNotMatch(css, /\.h5-(?:li|meter)\b/)
    assert.equal((css.match(/\.h5-span/g) ?? []).length, 1)
    assert.deepEqual(
        Array.from(css.matchAll(/([\w-]+)\s*:/g), (match) => match[1]),
        ['display', 'display', 'display']
    )
    assert.doesNotMatch(css, /@layer|!important/)
    // Runtime provides br's newline; unmapped tags and the unsupported select need more than CSS.
    assert.doesNotMatch(css, /\.h5-(?:br|ins|select|table|tr|td|th|thead|tbody|tfoot|h[1-6])\b/)
    assert.doesNotMatch(css, /(?:^|})\s*(?:view|text|navigator)\s*\{/)
    assert.equal(await transformer.transformStylesheet(''), css)
})

test('prepends HTML defaults before flattened utilities and application overrides', async () => {
    const css = await createMiniTransformer().transformStylesheet(`
        @layer theme, base, components, utilities;
        @layer utilities { .block { display: block } .flex { display: flex } }
        @layer base { span { display: inline-block } }
        .custom { display: grid }
    `)
    const baseIndex = css.indexOf('display: inline;')
    const overrideIndex = css.lastIndexOf('display: inline-block')
    assert.ok(baseIndex >= 0)
    assert.ok(overrideIndex > baseIndex)
    assert.ok(css.indexOf('.block') > overrideIndex)
    assert.ok(css.indexOf('.flex') > overrideIndex)
    assert.ok(css.indexOf('.custom') > css.indexOf('.flex'))
    assert.doesNotMatch(css, /@layer/)
})

test('preserves explicit and implicit application layer ordering without reserving base', async () => {
    for (const order of ['', '@layer utilities, base;', '@layer base, utilities;']) {
        const css = await createMiniTransformer().transformStylesheet(`
            ${order}
            @layer utilities { .utility { display: block } }
            @layer base { .application-base { display: flex } }
        `)
        const utilityIndex = css.indexOf('.utility')
        const baseIndex = css.indexOf('.application-base')
        assert.ok(utilityIndex > css.indexOf('.h5-span'))
        assert.ok(baseIndex > css.indexOf('.h5-span'))
        assert.equal(baseIndex < utilityIndex, order === '@layer base, utilities;')
        assert.doesNotMatch(css, /@layer/)
    }
})

test('maps HTML selectors without another reset or changing native view selectors', async () => {
    const css = await createMiniTransformer().transformStylesheet(
        'div.card, span { color: red } a[href] { color: blue } view, .utility { display: flex }'
    )
    assert.match(css, /\.h5-div\.card/)
    assert.match(css, /\.h5-span/)
    assert.match(css, /\.h5-a\[href\]/)
    assert.match(css, /view/)
    assert.match(css, /\.utility/)
    assert.doesNotMatch(css, /\.h5-view/)
})

test('retains native prefix exceptions without adding browser prefixes', async () => {
    const css = await createMiniTransformer().transformStylesheet(`
        .clamped { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2 }
        .unprefixed { user-select: none; appearance: none }
    `)
    assert.match(css, /display:\s*-webkit-box/)
    assert.match(css, /-webkit-box-orient:\s*vertical/)
    assert.match(css, /-webkit-line-clamp:\s*2/)
    assert.match(css, /\.unprefixed\s*\{\s*user-select:\s*none;\s*appearance:\s*none\s*\}/)
    assert.doesNotMatch(css, /-(?:webkit|moz|ms)-(?:appearance|user-select)/)
})

test('rewrites only generated Tailwind classes in strings and template elements', () => {
    const transformer = createMiniTransformer()
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
    const transformer = createMiniTransformer()
    const code = 'const template = `px-1.25 $' + '{first} py-5.5 $' + '{second} w-1/2`'

    assert.equal(
        transformer.transformJavaScript({ classSet, code, filename: 'entry.ts' }),
        'const template = `px-1_d25 $' + '{first} py-5_d5 $' + '{second} w-1_f2`'
    )
})

test('leaves slash paths and URLs intact while rewriting slash-based classes', () => {
    const transformer = createMiniTransformer()
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
    const transformer = createMiniTransformer()
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
    const transformer = createMiniTransformer()

    assert.throws(
        () => transformer.transformJavaScript({ classSet, code: "export const = 'py-5.5'", filename: 'entry.js' }),
        /Failed to transform Tailwind classes/
    )
})
