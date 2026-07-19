import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { OutputOptions, Plugin as RolldownPlugin } from 'rolldown'
import type { ViteDevServer } from 'vite'
import { createBundledDevSession } from './legacy-bundled-dev.ts'

test('replaces Vite bundled development with a physical wx DevEngine session', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vite-plugin-taro-wx-bundled-dev-'))
    const outDir = path.join(root, 'dist/wx')
    const sourcePath = path.join(root, 'src/app.js')
    await mkdir(path.dirname(sourcePath), { recursive: true })
    await writeFile(sourcePath, `export const message = 'initial'\n`)

    const errors: unknown[] = []
    const viteTransformPlugin = {
        name: 'builtin:vite-transform',
        _options: {
            transformOptions: {
                sourcemap: true
            }
        }
    }
    const fixtureOutputPlugin: RolldownPlugin = {
        name: 'fixture-output',
        generateBundle() {
            this.emitFile({ type: 'asset', fileName: 'app.json', source: '{}\n' })
        }
    }
    const bundledDev = {
        _devEngine: undefined as
            | {
                  close(): Promise<void>
                  getBundleState(): Promise<{ hasStaleOutput: boolean }>
              }
            | undefined,
        async getRolldownOptions() {
            return {
                input: { 'app.js': sourcePath },
                output: {
                    dir: outDir,
                    entryFileNames: 'assets/[name].js'
                } satisfies OutputOptions,
                plugins: [viteTransformPlugin as RolldownPlugin, fixtureOutputPlugin],
                experimental: {
                    devMode: {
                        lazy: true,
                        implement: 'browser runtime'
                    }
                }
            }
        },
        async listen() {
            throw new Error('Vite listen must be replaced by the wx bundled-development adapter.')
        },
        async triggerBundleRegenerationIfStale() {
            return true
        }
    }
    const server = {
        config: {
            root,
            build: {
                outDir,
                assetsDir: 'assets',
                chunkSizeWarningLimit: 500,
                lib: false,
                minify: false,
                reportCompressedSize: true,
                rolldownOptions: {
                    output: {
                        entryFileNames: '[name]',
                        chunkFileNames: () => 'sub/p_test/assets/[hash].js',
                        assetFileNames: 'assets/[name]-[hash][extname]'
                    }
                }
            },
            logger: {
                info() {},
                error(message: unknown) {
                    errors.push(message)
                }
            }
        },
        environments: {
            client: { bundledDev }
        }
    } as unknown as ViteDevServer

    try {
        const session = createBundledDevSession({
            server,
            pageFiles: new Set(['pages/home/index.js']),
            reportError(operation, error) {
                errors.push({ operation, error })
            }
        })
        assert.equal(await session.registerModules('runtime-1', [sourcePath]), false)

        const options = await bundledDev.getRolldownOptions()
        const output = options.output as OutputOptions
        const devMode = options.experimental.devMode as Record<string, unknown>
        assert.equal(devMode.lazy, false)
        assert.match(String(devMode.implement), /global\.__rolldown_runtime__/)
        assert.equal(output.entryFileNames, '[name]')
        assert.equal(output.format, 'es')
        assert.equal(output.minify, true)
        assert.equal(output.sourcemap, false)
        assert.equal(viteTransformPlugin._options.transformOptions.sourcemap, false)

        const banner = output.banner
        if (typeof banner !== 'function') {
            throw new Error('Expected development banner function.')
        }
        assert.equal(
            await banner({ fileName: 'app.js' } as never),
            'const __rolldown_runtime__ = global.__rolldown_runtime__;\n__rolldown_runtime__.setHmrInfo(require("./hmr/info.js"));'
        )
        assert.equal(
            await banner({ fileName: 'pages/home/index.js' } as never),
            'const __rolldown_runtime__ = global.__rolldown_runtime__;\nrequire("../../hmr/update.js");'
        )

        await bundledDev.listen()
        assert.match(await readFile(path.join(outDir, 'app.js'), 'utf8'), /initial/)
        assert.equal(await readFile(path.join(outDir, 'app.json'), 'utf8'), '{}\n')
        assert.equal(await bundledDev.triggerBundleRegenerationIfStale(), false)
        assert.equal(await session.registerModules('runtime-1', [sourcePath]), true)

        await writeFile(sourcePath, `export const message = 'updated'\n`)
        await waitFor(async () => Boolean((await bundledDev._devEngine?.getBundleState())?.hasStaleOutput))
        assert.match(await readFile(path.join(outDir, 'app.js'), 'utf8'), /initial/)
        assert.deepEqual(errors, [])
    } finally {
        await bundledDev._devEngine?.close()
        await rm(root, { recursive: true, force: true })
    }
})

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await predicate()) {
            return
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Timed out waiting for wx bundled-development output.')
}
