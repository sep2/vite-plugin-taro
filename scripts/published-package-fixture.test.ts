import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
    assertPublishedRenderer,
    getPublishedRenderers,
    nativeCounterProbeId,
    parseNativeCounterProperty,
    preparePublishedFixture
} from '../.agents/skills/test-published-packages/scripts/published-package-fixture.ts'

const template = new URL('../packages/create-vite-taro/templates/default/', import.meta.url)
const sources = Object.freeze({
    config: readFileSync(new URL('vite.config.ts', template), 'utf8'),
    page: readFileSync(new URL('src/pages/home/index.tsx', template), 'utf8'),
    counter: readFileSync(new URL('src/components/counter/counter.tsx', template), 'utf8'),
    nativeCounter: readFileSync(new URL('src/components/counter/native-counter.tsx', template), 'utf8')
})
const probe = { id: 'published-hmr-probe', text: 'Build naturally. Ship everywhere.' }

test('published checks select both renderers or one explicit renderer', () => {
    assert.deepEqual(getPublishedRenderers([]), ['template', 'dom'])
    assert.deepEqual(getPublishedRenderers(['--renderer', 'template']), ['template'])
    assert.deepEqual(getPublishedRenderers(['--renderer=dom']), ['dom'])
    assert.throws(() => getPublishedRenderers(['--renderer', 'other']), /--renderer must be template or dom/)
    assert.throws(() => getPublishedRenderers(['--unknown']))
    assert.throws(() => getPublishedRenderers(['dom']))
})

test('template fixtures preserve renderer configuration and install the visible text probe', () => {
    const fixture = preparePublishedFixture(sources, 'template', probe)
    assert.equal(fixture.config, sources.config)
    assert.match(fixture.page, /<Text id="published-hmr-probe"/)
    assert.equal(fixture.counter, sources.counter)
    assert.equal(fixture.nativeCounter, sources.nativeCounter)
    assert.doesNotMatch(fixture.page, /published-native-counter/)
})

test('DOM fixtures replace the scaffold renderer and identify the native component with a standard element id', () => {
    const fixture = preparePublishedFixture(sources, 'dom', probe)
    assert.equal(fixture.config, sources.config.replace("renderer: 'template'", "renderer: 'dom'"))
    assert.ok(fixture.page.includes(`id="${nativeCounterProbeId}"`))
    assert.match(fixture.counter, /id\?: string\n {4}count: number/)
    assert.match(fixture.nativeCounter, /id\?: string\n {4}count: number/)
    assert.ok(fixture.page.includes(probe.text))
})

test('renderer fixtures are independent of preparation order', () => {
    const dom = preparePublishedFixture(sources, 'dom', probe)
    const template = preparePublishedFixture(sources, 'template', probe)
    assert.deepEqual(preparePublishedFixture(sources, 'dom', probe), dom)
    assert.deepEqual(preparePublishedFixture(sources, 'template', probe), template)
    assert.equal(sources.page.includes(probe.id), false)
    assert.equal(sources.counter.includes('id?: string'), false)
})

test('scaffold contract changes fail before an invalid renderer test can run', () => {
    assert.throws(() => preparePublishedFixture({ ...sources, config: '' }, 'dom', probe), /renderer configuration/)
    assert.throws(
        () =>
            preparePublishedFixture(
                { ...sources, config: sources.config.replace("                renderer: 'template',\n", '') },
                'dom',
                probe
            ),
        /renderer configuration/
    )
    assert.throws(
        () => preparePublishedFixture({ ...sources, config: sources.config.repeat(2) }, 'dom', probe),
        /renderer configuration/
    )
    assert.throws(() => preparePublishedFixture({ ...sources, page: '' }, 'template', probe), /source occurrence/)
    assert.throws(
        () => preparePublishedFixture({ ...sources, page: sources.page.repeat(2) }, 'template', probe),
        /source occurrence/
    )
    assert.throws(() => preparePublishedFixture({ ...sources, page: probe.text }, 'template', probe), /HMR probe Text/)
    const identified = preparePublishedFixture(sources, 'template', probe).page
    assert.throws(
        () => preparePublishedFixture({ ...sources, page: identified }, 'template', probe),
        /already has an id/
    )
    assert.throws(() => preparePublishedFixture({ ...sources, counter: '' }, 'dom', probe), /count declaration/)
    assert.throws(() => preparePublishedFixture({ ...sources, nativeCounter: '' }, 'dom', probe), /count declaration/)
    assert.throws(
        () =>
            preparePublishedFixture(
                { ...sources, page: sources.page.replace('<Counter\n', '<OtherCounter\n') },
                'dom',
                probe
            ),
        /native counter element/
    )
})

test('native counter properties preserve integer values from DevTools', () => {
    for (const [value, expected] of [
        ['0', 0],
        ['1', 1],
        ['-2', -2],
        ['100', 100]
    ] as const) {
        assert.equal(parseNativeCounterProperty(value), expected)
    }
    for (const value of [undefined, null, 0, '', ' ', 'NaN', 'Infinity', '1.5', '1e2', {}, []]) {
        assert.throws(() => parseNativeCounterProperty(value), /integer native counter property/)
    }
    assert.throws(() => parseNativeCounterProperty('9007199254740992'), /safe integer range/)
})

test('renderer verification detects DOM activation and template fallback', () => {
    assert.doesNotThrow(() => assertPublishedRenderer('dom', { nativeRoot: true, dataKeys: ['__webviewId__'] }))
    assert.doesNotThrow(() =>
        assertPublishedRenderer('template', { nativeRoot: false, dataKeys: ['page', '__webviewId__'] })
    )
    assert.throws(
        () => assertPublishedRenderer('dom', { nativeRoot: false, dataKeys: ['page'] }),
        /Expected dom renderer/
    )
    assert.throws(
        () => assertPublishedRenderer('template', { nativeRoot: true, dataKeys: [] }),
        /Expected template renderer/
    )
    assert.throws(
        () => assertPublishedRenderer('dom', { nativeRoot: true, dataKeys: ['page'] }),
        /Expected dom renderer/
    )
    for (const environment of [
        {},
        { nativeRoot: 'true', dataKeys: [] },
        { nativeRoot: true, dataKeys: null },
        { nativeRoot: true, dataKeys: [1] }
    ]) {
        assert.throws(() => assertPublishedRenderer('dom', environment), /Invalid native renderer environment/)
    }
})
