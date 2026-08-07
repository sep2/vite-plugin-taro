import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { compileNativeComponentInterface } from './compile-native-component-interface.ts'
import { nativeComponentMetaKey } from './native-component-assets.ts'

test('compiles a co-located interface without treating it as an opaque native asset', async () => {
    const projectDirectory = await mkdtemp(path.join(tmpdir(), 'vpt-native-interface-'))
    try {
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
        assert.deepEqual(watchedFiles, new Set([sourceDirectory, sourcePath, entryPath]))
        assert.equal(compiled.meta[nativeComponentMetaKey].sources[0]?.assets[0]?.relativePath, 'component.data')
        assert.equal(compiled.meta[nativeComponentMetaKey].assetBytes, 13)
    } finally {
        await rm(projectDirectory, { force: true, recursive: true })
    }
})
