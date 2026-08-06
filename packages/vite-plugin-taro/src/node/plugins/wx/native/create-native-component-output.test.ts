import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { compileNativeComponentFacade } from './compile-native-component-facade.ts'
import { createNativeComponentOutput } from './create-native-component-output.ts'

test('emits surviving native folders into their planned packages', async () => {
    const projectFolder = await mkdtemp(path.join(tmpdir(), 'vpt-native-output-'))
    try {
        const main = await createFacade(projectFolder, 'native-counter', 'counter')
        const subpackage = await createFacade(projectFolder, 'native-card', 'card')
        const metadata = new Map([
            [main.moduleId, main.meta],
            [subpackage.moduleId, subpackage.meta]
        ])

        const output = await createNativeComponentOutput({
            bundle: {
                main: createChunk('assets/main.js', [main.moduleId]),
                subpackage: createChunk('sub/p_test/assets/subpackage.js', [subpackage.moduleId])
            },
            getModuleInfo: (moduleId) => {
                const meta = metadata.get(moduleId)
                return meta ? { meta } : null
            }
        })

        assert.deepEqual(
            output.files.map(({ fileName }) => fileName),
            ['components/native-counter/index.wxml', 'sub/p_test/components/native-card/index.wxml']
        )
        assert.deepEqual(
            output.files.map((file) => String(file.source)),
            ['counter', 'card']
        )
        assert.deepEqual(output.registrations, [
            {
                name: 'native-counter',
                componentPath: '/components/native-counter/index',
                properties: ['value'],
                events: ['change']
            },
            {
                name: 'native-card',
                componentPath: '/sub/p_test/components/native-card/index',
                properties: ['value'],
                events: ['change']
            }
        ])
    } finally {
        await rm(projectFolder, { force: true, recursive: true })
    }
})

function createChunk(fileName: string, moduleIds: string[]): Rolldown.OutputChunk {
    return {
        __rolldown_external_memory_handle__: () => ({ freed: false }),
        type: 'chunk',
        code: '',
        name: path.posix.basename(fileName, '.js'),
        isEntry: false,
        isDynamicEntry: false,
        facadeModuleId: null,
        moduleIds,
        exports: [],
        fileName,
        preliminaryFileName: fileName,
        modules: {},
        imports: [],
        dynamicImports: [],
        map: null,
        sourcemapFileName: null
    }
}

async function createFacade(projectFolder: string, name: string, content: string) {
    const folder = path.join(projectFolder, name)
    const moduleId = path.join(projectFolder, `${name}.ts`)
    await mkdir(folder)
    await writeFile(path.join(folder, 'index.wxml'), content)
    const compiled = await compileNativeComponentFacade({
        code: `
            import { defineNativeComponent } from 'virtual:taro/native'
            export const Component = defineNativeComponent('./${name}', {
                properties: { value: Number },
                events: { change: String }
            })
        `,
        id: moduleId,
        sourcemap: false,
        addWatchFile() {}
    })
    return { moduleId, meta: compiled.meta }
}
