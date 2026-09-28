import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { normalizePath } from 'vite'
import { createMiniStyleEntries } from '../../../tests/create-mini-style-entries.ts'
import { normalizeModuleId } from '../../../utils/modules.ts'
import { projectMiniStyles } from './project-mini-styles.ts'

/** Owns mutable graph/capture fixtures so each projection must reflect the current compiler snapshot. */
function createFixture(entries: Parameters<typeof projectMiniStyles>[0]) {
    const graph = new Map<string, { importedIds: readonly string[]; dynamicallyImportedIds: readonly string[] }>()
    const styles = new Map<
        string,
        { css: string | undefined; tailwind: { classSet: ReadonlySet<string> } | undefined }
    >()
    const context = {
        getModuleInfo(id: string) {
            assert.equal(this, context, 'Graph reads must retain their owner context')
            return graph.get(id) ?? null
        }
    }
    return {
        graph,
        styles,
        project: (cssCodeSplit: boolean) => projectMiniStyles(entries, styles, context, cssCodeSplit),
        module(id: string, importedIds: readonly string[], dynamicallyImportedIds: readonly string[]) {
            graph.set(id, { importedIds, dynamicallyImportedIds })
        },
        style(id: string, css: string | undefined, candidates: readonly string[] | undefined) {
            styles.set(normalizeModuleId(id), {
                css,
                tailwind: candidates ? { classSet: new Set(candidates) } : undefined
            })
            graph.set(id, { importedIds: [], dynamicallyImportedIds: [] })
        }
    }
}

test('keeps App styles global and Page-shared component styles in each consumer', () => {
    const entries = createMiniStyleEntries('/app.js', ['/page.js?route=first', '/page.js?route=second'])
    const originalEntries = structuredClone(entries)
    const fixture = createFixture(entries)
    fixture.style('/global.css', '.global {}', ['global'])
    fixture.style('/chrome.module.css', '._chrome_hash {}', undefined)
    fixture.style('/shared.module.css', '._shared_hash {}', ['shared'])
    fixture.style('/first.css', '.first {}', ['first'])
    fixture.style('/second.css', '.second {}', ['second'])
    fixture.style('/shell.css', '.shell {}', ['shell'])
    fixture.style('/unused.css', '.unused {}', ['unused'])
    fixture.module('/chrome.js', ['/chrome.module.css'], [])
    fixture.module('/shared.js', ['/chrome.js', '/shared.module.css'], [])
    fixture.module('/app.js', ['/global.css'], ['/chrome.js'])
    fixture.module('/page.js?route=first', ['/shared.js', '/first.css'], [])
    fixture.module('/page.js?route=second', ['/shared.js', '/second.css'], [])
    fixture.module(entries.appEntries.shellId, ['/shell.css'], [])
    fixture.module(entries.pageEntries[0]!.shellId, ['/shell.css'], [])
    const originalStyles = structuredClone(fixture.styles)

    const projection = fixture.project(true)
    const [first, second] = projection.pageEntries
    assert.ok(first && second)
    assert.equal(projection.appEntries.css, '.global {}\n._chrome_hash {}')
    assert.deepEqual([...projection.appEntries.styles.keys()], ['/global.css', '/chrome.module.css'])
    assert.equal(first.css, '._shared_hash {}\n.first {}')
    assert.equal(second.css, '._shared_hash {}\n.second {}')
    assert.deepEqual(first.classSet, new Set(['shared', 'first']))
    assert.deepEqual(second.classSet, new Set(['shared', 'second']))
    assert.deepEqual(projection.appEntries.classSet, new Set(['global']))
    assert.deepEqual(projection.classSet, new Set(['global', 'shared', 'first', 'second']))
    for (const [index, projected] of [projection.appEntries, ...projection.pageEntries].entries()) {
        const { styles, css, classSet, ...entry } = projected
        assert.deepEqual(entry, [entries.appEntries, ...entries.pageEntries][index])
        assert.ok(styles.size > 0 && css.length > 0 && classSet.size > 0)
    }
    assert.deepEqual(entries, originalEntries)
    assert.deepEqual(fixture.styles, originalStyles)
})

