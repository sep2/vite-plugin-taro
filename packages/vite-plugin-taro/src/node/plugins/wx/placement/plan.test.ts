import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import createPlacementPlan, { type PlacementPlan } from './plan.ts'

type TestChunk = {
    bytes?: number
    imports?: readonly string[]
    dynamicImports?: readonly string[]
    isEntry?: boolean
}

function graph(chunks: Readonly<Record<string, TestChunk>>) {
    const renderedChunks = Object.fromEntries(
        Object.entries(chunks).map(([chunkId, chunk]) => [chunkId, renderedChunk(chunkId, chunk)])
    )
    return {
        chunks: renderedChunks,
        getAdditionalChunkBytes(chunk: Rolldown.RenderedChunk): number {
            return chunks[chunk.fileName]?.bytes ?? 0
        }
    }
}

function renderedChunk(chunkId: string, chunk: TestChunk): Rolldown.RenderedChunk {
    const moduleId = `/fixture${chunkId}`
    return {
        type: 'chunk',
        name: chunkId,
        isEntry: chunk.isEntry ?? false,
        isDynamicEntry: false,
        facadeModuleId: moduleId,
        moduleIds: [moduleId],
        modules: {
            [moduleId]: { code: '', renderedLength: 0, renderedExports: [] }
        },
        exports: [],
        fileName: chunkId,
        imports: [...(chunk.imports ?? [])],
        dynamicImports: [...(chunk.dynamicImports ?? [])]
    } as Rolldown.RenderedChunk
}

function packageMembers(plan: PlacementPlan): string[][] {
    const membersByRoot = new Map<string, string[]>()
    for (const [chunkId, location] of plan) {
        if (location.kind === 'main') {
            continue
        }
        const members = membersByRoot.get(location.root) ?? []
        members.push(chunkId)
        membersByRoot.set(location.root, members)
    }
    return [...membersByRoot.values()]
        .map((members) => members.sort())
        .sort((left, right) => left.join('\0').localeCompare(right.join('\0')))
}

function packageCount(plan: PlacementPlan, chunkIds: readonly string[]): number {
    return new Set(
        chunkIds.map((chunkId) => {
            const location = plan.get(chunkId)
            assert.equal(location?.kind, 'subpackage')
            return location.root
        })
    ).size
}

test('keeps every entry static chunk closure in main', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry.js': { isEntry: true, imports: ['/eager.js'], dynamicImports: ['/feature.js'] },
            '/eager.js': { imports: ['/shared.js'] },
            '/shared.js': {},
            '/feature.js': { imports: ['/shared.js'] }
        }),
        planningBudgetBytes: 1_000
    })

    for (const chunkId of ['/entry.js', '/eager.js', '/shared.js']) {
        assert.equal(plan.get(chunkId)?.kind, 'main')
    }
    assert.equal(plan.get('/feature.js')?.kind, 'subpackage')
})

test('plans the final chunk graph after Rolldown tree shaking and scope hoisting', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry.js': { isEntry: true, dynamicImports: ['/feature-chunk.js'] },
            '/feature-chunk.js': { bytes: 400 }
        }),
        planningBudgetBytes: 1_200
    })

    assert.deepEqual(packageMembers(plan), [['/feature-chunk.js']])
})

test('places one fitting final-chunk transition in one package', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry.js': { isEntry: true, dynamicImports: ['/feature.js'] },
            '/feature.js': { bytes: 300, imports: ['/dependency.js'] },
            '/dependency.js': { bytes: 300 }
        }),
        planningBudgetBytes: 1_200
    })

    assert.deepEqual(packageMembers(plan), [['/dependency.js', '/feature.js']])
})

test('assigns one shared final chunk once while minimizing both transitions', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry.js': { isEntry: true, dynamicImports: ['/feature-a.js', '/feature-b.js'] },
            '/feature-a.js': { bytes: 200, imports: ['/shared.js'] },
            '/feature-b.js': { bytes: 200, imports: ['/shared.js'] },
            '/shared.js': { bytes: 300 }
        }),
        planningBudgetBytes: 1_500
    })

    assert.deepEqual(packageMembers(plan), [['/feature-a.js', '/feature-b.js', '/shared.js']])
    assert.equal([...plan.keys()].filter((chunkId) => chunkId === '/shared.js').length, 1)
})

test('prefers transition overlap over a tighter unrelated package', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry.js': { isEntry: true, dynamicImports: ['/feature-a.js', '/filler.js', '/feature-b.js'] },
            '/feature-a.js': { bytes: 200, imports: ['/shared.js'] },
            '/shared.js': { bytes: 200 },
            '/filler.js': { bytes: 1_100 },
            '/feature-b.js': { bytes: 250, imports: ['/shared.js'] }
        }),
        planningBudgetBytes: 1_300
    })

    assert.equal(packageCount(plan, ['/feature-a.js', '/feature-b.js', '/shared.js']), 1)
})

test('treats nested dynamic chunk edges as independent transitions', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry.js': { isEntry: true, dynamicImports: ['/outer.js'] },
            '/outer.js': { bytes: 300, imports: ['/outer-static.js'], dynamicImports: ['/inner.js'] },
            '/outer-static.js': { bytes: 300 },
            '/inner.js': { bytes: 300, imports: ['/inner-static.js'] },
            '/inner-static.js': { bytes: 300 }
        }),
        planningBudgetBytes: 2_000
    })

    assert.equal(packageCount(plan, ['/outer.js', '/outer-static.js']), 1)
    assert.equal(packageCount(plan, ['/inner.js', '/inner-static.js']), 1)
})

test('isolates one indivisible chunk above the planning budget', () => {
    const plan = createPlacementPlan({
        ...graph({
            '/entry.js': { isEntry: true, dynamicImports: ['/large.js', '/small.js'] },
            '/large.js': { bytes: 2_000 },
            '/small.js': { bytes: 200 }
        }),
        planningBudgetBytes: 1_200
    })

    assert.deepEqual(packageMembers(plan), [['/large.js'], ['/small.js']])
})

test('plans many final-chunk transitions without source-module traversal', () => {
    const chunks: Record<string, TestChunk> = {
        '/entry.js': {
            isEntry: true,
            dynamicImports: Array.from({ length: 1_000 }, (_, index) => `/feature-${index}.js`)
        }
    }
    for (let index = 0; index < 1_000; index++) {
        chunks[`/feature-${index}.js`] = { bytes: 100 }
    }

    const plan = createPlacementPlan({ ...graph(chunks), planningBudgetBytes: 20_000 })

    assert.equal(plan.size, 1_001)
    assert.ok(packageMembers(plan).length > 0)
})

test('produces stable roots independent of chunk object order', () => {
    const chunks = {
        '/entry.js': { isEntry: true, dynamicImports: ['/feature.js'] },
        '/feature.js': { bytes: 300, imports: ['/dependency.js'] },
        '/dependency.js': { bytes: 300 }
    }
    const forward = createPlacementPlan({ ...graph(chunks), planningBudgetBytes: 1_200 })
    const reverse = createPlacementPlan({
        ...graph(Object.fromEntries(Object.entries(chunks).reverse())),
        planningBudgetBytes: 1_200
    })

    assert.deepEqual([...forward.entries()].sort(), [...reverse.entries()].sort())
})
