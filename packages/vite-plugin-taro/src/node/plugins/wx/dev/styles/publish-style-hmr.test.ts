import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ProcessedStyle } from './create-style-capture-plugin.ts'
import { publishStyleHmr } from './publish-style-hmr.ts'

test('publishes reachable styles in live graph order', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'vpt-publish-style-hmr-'))
    // The fixture combines a static style and a style behind a dynamic JavaScript branch. Both must be global in WX, where
    // loading a subpackage cannot append CSS through a browser DOM.
    const graph = new Map([
        ['/app', { importedIds: ['/base.css'], dynamicallyImportedIds: ['/lazy'] }],
        ['/lazy', { importedIds: ['/lazy.css'], dynamicallyImportedIds: [] }],
        ['/base.css', { importedIds: [], dynamicallyImportedIds: [] }],
        ['/lazy.css', { importedIds: [], dynamicallyImportedIds: [] }]
    ])
    const processedStyles: ReadonlyMap<string, ProcessedStyle> = new Map([
        ['/base.css', { css: '.base {}', isTailwindRoot: false }],
        ['/lazy.css', { css: '.lazy {}', isTailwindRoot: false }]
    ])
    const getModuleInfo = (moduleId: string) => graph.get(moduleId) ?? null

    try {
        // Use the physical writer rather than a mock: the assertion covers directory creation, atomic replacement, graph
        // ordering, and the shared complete-build finalizer as one publication boundary.
        await publishStyleHmr({
            applicationEntryIds: ['/app'],
            getModuleInfo: getModuleInfo,
            outDir: outDir,
            processedStyles: processedStyles
        })

        assert.equal(await readFile(path.join(outDir, 'assets/global.wxss'), 'utf8'), '.base {}\n.lazy {}')
    } finally {
        await rm(outDir, { recursive: true })
    }
})