test('preserves independent Page cascades through shared cyclic and dynamic dependencies', () => {
    const fixture = createFixture(createMiniStyleEntries('/app.js', ['/first.js', '/second.js']))
    fixture.style('/app.css', '.app {}', undefined)
    fixture.style('/dependency.css', '.dependency {}', undefined)
    fixture.style('/shared.css', '.shared {}', ['shared'])
    fixture.style('/lazy.css', '.lazy {}', ['lazy'])
    fixture.style('/first.css', '.first {}', undefined)
    fixture.style('/second.css', '.second {}', undefined)
    fixture.module('/app.js', ['/app.css'], [])
    fixture.module('/component.js', ['/dependency.css', '/shared.css'], ['/lazy.js'])
    fixture.module('/lazy.js', ['/component.js', '/lazy.css'], ['/lazy.js'])
    fixture.module('/first.js', ['/component.js', '/first.css'], [])
    fixture.module('/second.js', ['/second.css', '/component.js'], [])

    const projection = fixture.project(true)
    assert.deepEqual(
        projection.pageEntries.map((entry) => entry.css),
        ['.dependency {}\n.shared {}\n.lazy {}\n.first {}', '.second {}\n.dependency {}\n.shared {}\n.lazy {}']
    )
    assert.deepEqual(
        projection.pageEntries.map((entry) => entry.classSet),
        [new Set(['shared', 'lazy']), new Set(['shared', 'lazy'])]
    )
    assert.deepEqual(projection.classSet, new Set(['shared', 'lazy']))
})

test('deduplicates physical query variants without pruning dependencies of App-owned CSS', () => {
    const root = path.resolve('fixture')
    const appId = path.join(root, 'app.js')
    const pageId = path.join(root, 'page.js')
    const appCss = path.join(root, 'app.css')
    const pageCss = path.join(root, 'page.css')
    const extraCss = path.join(root, 'extra.css')
    const fixture = createFixture(createMiniStyleEntries(appId, [pageId]))
    fixture.style(`${appCss}?v=app`, '.app {}', ['app'])
    fixture.style(`${pageCss}?v=one`, '.page {}', ['page'])
    fixture.style(`${pageCss}?v=two`, '.page {}', ['page'])
    fixture.style(extraCss, '.extra {}', ['extra'])
    fixture.module(`${appCss}?v=page`, [extraCss], [])
    fixture.module(appId, [`${appCss}?v=app`], [])
    fixture.module(pageId, [`${appCss}?v=page`, `${pageCss}?v=one`, `${pageCss}?v=two`], [])

    const projection = fixture.project(true)
    const page = projection.pageEntries[0]!
    assert.deepEqual([...projection.appEntries.styles.keys()], [normalizePath(appCss)])
    assert.deepEqual([...page.styles.keys()], [normalizePath(extraCss), normalizePath(pageCss)])
    assert.equal(page.css, '.extra {}\n.page {}')
    assert.deepEqual(page.classSet, new Set(['extra', 'page']))
    assert.deepEqual(projection.classSet, new Set(['app', 'extra', 'page']))
})

test('recomputes ownership and prunes removed imports without retaining stale CSS or candidates', () => {
    const fixture = createFixture(createMiniStyleEntries('/app.js', ['/first.js', '/second.js']))
    fixture.style('/shared.css', '.shared {}', ['shared'])
    fixture.style('/first.css', '.first {}', ['first'])
    fixture.module('/app.js', ['/shared.css'], [])
    fixture.module('/first.js', ['/shared.css', '/first.css'], [])
    fixture.module('/second.js', ['/shared.css'], [])
    const initial = fixture.project(true)
    assert.equal(initial.appEntries.css, '.shared {}')
    assert.deepEqual(
        initial.pageEntries.map((entry) => entry.css),
        ['.first {}', '']
    )

    fixture.module('/app.js', [], [])
    const pageOwned = fixture.project(true)
    assert.equal(pageOwned.appEntries.css, '')
    assert.deepEqual(pageOwned.appEntries.classSet, new Set())
    assert.deepEqual(
        pageOwned.pageEntries.map((entry) => entry.css),
        ['.shared {}\n.first {}', '.shared {}']
    )
    assert.deepEqual(
        pageOwned.pageEntries.map((entry) => entry.classSet),
        [new Set(['shared', 'first']), new Set(['shared'])]
    )
    assert.deepEqual(pageOwned.classSet, initial.classSet)

    fixture.module('/first.js', ['/first.css'], [])
    const oneConsumer = fixture.project(true)
    assert.deepEqual(
        oneConsumer.pageEntries.map((entry) => entry.css),
        ['.first {}', '.shared {}']
    )
    assert.deepEqual(oneConsumer.classSet, new Set(['first', 'shared']))

    fixture.module('/second.js', [], [])
    const removed = fixture.project(true)
    assert.deepEqual(removed.classSet, new Set(['first']))
    assert.ok(fixture.styles.has('/shared.css'), 'Unreachable captured CSS remains available but never contributes')

    fixture.graph.delete('/first.css')
    const missing = fixture.project(true)
    assert.deepEqual(missing.classSet, new Set())
    assert.equal(initial.appEntries.css, '.shared {}', 'Later projections must not mutate earlier snapshots')
})

