import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { bootstrapPath, transportPath } from '../native/constant.ts'
import { createPlacer } from './placer.ts'

function chunk(...moduleIds: string[]): Rolldown.PreRenderedChunk {
    return { moduleIds } as Rolldown.PreRenderedChunk
}

type TestModule = {
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
                isEntry: module.isEntry ?? false,
                importedIds: module.imports ?? [],
                dynamicallyImportedIds: module.dynamicImports ?? []
            } as unknown as Rolldown.ModuleInfo
        }
    })
}

test('classifies eager and dynamic-only module closures', () => {
    const placer = createPlacer()
    analyze(placer, {
        '/entry': { isEntry: true, imports: ['/static'], dynamicImports: ['/lazy'] },
        '/static': { imports: ['/shared'] },
        '/lazy': { imports: ['/lazy-dependency', '/shared'], dynamicImports: ['/nested-lazy'] },
        '/lazy-dependency': {},
        '/nested-lazy': {},
        '/shared': {}
    })

    assert.equal(placer.getModuleKind('/entry'), 'eager')
    assert.equal(placer.getModuleKind('/static'), 'eager')
    assert.equal(placer.getModuleKind('/shared'), 'eager')
    assert.equal(placer.getModuleKind('/lazy'), 'lazy')
    assert.equal(placer.getModuleKind('/lazy-dependency'), 'lazy')
    assert.equal(placer.getModuleKind('/nested-lazy'), 'lazy')
})

test('classifies cycles reached after a dynamic boundary as lazy', () => {
    const placer = createPlacer()
    analyze(placer, {
        '/entry': { isEntry: true, dynamicImports: ['/cycle-a'] },
        '/cycle-a': { imports: ['/cycle-b'] },
        '/cycle-b': { dynamicImports: ['/cycle-a'] }
    })

    assert.equal(placer.getModuleKind('/cycle-a'), 'lazy')
    assert.equal(placer.getModuleKind('/cycle-b'), 'lazy')
})

test('keeps required and eligible chunks in the initial main placement', () => {
    const placer = createPlacer()
    analyze(placer, {
        '/entry': { isEntry: true, imports: ['/eager'], dynamicImports: ['/lazy'] },
        '/eager': {},
        '/lazy': { imports: ['/lazy-dependency'] },
        '/lazy-dependency': {}
    })

    assert.deepEqual(placer.locateChunk(chunk('/lazy', '/lazy-dependency')), { kind: 'main' })
    assert.deepEqual(placer.locateChunk(chunk('/eager', '/lazy')), { kind: 'main' })
    assert.deepEqual(placer.locateChunk({ ...chunk('/native-entry'), isEntry: true } as Rolldown.PreRenderedChunk), {
        kind: 'main'
    })
    assert.deepEqual(placer.locateChunk(chunk()), { kind: 'main' })
    assert.deepEqual(placer.locateChunk(chunk(bootstrapPath)), { kind: 'main' })
    assert.throws(() => placer.locateChunk(chunk('/unknown')), /Unclassified WX module: \/unknown/)
})

test('places the initial WX chunk graph in the main package', () => {
    const placer = createPlacer()
    const applicationChunk = chunk('/application')
    analyze(placer, {
        '/application': { isEntry: true }
    })

    assert.deepEqual(placer.locateChunk(applicationChunk), { kind: 'main' })
    assert.equal(placer.getLoadMode(applicationChunk), 'sync')
    assert.equal(placer.chunkFileNames(), 'assets/[name]-[hash].js')
})

test('hashes transport while preserving exact native entry paths', () => {
    const placer = createPlacer()

    assert.equal(placer.entryFileNames(chunk(transportPath)), 'assets/[name]-[hash].js')
    assert.equal(placer.entryFileNames(chunk('/native-shell')), '[name]')
})
