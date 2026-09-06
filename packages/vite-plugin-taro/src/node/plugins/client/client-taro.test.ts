import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire, registerHooks } from 'node:module'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { build, type OutputChunk } from 'rolldown'
import { parseSync } from 'rolldown/utils'
import type { VptTarget } from '../../../options.ts'
import { packageRequire, resolveRuntimeFile } from '../../utils/packages.ts'
import { createClientTaroPlugin } from './client-taro.ts'

const frameworkId = 'vite-plugin-taro-runtime/plugin-framework-react/runtime'
const frameworkApisPath = resolveRuntimeFile('client/taro/framework-apis')
const frameworkNames = exportedNames(await readFile(frameworkApisPath, 'utf8'))
const frameworkSource = frameworkNames.map((name) => `export function ${name}() { return '${name}-marker' }`).join('\n')
const backendId = 'vite-plugin-taro-runtime/plugin-platform-h5/runtime/apis'
const backendSource = `
    export function showToast() { return 'toast-marker' }
    export function unusedApi() { return 'unused-api-marker' }
    export function canIUse(scheme) { return scheme === 'showToast' }
    export const options = { value: 0 }
    export const eventCenter = {}
    export default { options, eventCenter }
`

/** Reads static export names for the fixture and the upstream inventory check without executing browser runtime code. */
function exportedNames(code: string): string[] {
    const parsed = parseSync('framework-apis.js', code)
    assert.deepEqual(parsed.errors, [])
    return parsed.program.body
        .flatMap((node) =>
            node.type === 'ExportNamedDeclaration'
                ? node.specifiers.map(({ exported }) =>
                      exported.type === 'Identifier' ? exported.name : exported.value
                  )
                : []
        )
        .toSorted()
}

