import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { dev } from 'rolldown/experimental'
import { createInitialOutputDirectoryCleaner, emptyOutputDirectory } from './empty-output-directory.ts'

test('empties an existing output directory without replacing it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-empty-output-'))
    const outputDirectory = path.join(root, 'dist')

    try {
        await fs.mkdir(path.join(outputDirectory, 'assets'), { recursive: true })
        await fs.mkdir(path.join(outputDirectory, '.git'), { recursive: true })
        await fs.writeFile(path.join(outputDirectory, 'app.js'), 'stale')
        await fs.writeFile(path.join(outputDirectory, 'assets', 'stale.js'), 'stale')
        await fs.writeFile(path.join(outputDirectory, '.git', 'HEAD'), 'ref: refs/heads/main')

        const originalStats = await fs.stat(outputDirectory)
        await emptyOutputDirectory(outputDirectory)

        assert.deepEqual(await fs.readdir(outputDirectory), ['.git'])
        assert.equal(await fs.readFile(path.join(outputDirectory, '.git', 'HEAD'), 'utf8'), 'ref: refs/heads/main')
        assert.equal((await fs.stat(outputDirectory)).ino, originalStats.ino)
    } finally {
        await fs.rm(root, { force: true, recursive: true })
    }
})

test('creates a missing output directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-empty-output-'))
    const outputDirectory = path.join(root, 'dist')

    try {
        await emptyOutputDirectory(outputDirectory)
        assert.deepEqual(await fs.readdir(outputDirectory), [])
    } finally {
        await fs.rm(root, { force: true, recursive: true })
    }
})

test('preserves unchanged emitted assets across incremental full builds', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vpt-incremental-output-'))
    const outputDirectory = path.join(root, 'dist')
    await fs.writeFile(path.join(root, 'main.js'), "console.log('stable')\n")

    try {
        const initializeOutputDirectory = createInitialOutputDirectoryCleaner(outputDirectory)
        const engine = await dev(
            {
                cwd: root,
                input: 'main.js',
                experimental: { devMode: true },
                plugins: [
                    {
                        name: 'test:stable-emitted-asset',
                        renderStart: initializeOutputDirectory,
                        generateBundle() {
                            this.emitFile({ type: 'asset', fileName: 'stable.json', source: '{}' })
                        }
                    }
                ]
            },
            { dir: outputDirectory, entryFileNames: 'main.js' },
            {
                rebuildStrategy: 'never',
                watch: { enabled: false, skipWrite: false }
            }
        )

        try {
            await engine.run()
            assert.equal(await fs.readFile(path.join(outputDirectory, 'stable.json'), 'utf8'), '{}')

            engine.triggerFullBuild()
            await engine.ensureLatestBuildOutput()

            // Rolldown invokes generateBundle again but suppresses the byte-identical asset write from its incremental output.
            assert.equal(await fs.readFile(path.join(outputDirectory, 'stable.json'), 'utf8'), '{}')
        } finally {
            await engine.close()
        }
    } finally {
        await fs.rm(root, { force: true, recursive: true })
    }
})
