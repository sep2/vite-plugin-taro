import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { collectNativeComponentAssets } from './native-component-assets.ts'
import type { NativeComponentDefinition } from './native-component-interface.ts'

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
                        fields: []
                    },
                    path.join(sourceDirectory, 'interface.tsx')
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
                        fields: []
                    },
                    path.join(sourceDirectory, 'interface.tsx')
                ),
            new Error(`Native component entry file does not exist: ${missingEntry}`)
        )
    } finally {
        await rm(sourceDirectory, { force: true, recursive: true })
    }
})

test('rejects a file as the component source and a directory as its JavaScript entry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vpt-invalid-native-assets-'))
    try {
        const sourceFile = path.join(root, 'source-file')
        await writeFile(sourceFile, 'not a directory')
        await assert.rejects(
            () =>
                collectNativeComponentAssets(
                    {
                        folder: sourceFile,
                        entry: 'index',
                        fields: []
                    },
                    path.join(root, 'interface.tsx')
                ),
            new Error(`Native component source is not a directory: ${sourceFile}`)
        )

        const sourceDirectory = path.join(root, 'component')
        const entryDirectory = path.join(sourceDirectory, 'counter.js')
        await mkdir(entryDirectory, { recursive: true })
        await assert.rejects(
            () =>
                collectNativeComponentAssets(
                    {
                        folder: sourceDirectory,
                        entry: 'counter',
                        fields: []
                    },
                    path.join(root, 'interface.tsx')
                ),
            new Error(`Native component entry is not a file: ${entryDirectory}`)
        )
    } finally {
        await rm(root, { force: true, recursive: true })
    }
})

test('collects an opaque native folder recursively while excluding its co-located interface', async () => {
    const sourceDirectory = await mkdtemp(path.join(tmpdir(), 'vpt-native-assets-'))
    try {
        await mkdir(path.join(sourceDirectory, 'nested'))
        await writeFile(path.join(sourceDirectory, 'z.invalid-json'), '{')
        await writeFile(path.join(sourceDirectory, 'a.custom'), 'native source')
        await writeFile(path.join(sourceDirectory, 'renderer.js'), '')
        const interfacePath = path.join(sourceDirectory, 'renderer.tsx')
        await writeFile(interfacePath, 'interface source')
        await writeFile(path.join(sourceDirectory, 'nested', 'data.bin'), Uint8Array.from([0, 1, 2]))
        const definition: NativeComponentDefinition = {
            folder: sourceDirectory,
            entry: 'renderer',
            fields: ['count', 'onIncrement']
        }

        const source = await collectNativeComponentAssets(definition, interfacePath)

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
