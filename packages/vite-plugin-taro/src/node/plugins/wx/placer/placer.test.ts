import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { bootstrapPath, rolldownRuntimeId, transportPath } from '../native/constant.ts'
import { getWxModuleKind } from '../native/module-kind.ts'
import { createPlacer } from './placer.ts'

function chunk(...moduleIds: string[]): Rolldown.PreRenderedChunk {
    return { isEntry: false, moduleIds } as Rolldown.PreRenderedChunk
}

function renderedChunk(fileName: string): Rolldown.RenderedChunk {
    return { fileName } as Rolldown.RenderedChunk
}

type TestModule = {
    code?: string
    isEntry?: boolean
    imports?: readonly string[]
    dynamicImports?: readonly string[]
}

/** Analyzes a compact test graph through Rolldown's module-info contract. */
function analyze(placer: ReturnType<typeof createPlacer>, modules: Readonly<Record<string, TestModule>>): void {
    placer.analyze({
        moduleIds: Object.keys(modules),
        getModuleInfo(moduleId) {
            const module = modules[moduleId]
            if (!module) {
                return null
            }
            return {
                id: moduleId,
                code: module.code ?? '',
                isEntry: module.isEntry ?? false,
                importedIds: module.imports ?? [],
                dynamicallyImportedIds: module.dynamicImports ?? []
            } as unknown as Rolldown.ModuleInfo
        }
    })
}

test('places the eager graph and output-only modules in main', () => {
    const placer = createPlacer()
    analyze(placer, {
        '/entry': { isEntry: true, imports: ['/application'] },
        '/application': {}
    })

    for (const currentChunk of [chunk('/application'), chunk('/output-runtime'), chunk(), chunk(bootstrapPath)]) {
        assert.equal(placer.rolldownOptions.output.chunkFileNames(currentChunk), 'assets/[name]-[hash].js')
    }
    assert.equal(placer.getLoadMode(renderedChunk('assets/application.js')), 'sync')
})

test('places dynamic-only modules in a generated asynchronous package', () => {
    const placer = createPlacer()
    analyze(placer, {
        '/entry': { isEntry: true, dynamicImports: ['/application'] },
        '/application': { dynamicImports: ['/lazy'] },
        '/lazy': { imports: ['/dependency'] },
        '/dependency': {}
    })

    const lazyChunk = chunk('/lazy', '/dependency')
    const filePattern = placer.rolldownOptions.output.chunkFileNames(lazyChunk)
    const root = filePattern.slice(0, filePattern.indexOf('/assets/'))
    const fileName = `${root}/assets/lazy.js`
    const bundle = {
        [fileName]: {
            type: 'chunk',
            fileName,
            moduleIds: lazyChunk.moduleIds
        }
    } as unknown as Rolldown.OutputBundle

    assert.match(filePattern, /^sub\/p_[a-f0-9]{8}\/assets\/\[hash]\.js$/)
    assert.equal(placer.getLoadMode(renderedChunk(fileName)), 'async')
    assert.deepEqual(placer.getSubpackages({}), [])
    assert.deepEqual(placer.getSubpackages(bundle), [
        {
            name: root.slice('sub/'.length),
            root,
            pages: []
        }
    ])
})

test('rejects a Rolldown chunk that mixes physical package owners', () => {
    const placer = createPlacer()
    analyze(placer, {
        '/entry': { isEntry: true, imports: ['/eager'] },
        '/eager': { dynamicImports: ['/lazy'] },
        '/lazy': {}
    })

    assert.throws(
        () => placer.rolldownOptions.output.chunkFileNames(chunk('/eager', '/lazy')),
        /wx chunk mixes package owners/
    )
})

test('supports an optional amphibious Rolldown runtime without choosing strict ordering', () => {
    const placer = createPlacer()

    assert.equal('strictExecutionOrder' in placer.rolldownOptions.output, false)
    assert.equal(getWxModuleKind(chunk(rolldownRuntimeId)), 'amphibious')
})

test('hashes transport while preserving exact native entry paths', () => {
    const placer = createPlacer()

    assert.equal(placer.rolldownOptions.output.entryFileNames(chunk(transportPath)), 'assets/[name]-[hash].js')
    assert.equal(placer.rolldownOptions.output.entryFileNames(chunk('/native-shell')), '[name]')
})
