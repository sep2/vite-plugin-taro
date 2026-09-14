import assert from 'node:assert/strict'
import test from 'node:test'
import { minifyMiniStylesheet } from './minify-mini-stylesheet.ts'

const css = `
    @import "./shared.wxss";
    /* ordinary comment */
    .py-5_d5 > view {
        --gap: 8rpx;
        --empty: ;
        --pair: var(--empty,) 10rpx;
        margin: 0rpx 16rpx;
        width: calc(100% - 32rpx);
        transform: translateX(20rpx);
        -webkit-user-select: none;
        user-select: none;
        content: "two  spaces ; : {}";
        background-image: url("./a b.png");
        animation: fade 1s linear;
    }
    @keyframes fade {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .first { padding: 2rpx; }
    .second { padding: 4rpx; }
`

for (const minify of [true, 'lightningcss'] as const) {
    test(`preserves native CSS semantics when minifying with ${minify}`, async () => {
        const output = await minifyMiniStylesheet(css, { filename: 'assets/global.wxss', minify })

        assert.ok(Buffer.byteLength(output) < Buffer.byteLength(css))
        assert.doesNotMatch(output, /ordinary comment/)
        assert.match(output, /@import[\s]*["']\.\/shared\.wxss["']/)
        assert.match(output, /\.py-5_d5>view\{/)
        assert.match(output, /--gap:\s*8rpx/)
        assert.match(output, /--empty: ;/)
        assert.match(output, /--pair:\s*var\(--empty,\) 10rpx/)
        assert.match(output, /margin:0rpx 16rpx/)
        assert.match(output, /width:calc\(100% - 32rpx\)/)
        assert.match(output, /transform:translateX\(20rpx\)/)
        assert.match(output, /-webkit-user-select:none;user-select:none/)
        assert.match(output, /content:["']two {2}spaces ; : \{\}["']/)
        assert.match(output, /url\(["']\.\/a b\.png["']\)/)
        assert.match(output, /animation:.*\bfade\b/)
        assert.match(output, /@keyframes fade\{/)
        assert.ok(output.indexOf('.first') < output.indexOf('.second'))
    })
}

const rpxCases = [
    {
        name: 'zero, integer, negative and fractional dimensions',
        source: '.units { width: 750rpx; margin: 0rpx -0.5rpx 12.25rpx; }',
        expected: '.units{width:750rpx;margin:0rpx -.5rpx 12.25rpx}'
    },
    {
        name: 'custom properties and var fallbacks',
        source: '.units { --gap: 8.5rpx; gap: var(--gap, 2.25rpx); margin-left: var(--offset, -0.5rpx); }',
        expected: '.units{--gap:8.5rpx;gap:var(--gap,2.25rpx);margin-left:var(--offset,-.5rpx)}'
    },
    {
        name: 'mixed-unit calc and clamp expressions',
        source: '.units { width: calc(100% - 32.5rpx); font-size: clamp(12rpx, 2vw, 24.5rpx); }',
        expected: '.units{width:calc(100% - 32.5rpx);font-size:clamp(12rpx, 2vw, 24.5rpx)}'
    },
    {
        name: 'transforms and shadows',
        source: '.units { transform: translate3d(-0.5rpx, 12.25rpx, 0rpx); box-shadow: 0rpx 2rpx 4.5rpx #123456; }',
        expected: '.units{transform:translate3d(-.5rpx, 12.25rpx, 0rpx);box-shadow:0rpx 2rpx 4.5rpx #123456}'
    },
    {
        name: 'declarations inside media rules and keyframes',
        source: '@media (orientation: landscape) { .units { padding: 16.5rpx; } } @keyframes slide { from { left: -24.5rpx; } to { left: 0rpx; } }',
        expected:
            '@media (orientation:landscape){.units{padding:16.5rpx}}@keyframes slide{0%{left:-24.5rpx}to{left:0rpx}}'
    }
] as const

for (const extension of ['wxss', 'acss']) {
    for (const fixture of rpxCases) {
        test(`preserves rpx in ${extension}: ${fixture.name}`, async () => {
            const options = { filename: `assets/global.${extension}`, minify: true }
            const output = await minifyMiniStylesheet(fixture.source, options)
            assert.equal(output, fixture.expected)
            // Repeated complete builds and HMR finalization must never rescale native units or drift their values.
            assert.equal(await minifyMiniStylesheet(output, options), output)
        })
    }

    test(`reports Lightning CSS's unsupported rpx media-query breakpoints in ${extension}`, async () => {
        const source = '@media (min-width: 375rpx) { .units { padding: 16.5rpx; } }'
        const filename = `assets/global.${extension}`
        // Lightning CSS accepts native units in declarations, but its media-feature parser requires standard CSS units.
        // Keep this limitation explicit: enabling error recovery would silently discard the whole media rule.
        await assert.rejects(() => minifyMiniStylesheet(source, { filename, minify: true }), /Invalid media query/)
        assert.equal(await minifyMiniStylesheet(source, { filename, minify: false }), source)
    })
}

test('returns byte-identical styles when minification is disabled', async () => {
    for (const minify of [false, undefined]) {
        assert.equal(await minifyMiniStylesheet(css, { filename: 'assets/global.acss', minify }), css)
    }
})

test('rejects invalid native output instead of publishing partially minified CSS', async () => {
    await assert.rejects(
        () => minifyMiniStylesheet('.broken { color: red; } }', { filename: 'assets/global.wxss', minify: true }),
        Error
    )
})
