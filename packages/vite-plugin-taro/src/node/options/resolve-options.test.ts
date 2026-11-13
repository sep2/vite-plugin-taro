import assert from 'node:assert/strict'
import test from 'node:test'
import type { VptOptions } from '../../options.ts'
import { resolveOptions } from './resolve-options.ts'

test('resolves page order while preserving other options and caller input', () => {
    const input: VptOptions = {
        target: 'wx',
        app: 'src/app.tsx',
        pages: [
            { path: 'pages/profile/index', config: { navigationBarTitleText: 'Profile' } },
            { path: 'pages/home/index', entry: true, prerender: true }
        ],
        appJson: { window: { navigationBarTitleText: 'App' } },
        projectConfigJson: { appid: 'fixture-app' },
        renderer: 'dom',
        hmr: { mode: 'devtools' },
        polyfills: ['es.array.at']
    }
    const original = structuredClone(input)
    Object.freeze(input)
    Object.freeze(input.pages)

    const resolved = resolveOptions(input)

    assert.notStrictEqual(resolved, input)
    assert.notStrictEqual(resolved.pages, input.pages)
    assert.deepEqual(resolved, { ...input, pages: [input.pages[1], input.pages[0]] })
    assert.strictEqual(resolved.pages[0], input.pages[1])
    assert.strictEqual(resolved.appJson, input.appJson)
    assert.strictEqual(resolved.projectConfigJson, input.projectConfigJson)
    assert.deepEqual(input, original)
})

test('validates entry selection when resolving options', () => {
    assert.throws(
        () =>
            resolveOptions({
                target: 'h5',
                app: 'src/app.tsx',
                pages: [
                    { path: 'pages/home/index', entry: true },
                    { path: 'pages/profile/index', entry: true }
                ],
                appJson: {},
                projectConfigJson: {}
            }),
        /Only one page may set entry: true/
    )
})
