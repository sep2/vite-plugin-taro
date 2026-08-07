import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { collectNativeComponentAssets } from './native-component-assets.ts'
import type { NativeComponentSchemaDefinition } from './native-component-schema.ts'

test('rejects a missing native component folder with its resolved path', async () => {
    const sourceDirectory = await mkdtemp(path.join(tmpdir(), 'vpt-missing-native-assets-'))
    const missingDirectory = path.join(sourceDirectory, 'missing')
    try {
        await assert.rejects(
            () =>
                collectNativeComponentAssets(
                    {
                        folder: missingDirectory,
                        entry: 'index',
                        properties: [],
                        events: []
                    },
                    path.join(sourceDirectory, 'facade.tsx')
                ),
            new Error(`Native component folder does not exist: ${missingDirectory}`)
        )
    } finally {
        await rm(sourceDirectory, { force: true, recursive: true })
    }
})

test('rejects a missing native component entry with its resolved path', async () => {
    const sourceDirectory = await mkdtemp(path.join(tmpdir(), 'vpt-missing-native-entry-'))
    const missingEntry = path.join(sourceDirectory, 'counter.js')
    try {
        await assert.rejects(
            () =>
                collectNativeComponentAssets(
                    {
                        folder: sourceDirectory,
                        entry: 'counter',
                        properties: [],
                        events: []
                    },
                    path.join(sourceDirectory, 'facade.tsx')
                ),
            new Error(`Native component entry file does not exist: ${missingEntry}`)
        )
    } finally {
        await rm(sourceDirectory, { force: true, recursive: true })
    }
})

test('collects an opaque native folder recursively while excluding its co-located facade', async () => {
    const sourceDirectory = await mkdtemp(path.join(tmpdir(), 'vpt-native-assets-'))
    try {
        await mkdir(path.join(sourceDirectory, 'nested'))
        await writeFile(path.join(sourceDirectory, 'z.invalid-json'), '{')
        await writeFile(path.join(sourceDirectory, 'a.custom'), 'native source')
        await writeFile(path.join(sourceDirectory, 'renderer.js'), '')
        const facadePath = path.join(sourceDirectory, 'renderer.tsx')
        await writeFile(facadePath, 'facade source')
        await writeFile(path.join(sourceDirectory, 'nested', 'data.bin'), Uint8Array.from([0, 1, 2]))
        const definition: NativeComponentSchemaDefinition = {
            folder: sourceDirectory,
            entry: 'renderer',
            properties: ['count'],
            events: ['increment']
        }

        const source = await collectNativeComponentAssets(definition, facadePath)

        assert.deepEqual(
            source.assets.map(({ relativePath }) => relativePath),
            ['a.custom', 'nested/data.bin', 'renderer.js', 'z.invalid-json']
        )
        assert.deepEqual(
            source.assets.map(({ byteLength }) => byteLength),
            [13, 3, 0, 1]
        )
        const { assets: _assets, ...actualDefinition } = source
        assert.deepEqual(actualDefinition, definition)
    } finally {
        await rm(sourceDirectory, { force: true, recursive: true })
    }
})
