import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { build as bundle } from 'rolldown'
import { build, normalizePath, resolveConfig } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { packageRequire } from '../../../utils/packages.ts'
import { wrapPluginTransform } from '../../../utils/vite.ts'
import vpt from '../../../vpt.ts'
import { miniPolyfillsId, vptGlobalBindingId } from '../module/module.ts'
import { createMiniPolyfillPlugin } from './create-mini-polyfill-plugin.ts'
import { miniBrowserBindings } from './mini-browser-bindings.ts'

const coreJsRoot = normalizePath(path.dirname(packageRequire.resolve('core-js/package.json')))
const options: VptOptions = { target: 'wx', app: 'app.tsx', pages: [], appJson: {}, projectConfigJson: {} }

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

for (const polyfills of [
    undefined,
    [],
    ['web.url'],
    ['web.url', 'web.url'],
    ['web.url-search-params'],
    ['es.array.at']
]) {
    test(`loads polyfills ${JSON.stringify(polyfills)} without changing renderer bindings`, async () => {
        const config = await resolvePolyfillConfig('wx', polyfills, 'build')
        const input = config.build.rolldownOptions.input
        assert.ok(input && typeof input === 'object' && !Array.isArray(input))
        assert.equal(input.polyfills, undefined)
        assert.equal(input['vpt-global'], undefined)
        const inject = config.build.rolldownOptions.transform?.inject
        assert.deepEqual(inject, { ...miniBrowserBindings, globalThis: [vptGlobalBindingId, 'vptGlobal'] })
        assert.equal(config.build.rolldownOptions.transform?.define?.__VPT_GLOBAL__, undefined)
        assert.ok(inject)
        assert.equal(Object.hasOwn(inject, 'window'), false)
        assert.equal(Object.hasOwn(inject, 'URL'), false)
        assert.equal(Object.hasOwn(inject, 'URLSearchParams'), false)
        const plugin = config.plugins.find((plugin) => plugin.name === 'vpt:mini-polyfills')
        const resolveId = plugin?.resolveId
        const load = plugin?.load
        assert.ok(resolveId && typeof resolveId === 'object' && load && typeof load === 'object')
        assert.equal(await Reflect.apply(resolveId.handler, {}, [miniPolyfillsId]), miniPolyfillsId)
        assert.equal(
            await Reflect.apply(load.handler, {}, [miniPolyfillsId]),
            [...new Set(polyfills)]
                .map((name) => `import ${JSON.stringify(packageRequire.resolve(`core-js/modules/${name}.js`))};`)
                .join('\n')
        )
    })
}

