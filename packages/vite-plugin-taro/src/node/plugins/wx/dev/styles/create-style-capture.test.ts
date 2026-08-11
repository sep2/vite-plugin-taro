import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ModuleInfo } from 'rolldown'
import { globalWxssFileName } from '../hmr-files.ts'
import { createStyleCapture, type StyleCaptureAction } from './create-style-capture.ts'

test('captures final Vite CSS and the live graph through its merged plugin', async () => {
    // This mutable journal observes typed captures without letting plugin hooks mutate the style projection directly.
    const actions: StyleCaptureAction[] = []
    const styleCapture = createStyleCapture({
        applicationEntryIds: ['/project/app.js'],
        outDir: '/tmp/unreachable-style-capture-output',
        emit: (action) => actions.push(action),
        async transformTailwindRoot() {
            return assert.fail('Capture hooks must not transform Tailwind')
        }
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

    const css = '/*! weapp-tailwindcss vite-generated-css:app.css */\n.app {}'
    const code = `const __vite__css = ${JSON.stringify(css)}\nexport default __vite__css`
    await Reflect.apply(transform, {}, [code, '/project/app.css'])

    assert.deepEqual(actions[1], {
        kind: 'capture-style',
        id: '/project/app.css',
        style: { css: css, isTailwindRoot: true }
    })
})

test('binds complete output bytes and preserves the frontier when later output omits WXSS', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vpt-style-capture-'))
    const appId = '/project/app.js'
    const styleId = '/project/app.css'
    const globalWxssPath = path.join(root, globalWxssFileName)
    const styleCapture = createStyleCapture({
        applicationEntryIds: [appId],
        outDir: root,
        emit: () => assert.fail('Plugin hooks are not active in this state test'),
        async transformTailwindRoot() {
            return assert.fail('Ordinary CSS must not invoke a Tailwind sidecar transform')
        }
    })
    styleCapture.captureGraph((moduleId) => {
        if (moduleId === appId) {
            return createModuleInfo(appId, [styleId])
        }
        if (moduleId === styleId) {
            return createModuleInfo(styleId, [])
        }
        return null
    })

    try {
        styleCapture.captureStyle(styleId, { css: '.app { color: red; }\n', isTailwindRoot: false })
        await styleCapture.publishChanged([styleId])
        assert.equal(await readFile(globalWxssPath, 'utf8'), '.app { color: red; }\n')

        const unchangedInode = (await stat(globalWxssPath)).ino
        await styleCapture.publishChanged([styleId])
        assert.equal((await stat(globalWxssPath)).ino, unchangedInode)

        styleCapture.captureStyle(styleId, { css: '.app { color: blue; }\n', isTailwindRoot: false })
        await styleCapture.publishChanged([styleId])
        const blueWxss = '.app { color: blue; }\n'
        assert.equal(await readFile(globalWxssPath, 'utf8'), blueWxss)

        styleCapture.bindOutput([
            { type: 'asset', fileName: globalWxssFileName, source: new TextEncoder().encode(blueWxss) }
        ])
        // A later complete output can omit unchanged WXSS; binding that output must retain the existing byte frontier.
        styleCapture.bindOutput([{ type: 'chunk', fileName: 'app.js' }])
        const reboundInode = (await stat(globalWxssPath)).ino
        await styleCapture.publishChanged([styleId])
        assert.equal((await stat(globalWxssPath)).ino, reboundInode)
    } finally {
        await rm(root, { recursive: true })
    }
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

test('refreshes reachable Tailwind roots concurrently through stable sidecars', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vpt-style-capture-tailwind-'))
    const appId = '/project/app.js'
    const firstId = '/project/first.css'
    const secondId = '/project/second.css'
    // These transaction-local journals hold both transforms open until the test observes concurrent dispatch.
    const requests: string[] = []
    const completions = new Map<string, (result: { code: string }) => void>()
    const styleCapture = createStyleCapture({
        applicationEntryIds: [appId],
        outDir: root,
        emit: () => assert.fail('Plugin hooks are not active in this state test'),
        transformTailwindRoot(_rootId, requestId) {
            requests.push(requestId)
            return new Promise((resolve) => completions.set(requestId, resolve))
        }
    })
    styleCapture.captureGraph((moduleId) => {
        if (moduleId === appId) return createModuleInfo(appId, [firstId, secondId])
        if (moduleId === firstId || moduleId === secondId) return createModuleInfo(moduleId, [])
        return null
    })
    styleCapture.captureStyle(firstId, { css: '.old-first {}', isTailwindRoot: true })
    styleCapture.captureStyle(secondId, { css: '.old-second {}', isTailwindRoot: true })

    try {
        const refreshing = styleCapture.publishChanged([appId])
        assert.deepEqual(requests, [
            '/project/first.css?weapp-vite-sidecar=style',
            '/project/second.css?weapp-vite-sidecar=style'
        ])
        requireCompletion(completions, requests[0])({ code: renderViteCss('.new-first {}') })
        requireCompletion(completions, requests[1])({ code: renderViteCss('') })

        await refreshing
        assert.equal(await readFile(path.join(root, globalWxssFileName), 'utf8'), '.new-first {}\n')
    } finally {
        await rm(root, { recursive: true })
    }
})

test('retains the prior Tailwind generation when one concurrent root fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vpt-style-capture-failure-'))
    const appId = '/project/app.js'
    const firstId = '/project/first.css'
    const secondId = '/project/second.css'
    const styleCapture = createStyleCapture({
        applicationEntryIds: [appId],
        outDir: root,
        emit: () => assert.fail('Plugin hooks are not active in this state test'),
        async transformTailwindRoot(rootId) {
            return rootId === firstId ? { code: renderViteCss('.new-first {}') } : null
        }
    })
    styleCapture.captureGraph((moduleId) => {
        if (moduleId === appId) return createModuleInfo(appId, [firstId, secondId])
        if (moduleId === firstId || moduleId === secondId) return createModuleInfo(moduleId, [])
        return null
    })
    styleCapture.captureStyle(firstId, { css: '.old-first {}', isTailwindRoot: true })
    styleCapture.captureStyle(secondId, { css: '.old-second {}', isTailwindRoot: true })

    try {
        await assert.rejects(styleCapture.publishChanged([appId]), /Tailwind sidecar transform produced no result/)
        await styleCapture.publishChanged([firstId])
        assert.equal(await readFile(path.join(root, globalWxssFileName), 'utf8'), '.old-first {}\n.old-second {}')
    } finally {
        await rm(root, { recursive: true })
    }
})

function renderViteCss(css: string): string {
    return `const __vite__css = ${JSON.stringify(css)}\n`
}

function requireCompletion(
    completions: ReadonlyMap<string, (result: { code: string }) => void>,
    id: string | undefined
): (result: { code: string }) => void {
    const complete = id === undefined ? undefined : completions.get(id)
    if (!complete) {
        throw new Error(`Expected pending Tailwind transform: ${id}`)
    }
    return complete
}

test('rejects publication before a complete build captures the live graph', async () => {
    const styleCapture = createStyleCapture({
        applicationEntryIds: ['/project/app.js'],
        outDir: '/tmp/unreachable-style-capture-output',
        emit: () => assert.fail('Plugin hooks are not active in this state test'),
        async transformTailwindRoot() {
            return assert.fail('Publication must reject before transforming Tailwind')
        }
    })

    await assert.rejects(styleCapture.publishChanged(['/project/app.css']), /style graph is unavailable/)
})
