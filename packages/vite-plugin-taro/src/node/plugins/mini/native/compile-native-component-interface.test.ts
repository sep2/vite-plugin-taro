import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import { createMemoryTestProject } from '../../../tests/create-memory-test-project.ts'
import { compileNativeComponentInterface } from './compile-native-component-interface.ts'
import { nativeComponentMetaKey } from './native-component-assets.ts'

test('compiles a co-located interface without treating it as an opaque native asset', async (context) => {
    const projectDirectory = createMemoryTestProject(context)
    const sourceDirectory = path.join(projectDirectory, 'native-counter')
    const sourcePath = path.join(sourceDirectory, 'component.data')
    const entryPath = path.join(sourceDirectory, 'counter.js')
    const moduleId = path.join(sourceDirectory, 'native-counter.ts')
    await mkdir(sourceDirectory)
    await writeFile(sourcePath, 'native source')
    await writeFile(entryPath, '')
    await writeFile(moduleId, 'interface source')
    const watchedFiles = new Set<string>()

    const compiled = await compileNativeComponentInterface({
        code: `
            import { defineNativeComponent } from 'virtual:taro/native'
            export const NativeCounter = defineNativeComponent<{
                count: number
                onIncrement?: (event: { detail: { value: number } }) => void
            }>(() => import('./counter.js'))
        `,
        id: moduleId,
        sourcemap: false,
        addWatchFile: (file) => {
            watchedFiles.add(file)
        }
    })

    assert.match(compiled.code, /NativeCounter\s*=\s*['"]native-counter['"]/)
    assert.deepEqual(watchedFiles, new Set([sourceDirectory, sourcePath, entryPath].map(normalizePath)))
    assert.equal(compiled.meta[nativeComponentMetaKey].sources[0]?.assets[0]?.relativePath, 'component.data')
    assert.equal(compiled.meta[nativeComponentMetaKey].assetBytes, 13)
})
