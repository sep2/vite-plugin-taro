import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { createPlacement, type PackageLocation, type Placement } from './placement.ts'

const packageBudgetBytes = 1_900_000

type TestChunk = {
    bytes?: number
    imports?: readonly string[]
    dynamicImports?: readonly string[]
    isEntry?: boolean
}

type TestPlacement = {
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    placement: Placement
}

function createTestPlacement(chunks: Readonly<Record<string, TestChunk>>): TestPlacement {
    const renderedChunks = Object.fromEntries(
        Object.entries(chunks).map(([chunkId, chunk]) => [chunkId, renderedChunk(chunkId, chunk)])
    )
    const bytesByModuleId = new Map(
        Object.entries(chunks).map(([chunkId, chunk]) => [`/fixture${chunkId}`, chunk.bytes ?? 0])
    )
    return {
        chunks: renderedChunks,
        placement: createPlacement({
            chunks: renderedChunks,
            getAdditionalModuleBytes: (moduleId) => bytesByModuleId.get(moduleId) ?? 0
        })
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

function getLocation(output: TestPlacement, chunkId: string): PackageLocation {
    const chunk = output.chunks[chunkId]
    assert.ok(chunk)
    return output.placement.getPackageLocation(chunk)
}

function packageMembers(output: TestPlacement): string[][] {
    const membersByRoot = new Map<string, string[]>()
    for (const [chunkId, chunk] of Object.entries(output.chunks)) {
        const location = output.placement.getPackageLocation(chunk)
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

function packageCount(output: TestPlacement, chunkIds: readonly string[]): number {
    return new Set(
        chunkIds.map((chunkId) => {
            const location = getLocation(output, chunkId)
            assert.equal(location.kind, 'subpackage')
            return location.root
        })
    ).size
}

function sortedLocations(output: TestPlacement): readonly (readonly [string, PackageLocation])[] {
    return Object.entries(output.chunks)
        .map(([chunkId, chunk]) => [chunkId, output.placement.getPackageLocation(chunk)] as const)
        .sort(([left], [right]) => left.localeCompare(right))
}

test('keeps every entry static chunk closure in main', () => {
    const output = createTestPlacement({
        '/entry.js': { isEntry: true, imports: ['/eager.js'], dynamicImports: ['/feature.js'] },
        '/eager.js': { imports: ['/shared.js'] },
        '/shared.js': {},
        '/feature.js': { imports: ['/shared.js'] }
    })

    for (const chunkId of ['/entry.js', '/eager.js', '/shared.js']) {
        assert.equal(getLocation(output, chunkId).kind, 'main')
    }
    assert.equal(getLocation(output, '/feature.js').kind, 'subpackage')
})

test('plans the final chunk graph after Rolldown tree shaking and scope hoisting', () => {
    const output = createTestPlacement({
        '/entry.js': { isEntry: true, dynamicImports: ['/feature-chunk.js'] },
        '/feature-chunk.js': { bytes: 400 }
    })

    assert.deepEqual(packageMembers(output), [['/feature-chunk.js']])
})

test('places one fitting final-chunk transition in one package', () => {
    const output = createTestPlacement({
        '/entry.js': { isEntry: true, dynamicImports: ['/feature.js'] },
        '/feature.js': { bytes: 300, imports: ['/dependency.js'] },
        '/dependency.js': { bytes: 300 }
    })

    assert.deepEqual(packageMembers(output), [['/dependency.js', '/feature.js']])
})

test('assigns one shared final chunk once while minimizing both transitions', () => {
    const output = createTestPlacement({
        '/entry.js': { isEntry: true, dynamicImports: ['/feature-a.js', '/feature-b.js'] },
        '/feature-a.js': { bytes: 200, imports: ['/shared.js'] },
        '/feature-b.js': { bytes: 200, imports: ['/shared.js'] },
        '/shared.js': { bytes: 300 }
    })

    assert.deepEqual(packageMembers(output), [['/feature-a.js', '/feature-b.js', '/shared.js']])
    assert.equal(Object.keys(output.chunks).filter((chunkId) => chunkId === '/shared.js').length, 1)
})

test('uses fullest-bin capacity as the stable tie-breaker when transition overlap is equal', () => {
    const output = createTestPlacement({
        '/entry.js': { isEntry: true, dynamicImports: ['/large.js', '/medium.js', '/candidate.js'] },
        '/large.js': { bytes: 1_000_000 },
        '/medium.js': { bytes: 950_000 },
        '/candidate.js': { bytes: 800_000 },
        '/orphan.js': { bytes: 100 }
    })

    assert.equal(packageCount(output, ['/large.js', '/candidate.js']), 1)
    assert.equal(getLocation(output, '/orphan.js').kind, 'subpackage')
})

test('prefers transition overlap over a tighter unrelated package', () => {
    const output = createTestPlacement({
        '/entry.js': { isEntry: true, dynamicImports: ['/feature-a.js', '/filler.js', '/feature-b.js'] },
        '/feature-a.js': { bytes: 200, imports: ['/shared.js'] },
        '/shared.js': { bytes: 200 },
        '/filler.js': { bytes: packageBudgetBytes - 300 },
        '/feature-b.js': { bytes: 250, imports: ['/shared.js'] }
    })

    assert.equal(packageCount(output, ['/feature-a.js', '/feature-b.js', '/shared.js']), 1)
})

test('treats nested dynamic chunk edges as independent transitions', () => {
    const output = createTestPlacement({
        '/entry.js': { isEntry: true, dynamicImports: ['/outer.js'] },
        '/outer.js': { bytes: 300, imports: ['/outer-static.js'], dynamicImports: ['/inner.js'] },
        '/outer-static.js': { bytes: 300 },
        '/inner.js': { bytes: 300, imports: ['/inner-static.js'] },
        '/inner-static.js': { bytes: 300 }
    })

    assert.equal(packageCount(output, ['/outer.js', '/outer-static.js']), 1)
    assert.equal(packageCount(output, ['/inner.js', '/inner-static.js']), 1)
})

test('isolates one indivisible chunk above the planning budget', () => {
    const output = createTestPlacement({
        '/entry.js': { isEntry: true, dynamicImports: ['/large.js', '/small.js'] },
        '/large.js': { bytes: packageBudgetBytes + 100 },
        '/small.js': { bytes: 200 }
    })

    assert.deepEqual(packageMembers(output), [['/large.js'], ['/small.js']])
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

    const output = createTestPlacement(chunks)

    assert.equal(Object.keys(output.chunks).length, 1_001)
    assert.ok(packageMembers(output).length > 0)
})

test('ignores dangling graph edges and rejects chunks absent from the final plan', () => {
    const output = createTestPlacement({
        '/entry.js': {
            isEntry: true,
            imports: ['/missing-eager.js'],
            dynamicImports: ['/missing-lazy.js', '/entry.js', '/feature.js']
        },
        '/feature.js': { imports: ['/missing-feature-dependency.js'] }
    })

    assert.equal(getLocation(output, '/entry.js').kind, 'main')
    assert.equal(getLocation(output, '/feature.js').kind, 'subpackage')

    const unknown = renderedChunk('/unknown.js', {})
    assert.throws(() => output.placement.getPackageLocation(unknown), /placement is missing final chunk: \/unknown\.js/)
})

test('produces stable roots independent of chunk object order', () => {
    const chunks = {
        '/entry.js': { isEntry: true, dynamicImports: ['/feature.js'] },
        '/feature.js': { bytes: 300, imports: ['/dependency.js'] },
        '/dependency.js': { bytes: 300 }
    }
    const forward = createTestPlacement(chunks)
    const reverse = createTestPlacement(Object.fromEntries(Object.entries(chunks).reverse()))

    assert.deepEqual(sortedLocations(forward), sortedLocations(reverse))
})
