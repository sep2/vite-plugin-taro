import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { dev } from 'rolldown/experimental'
import { build, createServer, normalizePath, type Plugin } from 'vite'
import type { BundledDev } from '../dev/wx-dev-options.ts'
import { createWxStylePlugins } from './plugins.ts'

test('finalizes the compiler stylesheet after upstream generation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vpt-wxss-'))

    try {
        const sourceRoot = path.join(root, 'src')
        const pageRoot = path.join(sourceRoot, 'pages/example')
        await mkdir(pageRoot, { recursive: true })
        // The dynamic module is deliberate: its marker disappears when VPT finalizes before upstream's post output hook.
        await writeFile(
            path.join(sourceRoot, 'app.ts'),
            "import './app.css';\nvoid import('./pages/example/index.ts')\n"
        )
        await writeFile(
            path.join(sourceRoot, 'app.css'),
            [
                '@import "tailwindcss/theme.css";',
                '@import "tailwindcss/preflight.css";',
                '@import "tailwindcss/utilities.css";',
                '@source inline("mt-2.5");',
                '*, ::before, ::after { box-sizing: border-box; }'
            ].join('\n')
        )
        await writeFile(path.join(pageRoot, 'index.ts'), "import './index.css'\n")
        await writeFile(path.join(pageRoot, 'index.css'), '.page-marker { color: red; }\n')

        const verifyAssetOwnership: Plugin = {
            name: 'test:verify-wx-style-ownership',
            generateBundle: {
                order: 'post',
                handler(_, bundle) {
                    const globalStyle = bundle['assets/global.wxss']
                    assert.equal(globalStyle?.type, 'asset')
                    assert.ok(globalStyle.names.length > 0)
                }
            }
        }

        await build({
            root,
            logLevel: 'silent',
            plugins: [...createWxStylePlugins(), verifyAssetOwnership],
            build: {
                cssCodeSplit: false,
                cssMinify: false,
                outDir: 'dist',
                rolldownOptions: {
                    input: path.join(sourceRoot, 'app.ts')
                }
            }
        })

        const outputRoot = path.join(root, 'dist')
        const styleFileNames = (await readdir(outputRoot, { recursive: true }))
            .filter((fileName) => fileName.endsWith('.wxss'))
            .map(normalizePath)
            .sort()
        assert.deepEqual(styleFileNames, ['assets/global.wxss'])

        const globalStyle = await readFile(path.join(outputRoot, 'assets/global.wxss'), 'utf8')
        assert.match(globalStyle, /\.mt-2_d5\s*\{/)
        // Proves upstream generation ran before VPT's finalizer rather than appending dynamic CSS afterward.
        assert.match(globalStyle, /\.page-marker\s*\{/)
        assert.doesNotMatch(globalStyle, /\drem\b/)
        assert.doesNotMatch(globalStyle, /@property|:where|::file-selector-button|\\\.|\*,/)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('preserves unchanged WXSS when a later DevEngine output omits its CSS asset', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vpt-rebuilt-wxss-'))
    const appPath = path.join(root, 'app.ts')
    const stylePath = path.join(root, 'app.css')
    await Promise.all([
        writeFile(appPath, "import './app.css'\nexport {}\n"),
        writeFile(stylePath, '.persistent-style { color: red; }\n')
    ])

    // These journals synchronize output completion and record whether the finalizer emitted a physical style in each bundle.
    const outputResults: unknown[] = []
    const emittedGlobalStyles: boolean[] = []
    const observeStyleEmission: Plugin = {
        name: 'test:observe-rebuilt-wxss',
        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                emittedGlobalStyles.push('assets/global.wxss' in bundle)
            }
        }
    }
    const server = await createServer({
        root: root,
        configFile: false,
        logLevel: 'silent',
        appType: 'custom',
        plugins: [...createWxStylePlugins(), observeStyleEmission],
        experimental: { bundledDev: true },
        build: {
            cssCodeSplit: false,
            cssMinify: false,
            outDir: 'dist',
            rolldownOptions: { input: appPath }
        }
    })
    const bundledDev = requireBundledDev(server.environments.client.bundledDev)
    const rolldownOptions = await bundledDev.getRolldownOptions()
    const output = rolldownOptions.output
    if (!output || Array.isArray(output)) {
        throw new Error('Expected one bundled development output')
    }
    const engine = await dev(rolldownOptions, output, {
        rebuildStrategy: 'never',
        watch: { skipWrite: false, useDebounce: false },
        onOutput(result) {
            outputResults.push(result)
        }
    })

    try {
        await engine.run()
        await engine.ensureCurrentBuildFinish()
        await waitForOutputCount(outputResults, 1)
        const globalWxssPath = path.join(root, 'dist/assets/global.wxss')
        const initialWxss = await readFile(globalWxssPath, 'utf8')
        assert.notEqual(initialWxss, '')

        engine.triggerFullBuild()
        await waitForOutputCount(outputResults, 2)

        assert.deepEqual(emittedGlobalStyles, [true, false])
        assert.equal(await readFile(globalWxssPath, 'utf8'), initialWxss)
    } finally {
        await engine.close()
        await server.close()
        await rm(root, { recursive: true, force: true })
    }
})

test('emits an empty global stylesheet when the application has no styles', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vpt-empty-wxss-'))

    try {
        const appPath = path.join(root, 'app.ts')
        await writeFile(appPath, 'export {}\n')

        await build({
            root,
            logLevel: 'silent',
            plugins: createWxStylePlugins(),
            build: {
                outDir: 'dist',
                rolldownOptions: {
                    input: appPath
                }
            }
        })

        assert.equal(await readFile(path.join(root, 'dist/assets/global.wxss'), 'utf8'), '')
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

function requireBundledDev(value: unknown): BundledDev {
    if (!isBundledDev(value)) {
        throw new Error('Expected Vite bundled development')
    }
    return value
}

function isBundledDev(value: unknown): value is BundledDev {
    return (
        typeof value === 'object' &&
        value !== null &&
        'getRolldownOptions' in value &&
        typeof value.getRolldownOptions === 'function' &&
        'listen' in value &&
        typeof value.listen === 'function' &&
        'triggerBundleRegenerationIfStale' in value &&
        typeof value.triggerBundleRegenerationIfStale === 'function'
    )
}

async function waitForOutputCount(outputResults: readonly unknown[], expectedCount: number): Promise<void> {
    const startedAt = Date.now()
    while (outputResults.length < expectedCount) {
        if (Date.now() - startedAt > 10_000) {
            throw new Error(`Timed out waiting for DevEngine output ${expectedCount}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}