test('ignores missing and uncaptured styles while retaining an empty captured stylesheet', () => {
    const fixture = createFixture(createMiniStyleEntries('/app.js', ['/missing-page.js']))
    fixture.style('/pending.css', undefined, ['pending'])
    fixture.style('/empty.css', '', [])
    fixture.style('/missing.css', '.missing {}', ['missing'])
    fixture.graph.delete('/missing.css')
    fixture.module('/uncaptured.css', [], [])
    fixture.module('/app.js', ['/pending.css', '/empty.css', '/missing.css', '/uncaptured.css'], [])

    const projection = fixture.project(true)
    assert.deepEqual([...projection.appEntries.styles.keys()], ['/empty.css'])
    assert.equal(projection.pageEntries[0]!.css, '')
    assert.equal(projection.pageEntries[0]!.styles.size, 0)
    assert.deepEqual(projection.classSet, new Set())
})

test('combines App and ordered Page roots once, including cyclic lazy styles and shared physical variants', () => {
    const entries = createMiniStyleEntries('/app.js', ['/first.js', '/second.js', '/missing.js'])
    const fixture = createFixture(entries)
    fixture.style('/app.css', '.app {}', ['app'])
    fixture.style('/shared.css?one', '.shared {}', ['shared'])
    fixture.style('/shared.css?two', '.shared {}', ['shared'])
    fixture.style('/lazy.css', '.lazy {}', ['lazy'])
    fixture.style('/first.css', '.first {}', ['first'])
    fixture.style('/second.css', '.second {}', ['second'])
    fixture.style('/unused.css', '.unused {}', ['unused'])
    fixture.module('/app.js', ['/app.css'], [])
    fixture.module('/shared.js', ['/app.css', '/shared.css?one'], ['/lazy.js'])
    fixture.module('/lazy.js', ['/shared.js', '/lazy.css'], [])
    fixture.module('/first.js', ['/shared.js', '/first.css'], [])
    fixture.module('/second.js', ['/second.css', '/shared.css?two', '/shared.js'], [])

    const initial = fixture.project(false)
    assert.equal(initial.appEntries.css, '.app {}\n.shared {}\n.lazy {}\n.first {}\n.second {}')
    assert.deepEqual(initial.classSet, new Set(['app', 'shared', 'lazy', 'first', 'second']))
    assert.deepEqual(
        initial.pageEntries,
        entries.pageEntries.map((entry) => ({
            ...entry,
            styles: new Map(),
            css: '',
            classSet: new Set()
        }))
    )

    fixture.module('/first.js', [], [])
    const retainedShared = fixture.project(false)
    assert.equal(retainedShared.appEntries.css, '.app {}\n.second {}\n.shared {}\n.lazy {}')
    assert.deepEqual(retainedShared.classSet, new Set(['app', 'second', 'shared', 'lazy']))

    fixture.module('/second.js', [], [])
    const removed = fixture.project(false)
    assert.equal(removed.appEntries.css, '.app {}')
    assert.deepEqual(removed.classSet, new Set(['app']))
    assert.equal(initial.appEntries.styles.size, 5, 'Later projections must not mutate the earlier snapshot')
})

test('preserves an empty App projection with no configured Pages', () => {
    const entries = createMiniStyleEntries('/app.js', [])
    const projection = createFixture(entries).project(true)

    assert.deepEqual(projection.appEntries, { ...entries.appEntries, styles: new Map(), css: '', classSet: new Set() })
    assert.deepEqual(projection.pageEntries, [])
    assert.deepEqual(projection.classSet, new Set())
})