/** Tests facade exports with mocked implementations; the real framework registration is covered separately below. */
async function bundleApi(source: string, target: VptTarget): Promise<OutputChunk> {
    const sources: ReadonlyMap<string, string> = new Map([
        ['\0entry', source],
        [backendId, backendSource],
        [frameworkId, frameworkSource]
    ])
    const result = await build({
        input: '\0entry',
        plugins: [
            createClientTaroPlugin(target),
            {
                name: 'test:api-backend',
                resolveId: (id) => (sources.has(id) ? id : undefined),
                load: (id) => sources.get(id)
            }
        ],
        output: { format: 'esm' },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk?.type === 'chunk')
    return chunk
}

async function execute(chunk: OutputChunk): Promise<unknown> {
    const module: { probe(): unknown } = await import(
        `data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`
    )
    return module.probe()
}

test('static lifecycle exports match the pinned upstream React API inventory', () => {
    const runtimeRequire = createRequire(packageRequire.resolve(frameworkId))
    const apiLoader: (source: string) => string = runtimeRequire('@tarojs/plugin-framework-react/dist/api-loader.js')
    assert.deepEqual(frameworkNames, exportedNames(apiLoader('')))
})

for (const expression of ['Taro.showToast()', "Taro['showToast']()", 'showToast()']) {
    test(`tree-shakes the H5 namespace for ${expression}`, async () => {
        const chunk = await bundleApi(
            `
            import Taro, { showToast } from 'virtual:taro/api'
            export const probe = () => ${expression}
        `,
            'h5'
        )
        assert.match(chunk.code, /toast-marker/)
        assert.doesNotMatch(chunk.code, /unused-api-marker|useUnload-marker|useLaunch-marker/)
        assert.equal(await execute(chunk), 'toast-marker')
    })
}

test('tree-shakes unused platform exports when accessing a hook through the H5 facade', async () => {
    const chunk = await bundleApi(
        `
        import Taro from 'virtual:taro/api'
        export const probe = () => Taro.useLaunch()
    `,
        'h5'
    )
    assert.match(chunk.code, /useLaunch-marker/)
    assert.doesNotMatch(chunk.code, /toast-marker|unused-api-marker|useUnload-marker/)
    assert.equal(await execute(chunk), 'useLaunch-marker')
})

test('tree-shakes H5 platform exports while preserving upstream hook registration', async () => {
    const result = await build({
        input: '\0entry',
        plugins: [
            createClientTaroPlugin('h5'),
            {
                name: 'test:h5-framework',
                resolveId(id) {
                    if (id === '\0entry' || id === backendId) {
                        return id
                    }
                    if (id === '@tarojs/runtime') {
                        return packageRequire.resolve('vite-plugin-taro-runtime/runtime/h5')
                    }
                },
                load(id) {
                    if (id === '\0entry') {
                        return "import Taro from 'virtual:taro/api'; export const probe = [Taro.showToast, Taro.useLaunch]"
                    }
                    if (id === backendId) {
                        return backendSource
                    }
                }
            }
        ],
        transform: {
            define: {
                'process.env.NODE_ENV': '"production"',
                'process.env.TARO_ENV': '"h5"',
                'process.env.TARO_PLATFORM': '"web"',
                'process.env.FRAMEWORK': '"react"'
            }
        },
        output: { format: 'esm' },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk?.type === 'chunk')
    assert.match(chunk.code, /toast-marker/)
    assert.doesNotMatch(chunk.code, /unused-api-marker/)
    // Upstream's registration retains every hook. H5 platform APIs still prune independently of those shared hooks.
    assert.match(chunk.code, /createTaroHook\(["']onLaunch["']\)/)
    assert.match(chunk.code, /createTaroHook\(["']onUnload["']\)/)
    assert.match(chunk.code, /hooks\.tap\(["']initNativeApi["']/)
})

test('shares H5 default, named, and upstream APIs without augmenting the backend object', async () => {
    const chunk = await bundleApi(
        `
        import Taro, { showToast, useLaunch, options } from 'virtual:taro/api'
        import Upstream from '@tarojs/taro'
        import backend from '${backendId}'
        export function probe() {
            // Only the exported state object is mutable; the namespace does not own a second state store.
            options.value = 42
            return [Taro === Upstream, Taro.showToast === showToast, Taro.useLaunch === useLaunch,
                Taro.options === backend.options, Taro.options.value, Taro.eventCenter === backend.eventCenter,
                'useLaunch' in backend, Reflect.set(Taro, 'showToast', () => 'replacement'), showToast()]
        }
    `,
        'h5'
    )
    assert.deepEqual(await execute(chunk), [true, true, true, true, 42, true, false, false, 'toast-marker'])
})

test('supports destructuring while documenting Rolldown namespace materialization', async () => {
    const chunk = await bundleApi(
        `
        import Taro from 'virtual:taro/api'
        export function probe() {
            const { showToast } = Taro
            return showToast()
        }
    `,
        'h5'
    )
    // Rolldown currently treats destructuring the default namespace as an object use. Prefer a named import to prune it.
    assert.match(chunk.code, /unused-api-marker/)
    assert.equal(await execute(chunk), 'toast-marker')
})

test('retains APIs required by dynamic namespace reads and enumeration', async () => {
    const chunk = await bundleApi(
        `
        import Taro from 'virtual:taro/api'
        const lookup = key => Taro[key]
        export const probe = () => [lookup('showToast')(), lookup('unusedApi')(), Object.keys(Taro).includes('useLaunch')]
    `,
        'h5'
    )
    assert.match(chunk.code, /unused-api-marker/)
    assert.deepEqual(await execute(chunk), ['toast-marker', 'unused-api-marker', true])
})

test('uses runtime canIUse for literal and dynamic schemes without discarding argument side effects', async () => {
    const chunk = await bundleApi(
        `
        import Taro, { canIUse } from 'virtual:taro/api'
        export function probe() {
            // This local counter detects argument evaluation that a compile-time replacement could otherwise discard.
            let calls = 0
            const scheme = 'showToast'
            return [Taro.canIUse('showToast', calls++), canIUse(scheme), Taro.canIUse('missing'), calls]
        }
    `,
        'h5'
    )
    assert.deepEqual(await execute(chunk), [true, true, false, 1])
})

test('executes the physical H5 ESM facades with shared platform and framework exports', async () => {
    const sources: ReadonlyMap<string, string> = new Map([
        [backendId, backendSource],
        [frameworkId, frameworkSource]
    ])
    // Mock only browser-owned dependencies in this test process. Real facade modules execute natively, without bundling
    // away their re-exports or losing source coverage; the temporary resolver is removed after all imports and assertions.
    const registration = registerHooks({
        resolve(specifier, context, nextResolve) {
            const source = sources.get(specifier)
            return source === undefined
                ? nextResolve(specifier, context)
                : { url: `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`, shortCircuit: true }
        }
    })
    try {
        const facade: Readonly<Record<string, unknown>> = await import(
            pathToFileURL(resolveRuntimeFile('h5/taro-api')).href
        )
        const namespace: Readonly<Record<string, unknown>> = await import(
            pathToFileURL(resolveRuntimeFile('h5/taro-api-exports')).href
        )
        const backend: Readonly<Record<string, unknown>> = await import(backendId)
        const framework: Readonly<Record<string, unknown>> = await import(frameworkId)
        const platformNames = Object.keys(backend).filter((name) => name !== 'default')

        assert.equal(facade.default, namespace)
        assert.deepEqual(Object.keys(namespace), [...platformNames, ...frameworkNames].toSorted())
        for (const name of platformNames) {
            assert.equal(namespace[name], backend[name])
            assert.equal(facade[name], backend[name])
        }
        for (const name of frameworkNames) {
            const hook = namespace[name]
            assert.equal(hook, framework[name])
            assert.equal(facade[name], hook)
            assert.equal(name in backend, false)
            assert.ok(typeof hook === 'function')
            assert.equal(hook(), `${name}-marker`)
        }
        assert.equal(
            Reflect.set(namespace, 'showToast', () => 'replacement'),
            false
        )
        assert.equal(
            Reflect.set(namespace, 'extraApi', () => undefined),
            false
        )
        assert.equal(Object.isExtensible(namespace), false)
    } finally {
        registration.deregister()
    }
})
