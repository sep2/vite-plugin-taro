import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { collectNativeComponentAssets } from './native-component-assets.ts'
import type { NativeComponentSchemaDefinition } from './native-component-schema.ts'

test('collects an opaque native folder recursively without validating its files', async () => {
    const sourceDirectory = await mkdtemp(path.join(tmpdir(), 'vpt-native-assets-'))
    try {
        await mkdir(path.join(sourceDirectory, 'nested'))
        await writeFile(path.join(sourceDirectory, 'z.invalid-json'), '{')
        await writeFile(path.join(sourceDirectory, 'a.custom'), 'native source')
        await writeFile(path.join(sourceDirectory, 'nested', 'data.bin'), Uint8Array.from([0, 1, 2]))
        const definition: NativeComponentSchemaDefinition = {
            folder: sourceDirectory,
            properties: ['count'],
            events: ['increment']
        }

        const source = await collectNativeComponentAssets(definition)

        assert.deepEqual(
            source.assets.map(({ relativePath }) => relativePath),
            ['a.custom', 'nested/data.bin', 'z.invalid-json']
        )
        assert.deepEqual(
            source.assets.map(({ byteLength }) => byteLength),
            [13, 3, 1]
        )
        const { assets: _assets, ...actualDefinition } = source
        assert.deepEqual(actualDefinition, definition)
    } finally {
        await rm(sourceDirectory, { force: true, recursive: true })
    }
})
