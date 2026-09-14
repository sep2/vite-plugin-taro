import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveConfig } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import vpt from '../../../vpt.ts'
import { miniBrowserBindings } from './mini-browser-bindings.ts'

async function resolvePolyfillConfig(
    target: VptOptions['target'],
    polyfills: VptOptions['polyfills'],
    command: 'serve' | 'build'
) {
    return resolveConfig(
        {
            configFile: false,
            plugins: vpt({ target, app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {}, polyfills })
        },
        command
    )
}

for (const polyfills of [undefined, [], ['web.url'], ['web.url-search-params'], ['es.array.at']]) {
    test(`keeps only renderer bindings with polyfills ${JSON.stringify(polyfills)}`, async () => {
        const config = await resolvePolyfillConfig('wx', polyfills, 'build')
        const inject = config.build.rolldownOptions.transform?.inject
        assert.deepEqual(inject, miniBrowserBindings)
        assert.ok(inject)
        assert.equal(Object.hasOwn(inject, 'URL'), false)
        assert.equal(Object.hasOwn(inject, 'URLSearchParams'), false)
    })
}

for (const name of ['URL', '../index', 'core-js/stable', 'web.url.js', 'not-a-polyfill']) {
    test(`rejects unsupported core-js module selection ${JSON.stringify(name)}`, async () => {
        await assert.rejects(
            resolvePolyfillConfig('wx', [name], 'build'),
            /(?:Invalid|Unknown) core-js polyfill module/
        )
    })
}

for (const target of ['wx', 'zfb', 'h5'] as const) {
    for (const command of ['serve', 'build'] as const) {
        test(`${target} ${command}: only Mini development rewrites performance.now`, async () => {
            const config = await resolvePolyfillConfig(target, [], command)
            assert.equal(
                config.define?.['performance.now'],
                target !== 'h5' && command === 'serve' ? 'Date.now' : undefined
            )
        })
    }
}

test('H5 ignores the mini-only option instead of resolving or bundling core-js', async () => {
    const config = await resolvePolyfillConfig('h5', ['not-a-polyfill'], 'build')
    assert.equal(
        config.plugins.some((plugin) => plugin.name === 'vpt:mini-polyfills'),
        false
    )
    assert.equal(config.build.rolldownOptions.transform?.inject, undefined)
})
