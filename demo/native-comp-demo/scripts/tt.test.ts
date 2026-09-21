import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build, normalizePath, type Rolldown } from 'vite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const nativeRoot = path.join(projectRoot, 'src/native/tt/native-counter')
type BuildOutput = readonly (Rolldown.OutputAsset | Rolldown.OutputChunk)[]

type CounterDefinition = {
    properties: { count: { type: NumberConstructor; value: number } }
    methods: {
        increment(this: {
            properties: { count: number }
            triggerEvent: (name: string, detail: { value: number }) => void
        }): void
    }
}

test('TT counter emits the next controlled value without mutating its input property', async (context) => {
    const register = context.mock.fn((definition: CounterDefinition) => {
        assert.equal(definition.properties.count.type.name, 'Number')
        assert.equal(definition.properties.count.value, 0)

        for (const count of [0, 7, -1]) {
            const properties = { count }
            const triggerEvent = context.mock.fn((name: string, detail: { value: number }) => {
                assert.equal(name, 'increment')
                assert.equal(detail.value, count + 1)
            })
            definition.methods.increment.call({ properties, triggerEvent })
            assert.equal(triggerEvent.mock.callCount(), 1)
            assert.equal(properties.count, count)
        }
    })

    runInNewContext(await readFile(path.join(nativeRoot, 'counter.js'), 'utf8'), { Component: register })
    assert.equal(register.mock.callCount(), 1)
})

test('builds the real TT demo with native assets, named slots, events, and a lazy common package', async (context) => {
    // Vite's real config reads process.env; restore these test-local overrides after the build.
    for (const [name, value] of Object.entries({
        VITE_VPT_TARGET: 'tt',
        VITE_VPT_TIKTOK_APP_ID: 'tt-native-component-test'
    })) {
        const previous = process.env[name]
        process.env[name] = value
        context.after(() => {
            if (previous === undefined) {
                delete process.env[name]
            } else {
                process.env[name] = previous
            }
        })
    }

    const result = await build({
        root: projectRoot,
        configFile: path.join(projectRoot, 'vite.config.ts'),
        logLevel: 'silent',
        build: { write: false }
    })
    assert.ok(!Array.isArray(result) && 'output' in result)
    const output = result.output

    const project = JSON.parse(asset(output, 'project.config.json'))
    assert.equal(project.appid, 'tt-native-component-test')
    assert.equal(project.miniprogramRoot, './')
    assert.equal(project.compileHotReload, true)
    assert.deepEqual(project.setting, {
        urlCheck: false,
        es6: false,
        postcss: false,
        minified: false,
        autoCompile: true
    })
    assert.deepEqual(JSON.parse(asset(output, 'project.private.config.json')), { setting: { urlCheck: false } })

    const lazyChunk = output.find(
        (entry) =>
            entry.type === 'chunk' &&
            entry.moduleIds.some((id) => normalizePath(id).endsWith('/src/pages/index/native-counter-demo.tsx'))
    )
    assert.ok(lazyChunk)
    const packageRoot = /^(sub\/p_[a-f0-9]{8})\//.exec(lazyChunk.fileName)?.[1]
    assert.ok(packageRoot)
    assert.deepEqual(JSON.parse(asset(output, 'app.json')), {
        pages: ['pages/index/index', 'pages/mirror/index'],
        window: { navigationBarTitleText: 'Native component demo' },
        subPackages: [{ root: packageRoot, pages: [], common: true }]
    })

    // App references the counter synchronously, so its opaque assets stay in the main package even for the lazy Page demo.
    const componentPath = '/components/native-counter/counter'
    for (const [page, title] of [
        ['pages/index/index', 'Native component demo'],
        ['pages/mirror/index', 'Retained App mirror']
    ]) {
        assert.deepEqual(JSON.parse(asset(output, `${page}.json`)), {
            navigationBarTitleText: title,
            usingComponents: {
                'native-counter': componentPath,
                comp: '../../comp',
                'custom-wrapper': '../../custom-wrapper'
            }
        })
        assert.match(asset(output, `${page}.ttml`), /<comp i="{{app}}" p="{{page}}" \/>/)
    }
    for (const fileName of ['comp.json', 'custom-wrapper.json']) {
        assert.equal(JSON.parse(asset(output, fileName)).usingComponents['native-counter'], componentPath)
    }

    for (const extension of ['js', 'json', 'ttml', 'ttss']) {
        assert.equal(
            asset(output, `components/native-counter/counter.${extension}`),
            await readFile(path.join(nativeRoot, `counter.${extension}`), 'utf8')
        )
    }
    assert.deepEqual(JSON.parse(asset(output, 'components/native-counter/counter.json')), { component: true })
    const nativeTemplate = asset(output, 'components/native-counter/counter.ttml')
    assert.match(nativeTemplate, /<slot name="title"><\/slot>/)
    assert.match(nativeTemplate, /bindtap="increment"/)
    assert.match(asset(output, 'base.ttml'), /<native-counter\s+count="{{i.count}}" bindincrement="eh"/)
    assert.match(asset(output, 'base.ttml'), /<view slot="{{i.p0}}"/)
    assert.match(asset(output, 'app.ttss'), /assets\/global\.ttss/)
    assert.ok(asset(output, 'assets/global.ttss').length > 0)
    assert.match(asset(output, 'common/vpt/transport.js'), /require\.async/)

    assert.equal(
        output.some(({ fileName }) => /\.(?:wxml|wxss|axml|acss)$/.test(fileName)),
        false
    )
    const modules = output.flatMap((entry) => (entry.type === 'chunk' ? entry.moduleIds.map(normalizePath) : []))
    assert.ok(modules.some((id) => id.endsWith('/src/pages/index/tt-native-counter.tsx')))
    assert.equal(
        modules.some((id) => /\/(?:wx|zfb)-native-counter\.tsx$/.test(id)),
        false
    )
})

function asset(output: BuildOutput, fileName: string): string {
    const entry = output.find((entry) => entry.type === 'asset' && entry.fileName === fileName)
    assert.ok(entry?.type === 'asset', `Missing asset: ${fileName}`)
    return typeof entry.source === 'string' ? entry.source : Buffer.from(entry.source).toString('utf8')
}
