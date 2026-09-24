import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { build, type RolldownPluginOption } from 'rolldown'
import { defineParallelPlugin, viteTransformPlugin } from 'rolldown/experimental'
import { replaceViteTransformPlugin } from './replace-vite-transform-plugin.ts'

type TransformConfig = Parameters<typeof replaceViteTransformPlugin>[1]

const config: TransformConfig = { root: process.cwd(), consumer: 'client', tsconfig: undefined, oxc: {} }

// Reading the old builtin's private options would fail, even if no mutation followed.
const original = {
    name: 'builtin:vite-transform',
    get _options(): never {
        return assert.fail('The replacement must use resolved environment configuration, not private builtin options')
    }
}

test('replaces only the native transform across nested and promised plugin options', async () => {
    const other = { name: 'fixture:other' }
    const parallel = defineParallelPlugin(import.meta.filename)(undefined)
    const nested = [original]
    const plugins: RolldownPluginOption[] = [undefined, null, false, other, parallel, Promise.resolve(nested)]
    const result = await replaceViteTransformPlugin(plugins, config)
    assert.ok(Array.isArray(result))
    assert.deepEqual(result.slice(0, 5), [undefined, null, false, other, parallel])
    assert.strictEqual(result[3], other)
    assert.strictEqual(result[4], parallel)
    const replaced = await result[5]
    assert.ok(Array.isArray(replaced))
    assert.notStrictEqual(replaced, nested)
    assert.notStrictEqual(replaced[0], original)
    const plugin = await replaced[0]
    assert.ok(plugin && 'name' in plugin)
    assert.equal(plugin.name, 'builtin:vite-transform')
    assert.strictEqual(nested[0], original)
})

test('leaves a disabled Oxc pipeline unchanged', async () => {
    const plugins = [original]
    assert.strictEqual(await replaceViteTransformPlugin(plugins, { ...config, oxc: false }), plugins)
})

/** Owns only temporary physical transform inputs; Rolldown writes no output and starts no watcher. */
async function createFixture(context: TestContext): Promise<string> {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vpt-oxc-options-')))
    context.after(() => rm(root, { recursive: true, force: true }))
    return root
}

test('keeps Vite default filters while disabling intermediate source maps', async (context) => {
    const root = await createFixture(context)
    const entry = path.join(root, 'entry.ts')
    const ignored = path.join(root, 'ignored.js')
    await Promise.all([
        writeFile(entry, 'export const answer: number = 42'),
        writeFile(ignored, 'export const value = source?.value')
    ])
    const replacement = await replaceViteTransformPlugin(
        viteTransformPlugin({ root, transformOptions: { sourcemap: true } }),
        { ...config, root }
    )
    // These build-local journals capture actual native transform output and sourcemap diagnostics.
    const transformed = new Map<string, string>()
    const warnings: Array<string | undefined> = []
    await build({
        input: [entry, ignored],
        plugins: [
            replacement,
            {
                name: 'fixture:observe-transform',
                transform: {
                    order: 'post',
                    handler(code, id) {
                        transformed.set(path.basename(id), code)
                    }
                }
            }
        ],
        onLog(_level, log) {
            warnings.push(log.code)
        },
        // Request final maps deliberately: a transformed module without an intermediate map must report SOURCEMAP_BROKEN.
        output: { sourcemap: true },
        write: false
    })
    assert.doesNotMatch(transformed.get('entry.ts')!, /: number/)
    assert.equal(transformed.get('ignored.js'), 'export const value = source?.value')
    assert.ok(warnings.includes('SOURCEMAP_BROKEN'))
})

for (const consumer of ['client', 'server'] as const) {
    test(`preserves configured filters, tsconfig, JSX injection and ${consumer} refresh semantics`, async (context) => {
        const root = await createFixture(context)
        const entry = path.join(root, 'entry.tsx')
        const skipped = path.join(root, 'skipped.tsx')
        const noRefresh = path.join(root, 'no-refresh.tsx')
        const tsconfig = path.join(root, 'custom-tsconfig.json')
        const source = 'export function App() { const value: number = injected; return <view>{value}</view> }'
        await Promise.all([
            writeFile(entry, source),
            writeFile(skipped, source),
            writeFile(noRefresh, source),
            writeFile(tsconfig, JSON.stringify({ compilerOptions: { jsx: 'react', jsxFactory: 'renderElement' } }))
        ])
        const configured = {
            root,
            consumer,
            tsconfig,
            oxc: {
                include: /\.tsx$/,
                exclude: /skipped\.tsx$/,
                jsxInject: 'const injected = 42',
                jsxRefreshInclude: /\.tsx$/,
                jsxRefreshExclude: /(?:skipped|no-refresh)\.tsx$/,
                jsx: { runtime: 'classic', refresh: true },
                target: 'es2018'
            }
        } satisfies TransformConfig
        const replacement = await replaceViteTransformPlugin(original, configured)
        // This build-local snapshot observes native output before Rolldown's own final lowering and minification.
        const transformed = new Map<string, string>()
        await build({
            input: [entry, skipped, noRefresh],
            external: ['react/jsx-runtime'],
            plugins: [
                replacement,
                {
                    name: 'fixture:observe-jsx',
                    transform: {
                        order: 'post',
                        handler(code, id) {
                            transformed.set(path.basename(id), code)
                        }
                    }
                }
            ],
            write: false
        })
        assert.strictEqual(configured.oxc.jsxInject, 'const injected = 42')
        const transformedEntry = transformed.get('entry.tsx')!
        assert.match(transformedEntry, /const injected = 42/)
        assert.match(transformedEntry, /renderElement\("view"/)
        assert.doesNotMatch(transformedEntry, /: number/)
        assert.equal(transformedEntry.includes('$RefreshReg$'), consumer === 'client')
        assert.equal(transformed.get('skipped.tsx'), source)
        assert.doesNotMatch(transformed.get('no-refresh.tsx')!, /\$RefreshReg\$/)
    })
}
