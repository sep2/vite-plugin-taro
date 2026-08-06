import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { compileNativeComponentFacade } from './compile-native-component-facade.ts'
import { createNativeComponentOutputFiles } from './create-native-component-output-files.ts'

test('emits surviving native folders into their planned packages', async () => {
    const projectFolder = await mkdtemp(path.join(tmpdir(), 'vpt-native-output-'))
    try {
        const main = await createFacade(projectFolder, 'native-counter', 'counter')
        const subpackage = await createFacade(projectFolder, 'native-card', 'card')
        const metadata = new Map([
            [main.moduleId, main.meta],
            [subpackage.moduleId, subpackage.meta]
        ])

        const files = await createNativeComponentOutputFiles({
            bundle: {
                main: { type: 'chunk', fileName: 'assets/main.js', moduleIds: [main.moduleId] },
                subpackage: {
                    type: 'chunk',
                    fileName: 'sub/p_test/assets/subpackage.js',
                    moduleIds: [subpackage.moduleId]
                }
            },
            getModuleInfo: (moduleId) => {
                const meta = metadata.get(moduleId)
                return meta ? { meta } : null
            }
        })

        assert.deepEqual(
            files.map(({ fileName }) => fileName),
            ['components/native-counter/index.wxml', 'sub/p_test/components/native-card/index.wxml']
        )
        assert.deepEqual(
            files.map((file) => String(file.source)),
            ['counter', 'card']
        )
    } finally {
        await rm(projectFolder, { force: true, recursive: true })
    }
})

async function createFacade(projectFolder: string, name: string, content: string) {
    const folder = path.join(projectFolder, name)
    const moduleId = path.join(projectFolder, `${name}.ts`)
    await mkdir(folder)
    await writeFile(path.join(folder, 'index.wxml'), content)
    const compiled = await compileNativeComponentFacade({
        code: `
            import { defineNativeComponent } from 'virtual:taro/native'
            export const Component = defineNativeComponent('./${name}', {
                properties: {},
                events: {}
            })
        `,
        id: moduleId,
        sourcemap: false,
        addWatchFile() {}
    })
    return { moduleId, meta: compiled.meta }
}