for (const target of ['wx', 'zfb'] as const) {
    test(`${target}: window remains a native free binding without importing Taro`, async () => {
        const config = await resolvePolyfillConfig(target, [], 'build')
        const entry = '/fixture/native-window.js'
        const result = await bundle({
            input: entry,
            plugins: [
                {
                    name: 'test:native-window',
                    resolveId: (id) => (id === entry ? entry : undefined),
                    load: (id) =>
                        id === entry
                            ? `
                    export const kind = typeof window;
                    export function read() { return window; }
                    export function local(window) { return window; }
                `
                            : undefined
                }
            ],
            transform: config.build.rolldownOptions.transform,
            output: { format: 'cjs' },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        assert.deepEqual(chunk.moduleIds, [entry])
        for (const available of [false, true]) {
            const nativeWindow = { native: true }
            // Only the emitted CommonJS module populates this execution-local exports object.
            const exports: Record<string, unknown> = {}
            runInNewContext(
                chunk.code,
                { exports, ...(available ? { window: nativeWindow } : {}) },
                {
                    contextCodeGeneration: { strings: false, wasm: false }
                }
            )
            assert.equal(exports.kind, available ? 'object' : 'undefined')
            const read = exports.read
            assert.ok(typeof read === 'function')
            if (available) {
                assert.equal(read(), nativeWindow)
            } else {
                assert.throws(() => read(), { name: 'ReferenceError', message: 'window is not defined' })
            }
            assert.ok(typeof exports.local === 'function')
            assert.equal(exports.local('local'), 'local')
        }
    })
}

for (const name of ['URL', '../index', 'core-js/stable', 'web.url.js', 'not-a-polyfill']) {
    test(`rejects unsupported core-js module selection ${JSON.stringify(name)} when polyfills load`, async () => {
        const config = await resolvePolyfillConfig('wx', [name], 'build')
        const load = config.plugins.find((plugin) => plugin.name === 'vpt:mini-polyfills')?.load
        assert.ok(load && typeof load === 'object')
        await assert.rejects(
            async () => Reflect.apply(load.handler, { environment: { config } }, [miniPolyfillsId]),
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

test('the content precheck admits browser bindings and both Unicode escape spellings', () => {
    const hook = createMiniPolyfillPlugin({ options }).transform
    assert.ok(hook && typeof hook === 'object')
    const filter = hook.filter
    assert.ok(filter && !Array.isArray(filter) && filter.code instanceof RegExp)
    assert.equal(filter.code.test('module.exports = Object.keys'), false)
    assert.equal(filter.code.test('const documentInfo = 1'), false)
    assert.equal(filter.code.test('module.exports = typeof window'), false)
    for (const name of Object.keys(miniBrowserBindings)) {
        assert.equal(filter.code.test(`module.exports = ${name}`), true, name)
    }
    assert.equal(filter.code.test(String.raw`module.exports = wi\u006Edow`), true)
    assert.equal(filter.code.test(String.raw`module.exports = do\u{63}ument`), true)
})

test('native filters dispatch only physical core-js sources that may reference browser bindings', async () => {
    const eligibleSources: ReadonlyMap<string, string> = new Map([
        ...Object.keys(miniBrowserBindings).map(
            (name) => [`${coreJsRoot}/internals/vpt-${name}.js`, `export const value = ${name}`] as const
        ),
        [`${coreJsRoot}/internals/vpt-escaped.js`, String.raw`export const value = [wi\u006Edow, do\u{63}ument]`],
        [`${coreJsRoot}/internals/vpt-query.js?import`, 'export const value = document'],
        [`${coreJsRoot}/internals/vpt-local.js`, 'export function identity(document) { return document }'],
        [`${coreJsRoot}/internals/vpt-text.js`, "export const value = 'window navigator'"]
    ])
    const sources: ReadonlyMap<string, string> = new Map([
        ...eligibleSources,
        [`${coreJsRoot}/internals/vpt-no-host.js`, 'export const value = Object.keys({})'],
        [`${coreJsRoot}/internals/vpt-substring.js`, 'const documentInfo = 1; export const value = documentInfo'],
        [`${coreJsRoot}/internals/vpt-native-window.js`, 'export const value = typeof window'],
        [`${coreJsRoot}-other/index.js`, 'export const value = document'],
        ['/fixture/app.js', 'export const value = document'],
        [`/fixture/query.js?module=${coreJsRoot}/internals/global-this.js`, 'export const value = document'],
        [miniPolyfillsId, 'export const value = document']
    ])
    const plugin = createMiniPolyfillPlugin({ options })
    // Count actual JS dispatches, including conservative false positives for local names and text.
    const calls: string[] = []
    wrapPluginTransform(
        plugin,
        (transform) =>
            function (code, id, options) {
                calls.push(id)
                return transform.call(this, code, id, options)
            }
    )
    const result = await build({
        configFile: false,
        logLevel: 'silent',
        plugins: [
            {
                name: 'test:polyfill-sources',
                resolveId: (id) => (sources.has(id) ? id : undefined),
                load: (id) => sources.get(id)
            },
            // Isolate the real transform and Vite context from configuration-owned renderer injection and entry loading.
            { name: plugin.name, transform: plugin.transform }
        ],
        build: {
            write: false,
            minify: false,
            rolldownOptions: { input: Array.from(sources.keys()) }
        }
    })

    assert.deepEqual(calls.toSorted(), Array.from(eligibleSources.keys()).toSorted())
    assert.ok(!Array.isArray(result) && 'output' in result)
    assert.equal(result.output.filter((chunk) => chunk.type === 'chunk' && chunk.isEntry).length, sources.size)
})

for (const sourcemap of [false, true, 'inline', 'hidden'] as const) {
    test(`host rewriting preserves lexical bindings with sourcemap ${sourcemap}`, async () => {
        const hook = createMiniPolyfillPlugin({ options }).transform
        assert.ok(hook && typeof hook === 'object')
        const names = Object.keys(miniBrowserBindings)
        const localValues = names.map((name) => `local:${name}`)
        const source = `module.exports = {
            hosts: [${names.join(',')}],
            parameters(${names.join(',')}) { return [${names.join(',')}] },
            locals() {
                ${names.map((name) => `const ${name} = 'local:${name}'`).join(';')}
                return [${names.join(',')}]
            },
            escaped: [${String.raw`wi\u006Edow, do\u{63}ument`}],
            text: ${JSON.stringify(names.join(' '))}
        }`
        const id = `${coreJsRoot}/internals/vpt-scope.js`
        const result: unknown = await Reflect.apply(
            hook.handler,
            { environment: { config: { build: { sourcemap } } } },
            [source, id]
        )
        assert.ok(result && typeof result === 'object' && 'code' in result && typeof result.code === 'string')
        assert.equal(Boolean('map' in result && result.map), Boolean(sourcemap))
        if (sourcemap) {
            assert.ok('map' in result && result.map && typeof result.map === 'object')
            assert.ok('sources' in result.map && 'sourcesContent' in result.map && 'mappings' in result.map)
            assert.deepEqual(result.map.sources, [id])
            assert.deepEqual(result.map.sourcesContent, [source])
            assert.ok(typeof result.map.mappings === 'string' && result.map.mappings.length > 0)
        }

        // Managed names resolve on the host; unmanaged window keeps ordinary lexical lookup.
        runInNewContext(
            `(function(window, ${names.join(',')}) {
                ${result.code}
                assert.deepEqual(module.exports.hosts, [${names.map((name) => `globalThis.${name}`).join(',')}])
                assert.deepEqual(module.exports.parameters(...${JSON.stringify(localValues)}), ${JSON.stringify(localValues)})
                assert.deepEqual(module.exports.locals(), ${JSON.stringify(localValues)})
                assert.deepEqual(module.exports.escaped, ['local:window', globalThis.document])
                assert.equal(module.exports.text, ${JSON.stringify(names.join(' '))})
            })('local:window', ...${JSON.stringify(localValues)})`,
            {
                assert,
                module: { exports: {} },
                ...Object.fromEntries(names.map((name) => [name, `host:${name}`]))
            },
            { contextCodeGeneration: { strings: false, wasm: false } }
        )
    })
}

test('H5 ignores the mini-only option instead of resolving or bundling core-js', async () => {
    const config = await resolvePolyfillConfig('h5', ['not-a-polyfill'], 'build')
    assert.equal(
        config.plugins.some((plugin) => plugin.name === 'vpt:mini-polyfills'),
        false
    )
    assert.equal(config.build.rolldownOptions.transform?.inject, undefined)
})
