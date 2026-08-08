import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { createPlacementPlan, type ModuleGraph, type PlacementPlan } from './plan.ts'

type TestModule = {
    code?: string
    isEntry?: boolean
    imports?: readonly string[]
    dynamicImports?: readonly string[]
    additionalBytes?: number
}

function subpackageRoots(plan: PlacementPlan): string[] {
    return [
        ...new Set([...plan.values()].flatMap((location) => (location.kind === 'subpackage' ? [location.root] : [])))
    ].sort()
}

function graph(modules: Readonly<Record<string, TestModule>>): ModuleGraph {
    return {
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
        },
        getAdditionalModuleBytes(info) {
            return modules[info.id]?.additionalBytes ?? 0
        }
    }
}

test('keeps the complete eager closure in main', () => {
    const plan = createPlacementPlan(
        graph({
            '/entry': { isEntry: true, imports: ['/eager'] },
            '/eager': { imports: ['/shared'], dynamicImports: ['/lazy'] },
            '/lazy': { imports: ['/shared'] },
            '/shared': {}
        })
    )

    assert.equal(plan.get('/entry')?.kind, 'main')
    assert.equal(plan.get('/eager')?.kind, 'main')
    assert.equal(plan.get('/shared')?.kind, 'main')
    assert.equal(plan.get('/lazy')?.kind, 'subpackage')
})

test('splits an oversized lazy static cycle across subpackages', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry': { isEntry: true, imports: ['/application'] },
            '/application': { dynamicImports: ['/cycle-a'] },
            '/cycle-a': { code: 'a'.repeat(60), imports: ['/cycle-b'] },
            '/cycle-b': { code: 'b'.repeat(60), imports: ['/cycle-a'] }
        }),
        planningBudgetBytes: 100
    })

    const cycleA = plan.get('/cycle-a')
    const cycleB = plan.get('/cycle-b')
    assert.equal(cycleA?.kind, 'subpackage')
    assert.equal(cycleB?.kind, 'subpackage')
    assert.notEqual(
        cycleA?.kind === 'subpackage' ? cycleA.root : undefined,
        cycleB?.kind === 'subpackage' ? cycleB.root : undefined
    )
})

test('plans nested static and dynamic imports without collapsing lazy boundaries into main', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry': { isEntry: true, imports: ['/application'] },
            '/application': { imports: ['/main-shared'], dynamicImports: ['/feature'] },
            '/main-shared': {},
            '/feature': {
                code: 'a'.repeat(60),
                imports: ['/feature-static'],
                dynamicImports: ['/nested-dynamic']
            },
            '/feature-static': { imports: ['/cycle-peer'] },
            '/cycle-peer': { code: 'b'.repeat(60), imports: ['/feature'] },
            '/nested-dynamic': {
                imports: ['/nested-static'],
                dynamicImports: ['/deep-dynamic']
            },
            '/nested-static': { imports: ['/cycle-peer', '/main-shared'] },
            '/deep-dynamic': { imports: ['/deep-static'] },
            '/deep-static': { imports: ['/feature', '/main-shared'] }
        }),
        planningBudgetBytes: 100
    })

    for (const moduleId of ['/entry', '/application', '/main-shared']) {
        assert.equal(plan.get(moduleId)?.kind, 'main')
    }
    for (const moduleId of [
        '/feature',
        '/feature-static',
        '/cycle-peer',
        '/nested-dynamic',
        '/nested-static',
        '/deep-dynamic',
        '/deep-static'
    ]) {
        assert.equal(plan.get(moduleId)?.kind, 'subpackage')
    }

    const feature = plan.get('/feature')
    const cyclePeer = plan.get('/cycle-peer')
    assert.notEqual(
        feature?.kind === 'subpackage' ? feature.root : undefined,
        cyclePeer?.kind === 'subpackage' ? cyclePeer.root : undefined
    )
})

test('co-locates a lazy root and static dependencies when size permits', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry': { isEntry: true, imports: ['/application'] },
            '/application': { dynamicImports: ['/lazy'] },
            '/lazy': { code: 'a'.repeat(40), imports: ['/dependency'] },
            '/dependency': { code: 'b'.repeat(40) }
        }),
        planningBudgetBytes: 100
    })

    const lazy = plan.get('/lazy')
    const dependency = plan.get('/dependency')
    assert.equal(lazy?.kind, 'subpackage')
    assert.equal(dependency?.kind, 'subpackage')
    assert.equal(
        lazy?.kind === 'subpackage' ? lazy.root : undefined,
        dependency?.kind === 'subpackage' ? dependency.root : undefined
    )
})

test('includes additional module output in the subpackage budget', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry': { isEntry: true, imports: ['/application'] },
            '/application': { dynamicImports: ['/lazy'] },
            '/lazy': { code: 'a'.repeat(40), imports: ['/dependency'] },
            '/dependency': { code: 'b'.repeat(40), additionalBytes: 30 }
        }),
        planningBudgetBytes: 100
    })

    const lazy = plan.get('/lazy')
    const dependency = plan.get('/dependency')
    assert.equal(lazy?.kind, 'subpackage')
    assert.equal(dependency?.kind, 'subpackage')
    assert.notEqual(
        lazy?.kind === 'subpackage' ? lazy.root : undefined,
        dependency?.kind === 'subpackage' ? dependency.root : undefined
    )
})

test('produces stable subpackage roots independent of graph iteration order', () => {
    const modules = {
        '/entry': { isEntry: true, imports: ['/application'] },
        '/application': { dynamicImports: ['/lazy'] },
        '/lazy': { code: 'lazy', imports: ['/dependency'] },
        '/dependency': { code: 'dependency' }
    }
    const forward = createPlacementPlan(graph(modules))
    const reverse = createPlacementPlan(
        graph(Object.fromEntries(Object.entries(modules).reverse()) as Readonly<Record<string, TestModule>>)
    )

    assert.deepEqual(subpackageRoots(forward), subpackageRoots(reverse))
})
