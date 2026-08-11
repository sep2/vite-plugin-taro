import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ProcessedStyle } from './create-style-capture.ts'
import { publishStyleHmr, refreshTailwindStyles } from './publish-style-hmr.ts'

test('publishes reachable styles once when finalized bytes are unchanged', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'vpt-publish-style-hmr-'))
    // The immutable plan combines a static style and a style behind a dynamic branch discovered by the graph planner.
    const processedStyles: ReadonlyMap<string, ProcessedStyle> = new Map([
        ['/base.css', { css: '.base {}', isTailwindRoot: false }],
        ['/lazy.css', { css: '.lazy {}', isTailwindRoot: false }]
    ])
    try {
        // Use the physical writer rather than a mock: the assertion covers directory creation, atomic replacement, graph
        // ordering, and the shared complete-build finalizer as one publication boundary.
        const publishedWxss = await publishStyleHmr({
            styleIds: ['/base.css', '/lazy.css'],
            outDir: outDir,
            processedStyles: processedStyles,
            publishedWxss: undefined
        })

        const globalWxssPath = path.join(outDir, 'assets/global.wxss')
        assert.equal(await readFile(globalWxssPath, 'utf8'), '.base {}\n.lazy {}')
        const firstInode = (await stat(globalWxssPath)).ino
        assert.equal(
            await publishStyleHmr({
                styleIds: ['/base.css', '/lazy.css'],
                outDir: outDir,
                processedStyles: processedStyles,
                publishedWxss: publishedWxss
            }),
            publishedWxss
        )
        assert.equal((await stat(globalWxssPath)).ino, firstInode)
    } finally {
        await rm(outDir, { recursive: true })
    }
})

test('refreshes only reachable Tailwind roots concurrently through stable sidecars', async () => {
    // This mutable cache models host-owned generations, including one orphan retained after topology removal.
    const processedStyles = new Map<string, ProcessedStyle>([
        ['/first.css', { css: '.old-first {}', isTailwindRoot: true }],
        ['/second.css', { css: '.old-second {}', isTailwindRoot: true }],
        ['/orphan.css', { css: '.orphan {}', isTailwindRoot: true }]
    ])
    // These transaction-local journals hold both transforms open until the test observes concurrent dispatch.
    const requests: string[] = []
    const completions = new Map<string, (result: { code: string; map: null }) => void>()
    const refreshing = refreshTailwindStyles(['/first.css', '/second.css'], processedStyles, (_rootId, requestId) => {
        requests.push(requestId)
        return new Promise((resolve) => {
            completions.set(requestId, resolve)
        })
    })

    assert.deepEqual(requests, ['/first.css?weapp-vite-sidecar=style', '/second.css?weapp-vite-sidecar=style'])
    requireCompletion(completions, requests[0])({ code: renderViteCss('.new-first {}'), map: null })
    requireCompletion(completions, requests[1])({ code: renderViteCss(''), map: null })

    await refreshing
    assert.equal(processedStyles.get('/first.css')?.css, '.new-first {}')
    assert.equal(processedStyles.get('/second.css')?.css, '')
    assert.equal(processedStyles.get('/orphan.css')?.css, '.orphan {}')
})

test('retains the prior Tailwind generation when one concurrent root fails', async () => {
    // This mutable cache is the publication frontier and must not expose only one successful sibling generation.
    const processedStyles = new Map<string, ProcessedStyle>([
        ['/first.css', { css: '.old-first {}', isTailwindRoot: true }],
        ['/second.css', { css: '.old-second {}', isTailwindRoot: true }]
    ])

    await assert.rejects(
        refreshTailwindStyles(['/first.css', '/second.css'], processedStyles, async (rootId) =>
            rootId === '/first.css' ? { code: renderViteCss('.new-first {}') } : null
        ),
        /Tailwind sidecar transform produced no result/
    )
    assert.equal(processedStyles.get('/first.css')?.css, '.old-first {}')
    assert.equal(processedStyles.get('/second.css')?.css, '.old-second {}')
})

function renderViteCss(css: string): string {
    return `const __vite__css = ${JSON.stringify(css)}\n`
}

function requireCompletion(
    completions: ReadonlyMap<string, (result: { code: string; map: null }) => void>,
    id: string | undefined
): (result: { code: string; map: null }) => void {
    const complete = id === undefined ? undefined : completions.get(id)
    if (!complete) {
        throw new Error(`Expected pending Tailwind transform: ${id}`)
    }
    return complete
}
