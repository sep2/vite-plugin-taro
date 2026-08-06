import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { compileNativeComponentFacade } from './compile-native-component-facade.ts'
import { nativeComponentMetaKey } from './native-component-assets.ts'

test('compiles a facade and returns watched native sources as module metadata', async () => {
    const projectDirectory = await mkdtemp(path.join(tmpdir(), 'vpt-native-facade-'))
    try {
        const sourceDirectory = path.join(projectDirectory, 'native-counter')
        const sourcePath = path.join(sourceDirectory, 'component.data')
        const moduleId = path.join(projectDirectory, 'native-counter.ts')
        await mkdir(sourceDirectory)
        await writeFile(sourcePath, 'native source')
        const watchedFiles = new Set<string>()

        const compiled = await compileNativeComponentFacade({
            code: `
                import { defineNativeComponent } from 'virtual:taro/native'
                export const NativeCounter = defineNativeComponent(import('./native-counter'), {
                    properties: { count: Number },
                    events: { increment: { value: Number } }
                })
            `,
            id: moduleId,
            sourcemap: false,
            addWatchFile: (file) => {
                watchedFiles.add(file)
            }
        })

        assert.match(compiled.code, /NativeCounter\s*=\s*['"]native-counter['"]/)
        assert.deepEqual(watchedFiles, new Set([sourceDirectory, sourcePath]))
        assert.equal(compiled.meta[nativeComponentMetaKey].sources[0]?.assets[0]?.relativePath, 'component.data')
        assert.equal(compiled.meta[nativeComponentMetaKey].assetBytes, 13)
    } finally {
        await rm(projectDirectory, { force: true, recursive: true })
    }
})
