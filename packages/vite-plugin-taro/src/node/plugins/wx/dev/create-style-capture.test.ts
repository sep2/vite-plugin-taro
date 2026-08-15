import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ModuleInfo } from 'rolldown'
import { createStyleCapture, type StyleCaptureAction } from './create-style-capture.ts'
import { globalWxssFileName } from './hmr-files.ts'

test('captures final Vite CSS and the live graph through its merged plugin', async () => {
    // This mutable journal observes typed plugin captures without mutating the projection from hook callbacks.
    const actions: StyleCaptureAction[] = []
    const styleCapture = createStyleCapture({
        applicationEntryIds: ['/project/app.js'],
        outDir: '/tmp/unreachable-style-capture-output',
        emit: (action) => actions.push(action)
    })
    const buildStart = styleCapture.plugin.buildStart
    const transform = styleCapture.plugin.transform
    if (typeof buildStart !== 'function' || typeof transform !== 'function') {
        throw new Error('Expected merged style capture hooks')
    }

    await Reflect.apply(buildStart, { getModuleInfo: () => null }, [])
    const graphAction = actions[0]
    assert.equal(graphAction?.kind, 'capture-graph')
    if (graphAction?.kind !== 'capture-graph') {
        throw new Error('Expected graph capture action')
    }
    assert.equal(graphAction.getModuleInfo('/missing'), null)

    const css = '.app {}'
    const code = `const __vite__css = ${JSON.stringify(css)}\nexport default __vite__css`
    await Reflect.apply(transform, {}, [code, '/project/app.css'])

    assert.deepEqual(actions[1], {
        kind: 'capture-style',
        id: '/project/app.css',
        style: { css: css }
    })
})

test('publishes the current graph projection without identical rewrites', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vpt-style-capture-'))
    const appId = '/project/app.js'
    const appStyleId = '/project/app.css'
    const moduleStyleId = '/project/card.module.css'
    // This mutable import list models Rolldown updating the live graph after a JavaScript-only import edit.
    let appImports = [appStyleId, moduleStyleId]
    const styleCapture = createStyleCapture({
        applicationEntryIds: [appId],
        outDir: root,
        emit: () => assert.fail('Plugin hooks are not active in this state test')
    })
    styleCapture.captureGraph((moduleId) => {
        if (moduleId === appId) return createModuleInfo(appId, appImports)
        if (moduleId === appStyleId || moduleId === moduleStyleId) return createModuleInfo(moduleId, [])
        return null
    })
    styleCapture.captureStyle(appStyleId, { css: '.app { color: red; }' })
    styleCapture.captureStyle(moduleStyleId, { css: '._card_hash { display: block; }' })

    try {
        await styleCapture.publish()
        const globalWxssPath = path.join(root, globalWxssFileName)
        const completeWxss = await readFile(globalWxssPath, 'utf8')
        assert.match(completeWxss, /\.app \{ color: red; \}/)
        assert.match(completeWxss, /\._card_hash \{ display: block; \}/)
        assert.ok(completeWxss.indexOf('.app') < completeWxss.indexOf('._card_hash'))

        const unchangedInode = (await stat(globalWxssPath)).ino
        await styleCapture.publish()
        assert.equal((await stat(globalWxssPath)).ino, unchangedInode)

        appImports = [appStyleId]
        await styleCapture.publish()
        assert.doesNotMatch(await readFile(globalWxssPath, 'utf8'), /_card_hash/)
    } finally {
        await rm(root, { recursive: true })
    }
})

test('rejects publication before a complete build captures the live graph', async () => {
    const styleCapture = createStyleCapture({
        applicationEntryIds: ['/project/app.js'],
        outDir: '/tmp/unreachable-style-capture-output',
        emit: () => assert.fail('Plugin hooks are not active in this state test')
    })

    await assert.rejects(styleCapture.publish(), /style graph is unavailable/)
})

function createModuleInfo(id: string, importedIds: readonly string[]): ModuleInfo {
    return {
        ast: null,
        code: '',
        id: id,
        importers: [],
        dynamicImporters: [],
        importedIds: [...importedIds],
        dynamicallyImportedIds: [],
        exports: [],
        isEntry: false,
        inputFormat: 'es',
        moduleSideEffects: true,
        meta: {}
    }
}
