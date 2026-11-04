import assert from 'node:assert/strict'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createMemoryTestProject } from '../../../tests/create-memory-test-project.ts'
import {
    collectNativeComponentAssets,
    getNativeComponentAssetBytes,
    getNativeComponentSources,
    nativeComponentMetaKey
} from './native-component-assets.ts'
import type { NativeComponentDefinition } from './native-component-interface.ts'

test('reads empty and populated native component metadata', () => {
    const source = {
        folder: '/native/counter',
        entry: 'index',
        fields: ['count'],
        assets: [{ relativePath: 'index.js', byteLength: 12 }]
    }
    const meta = {
        [nativeComponentMetaKey]: {
            sources: [source],
            assetBytes: 12
        }
    }

    assert.equal(getNativeComponentAssetBytes(undefined), 0)
    assert.deepEqual(getNativeComponentSources(undefined), [])
    assert.equal(getNativeComponentAssetBytes(meta), 12)
    assert.deepEqual(getNativeComponentSources(meta), [source])
})

test('rejects a missing native component folder with its resolved path', async (context) => {
    const sourceDirectory = createMemoryTestProject(context)
    const missingDirectory = path.join(sourceDirectory, 'missing')
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
})

test('rejects a missing native component entry with its resolved path', async (context) => {
    const sourceDirectory = createMemoryTestProject(context)
    const missingEntry = path.join(sourceDirectory, 'counter.js')
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
})

test('propagates filesystem errors other than missing paths', async (context) => {
    const root = createMemoryTestProject(context)
    await symlink('loop', path.join(root, 'loop'))
    await symlink('loop.js', path.join(root, 'loop.js'))
    await assert.rejects(
        () =>
            collectNativeComponentAssets(
                {
                    folder: path.join(root, 'loop'),
                    entry: 'index',
                    fields: []
                },
                path.join(root, 'interface.tsx')
            ),
        { code: 'ELOOP' }
    )

    await assert.rejects(
        () =>
            collectNativeComponentAssets(
                {
                    folder: root,
                    entry: 'loop',
                    fields: []
                },
                path.join(root, 'interface.tsx')
            ),
        { code: 'ELOOP' }
    )
})

test('rejects a file as the component source and a directory as its JavaScript entry', async (context) => {
    const root = createMemoryTestProject(context)
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
})

test('collects an opaque native folder recursively while excluding its co-located interface', async (context) => {
    const sourceDirectory = createMemoryTestProject(context)
    await mkdir(path.join(sourceDirectory, 'nested'))
    await writeFile(path.join(sourceDirectory, 'z.invalid-json'), '{')
    await writeFile(path.join(sourceDirectory, 'a.custom'), 'native source')
    await writeFile(path.join(sourceDirectory, 'renderer.js'), '')
    const interfacePath = path.join(sourceDirectory, 'renderer.tsx')
    await writeFile(interfacePath, 'interface source')
    await writeFile(path.join(sourceDirectory, 'nested', 'data.bin'), Buffer.from([0, 1, 2]))
    await symlink('nested', path.join(sourceDirectory, 'linked'), 'junction')
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
})
