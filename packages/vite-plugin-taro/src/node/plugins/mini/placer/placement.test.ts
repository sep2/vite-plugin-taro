import assert from 'node:assert/strict'
import test from 'node:test'
import type { Rolldown } from 'vite'
import { resolveMiniPage } from '../resolve/resolve-mini-page.ts'
import { createPlacement, type PackageLocation, type Placement } from './placement.ts'

const packageBudgetBytes = 1_900_000

type TestChunk = {
    bytes?: number
    imports?: readonly string[]
    dynamicImports?: readonly string[]
    isEntry?: boolean
    facadeModuleId?: string | null
}

type TestPlacement = {
    chunks: Readonly<Record<string, Rolldown.RenderedChunk>>
    placement: Placement
}

function pageEntry(subpackage: string, path: string) {
    return resolveMiniPage({ subpackage, path }, '.wxss')
}

function createTestPlacement(
    chunks: Readonly<Record<string, TestChunk>>,
    options?: Pick<Parameters<typeof createPlacement>[0], 'pageEntries' | 'automaticSubpackages'>
): TestPlacement {
    const renderedChunks = Object.fromEntries(
        Object.entries(chunks).map(([chunkId, chunk]) => [chunkId, renderedChunk(chunkId, chunk)])
    )
    const bytesByModuleId = new Map(
        Object.entries(chunks).map(([chunkId, chunk]) => [`/fixture${chunkId}`, chunk.bytes ?? 0])
    )
    return {
        chunks: renderedChunks,
        placement: createPlacement({
            automaticSubpackages: options?.automaticSubpackages ?? true,
            pageEntries: options?.pageEntries ?? [],
            chunks: renderedChunks,
            planningBudgetBytes: packageBudgetBytes,
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
        facadeModuleId: chunk.facadeModuleId === undefined ? moduleId : chunk.facadeModuleId,
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

test('keeps nested lazy chunks and shared dependencies in main when automatic subpackages are disabled', () => {
    const chunks = {
        'entry.js': renderedChunk('entry.js', { isEntry: true, dynamicImports: ['feature.js'] }),
        'feature.js': renderedChunk('feature.js', { imports: ['shared.js'], dynamicImports: ['nested.js'] }),
        'nested.js': renderedChunk('nested.js', { imports: ['shared.js'] }),
        'shared.js': renderedChunk('shared.js', {})
    }
    for (const chunk of Object.values(chunks)) {
        Object.defineProperty(chunk, 'dynamicImports', {
            get: () => assert.fail('Main-only placement must skip dynamic-import analysis')
        })
    }
    const placement = createPlacement({
        automaticSubpackages: false,
        pageEntries: [],
        chunks,
        planningBudgetBytes: packageBudgetBytes,
        getAdditionalModuleBytes: () => assert.fail('Main-package chunks do not need package-size estimates')
    })
    for (const [id, chunk] of Object.entries(chunks)) {
        assert.deepEqual(placement.getPackageLocation(chunk), { kind: 'main' })
        assert.equal(placement.getPhysicalChunkId(chunk), id)
    }
    assert.deepEqual(packageMembers({ chunks, placement }), [])
})

test('keeps the union of entry static closures in main, including cycles but not dynamic imports', () => {
    const output = createTestPlacement({
        'home.js': { isEntry: true, imports: ['shared.js'] },
        'detail.js': { isEntry: true, imports: ['popup.js'] },
        'popup.js': { imports: ['detail.js', 'shared.js'], dynamicImports: ['invoice.js'] },
        'shared.js': {},
        'invoice.js': { imports: ['shared.js'] }
    })

    for (const id of ['home.js', 'detail.js', 'popup.js', 'shared.js']) {
        assert.equal(getLocation(output, id).kind, 'main')
    }
    assert.equal(getLocation(output, 'invoice.js').kind, 'subpackage')
})

for (const automaticSubpackages of [false, true]) {
    test(`assigns eager code by entry package (automatic subpackages: ${automaticSubpackages})`, () => {
        const output = createTestPlacement(
            {
                'home.js': { isEntry: true, imports: ['shared.js'] },
                'orders/detail.js': { isEntry: true, imports: ['popup.js', 'shared.js', 'format.js'] },
                'orders/list.js': { isEntry: true, imports: ['popup.js'] },
                'account/profile.js': { isEntry: true, imports: ['format.js'], bytes: 500_000 },
                'popup.js': { dynamicImports: ['invoice.js'] },
                'format.js': { imports: ['locale.js'] },
                'locale.js': { imports: ['format.js'] },
                'shared.js': {},
                'invoice.js': {}
            },
            {
                automaticSubpackages,
                pageEntries: [
                    pageEntry('orders', 'detail'),
                    pageEntry('orders', 'list'),
                    pageEntry('account', 'profile')
                ]
            }
        )

        for (const id of ['orders/detail.js', 'orders/list.js', 'popup.js']) {
            assert.deepEqual(getLocation(output, id), { kind: 'subpackage', root: 'orders' })
        }
        assert.deepEqual(getLocation(output, 'account/profile.js'), { kind: 'subpackage', root: 'account' })
        for (const id of ['home.js', 'shared.js', 'format.js', 'locale.js']) {
            assert.deepEqual(getLocation(output, id), { kind: 'main' })
        }
        assert.equal(output.placement.getPhysicalChunkId(output.chunks['orders/detail.js']!), 'orders/detail.js')
        const invoice = getLocation(output, 'invoice.js')
        assert.deepEqual(invoice, automaticSubpackages ? { kind: 'subpackage', root: 'orders' } : { kind: 'main' })
    })
}

test('charges both the named entry and its eager dependencies before packing lazy chunks', () => {
    const chunks = {
        'orders/detail.js': { isEntry: true, imports: ['popup.js'], bytes: 600_000 },
        'popup.js': { dynamicImports: ['invoice.js'], bytes: 700_000 },
        'invoice.js': { bytes: 500_000 }
    }
    const options = {
        automaticSubpackages: true,
        pageEntries: [pageEntry('orders', 'detail')]
    }
    const fits = createTestPlacement(chunks, options)
    assert.deepEqual(getLocation(fits, 'invoice.js'), { kind: 'subpackage', root: 'orders' })

    const full = { ...chunks, 'invoice.js': { bytes: 650_000 } }
    const spill = createTestPlacement(full, options)
    const invoice = getLocation(spill, 'invoice.js')
    assert.ok(invoice.kind === 'subpackage' && invoice.root.startsWith('sub/p_'))
    assert.deepEqual(getLocation(spill, 'popup.js'), { kind: 'subpackage', root: 'orders' })

    const fallback = createTestPlacement(
        { ...full, 'account/profile.js': { isEntry: true } },
        {
            automaticSubpackages: true,
            pageEntries: [...options.pageEntries, pageEntry('account', 'profile')]
        }
    )
    assert.deepEqual(getLocation(fallback, 'invoice.js'), { kind: 'subpackage', root: 'account' })
})

test('resolves exact entry module IDs and chunk objects through the same physical placement', () => {
    const bootstrapId = '/runtime/bootstrap.ts?target=wx'
    const featureId = '/app/feature.ts?variant=compact#entry'
    const output = createTestPlacement({
        'runtime/loader.js': {
            isEntry: true,
            facadeModuleId: bootstrapId,
            imports: ['common/shared.js'],
            dynamicImports: ['common/feature.js']
        },
        'common/shared.js': { facadeModuleId: null },
        'common/feature.js': { facadeModuleId: featureId }
    })
    const bootstrap = output.chunks['runtime/loader.js']
    const shared = output.chunks['common/shared.js']
    const feature = output.chunks['common/feature.js']
    assert.ok(bootstrap && shared && feature)
    assert.equal(output.placement.getPhysicalChunkId(bootstrapId), 'runtime/loader.js')
    assert.equal(output.placement.getPhysicalChunkId(bootstrap), 'runtime/loader.js')
    assert.equal(output.placement.getPhysicalChunkId(shared), 'common/shared.js')
    const location = output.placement.getPackageLocation(feature)
    assert.equal(location.kind, 'subpackage')
    const physicalFeature = `${location.root}/common/feature.js`
    assert.equal(output.placement.getPhysicalChunkId(featureId), physicalFeature)
    assert.equal(output.placement.getPhysicalChunkId(feature), physicalFeature)
    for (const missing of ['/runtime/bootstrap.ts', 'runtime/loader.js', '/fixturecommon/shared.js']) {
        assert.throws(() => output.placement.getPhysicalChunkId(missing), {
            message: `Mini Program placement is missing entry module: ${missing}`
        })
    }
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

test('produces stable roots independent of chunk and dynamic import order', () => {
    const chunks = {
        '/entry.js': { isEntry: true, dynamicImports: ['/feature.js', '/report.js'] },
        '/feature.js': { bytes: 1_000_000, imports: ['/dependency.js'] },
        '/report.js': { bytes: 1_000_000, imports: ['/dependency.js'] },
        '/dependency.js': { bytes: 300 }
    }
    const forward = createTestPlacement(chunks)
    const reverse = createTestPlacement(
        Object.fromEntries(
            Object.entries({
                ...chunks,
                '/entry.js': { isEntry: true, dynamicImports: chunks['/entry.js'].dynamicImports.toReversed() }
            }).reverse()
        )
    )

    assert.deepEqual(sortedLocations(forward), sortedLocations(reverse))
})
