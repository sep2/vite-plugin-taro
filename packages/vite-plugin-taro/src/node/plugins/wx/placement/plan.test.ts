import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { createPlacementPlan, type ModuleGraph, type PlacementPlan } from './plan.ts'

type TestModule = {
    code?: string
    isEntry?: boolean
    imports?: readonly string[]
    dynamicImports?: readonly string[]
}

function packageRoots(plan: PlacementPlan): string[] {
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

test('splits an oversized lazy static cycle across packages', () => {
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

test('produces stable package roots independent of graph iteration order', () => {
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

    assert.deepEqual(packageRoots(forward), packageRoots(reverse))
})
