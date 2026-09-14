import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { isPromise } from 'node:util/types'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { packageRequire } from '../../node/utils/packages.ts'

for (const target of ['wx', 'zfb'] as const) {
    test(`${target}: upstream HTML hooks and enabled DOM APIs share injected globals`, async () => {
        const config = await resolveConfig(
            {
                configFile: false,
                plugins: vpt({
                    target,
                    app: 'src/app.tsx',
                    pages: [{ path: 'pages/home/index' }],
                    appJson: {},
                    projectConfigJson: {}
                })
            },
            'build'
        )
        const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), 'html-runtime-fixture.js')
        const platform = target === 'wx' ? 'weapp' : 'alipay'
        const targetRuntime = packageRequire.resolve(`vite-plugin-taro-runtime/plugin-platform-${platform}/runtime`)
        const result = await build({
            input: entry,
            plugins: [
                {
                    name: 'test:html-runtime',
                    resolveId(id) {
                        if (id === entry) {
                            return entry
                        }
                        if (id === '@tarojs/runtime') {
                            return packageRequire.resolve('vite-plugin-taro-runtime/runtime/mini')
                        }
                    },
                    load(id) {
                        if (id === entry) {
                            return `import ${JSON.stringify(targetRuntime)}\n${fixture}`
                        }
                    }
                }
            ],
            transform: {
                ...config.build.rolldownOptions.transform,
                define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify('production') }
            },
            output: { format: 'cjs' },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        // Isolate Taro's singleton document/hooks and mutation queues per target; never install fake DOM globals on Node.
        const context = {
            exports: {},
            global: {},
            setTimeout,
            clearTimeout,
            console
        }
        const completion: unknown = runInNewContext(chunk.code, context)
        assert.ok(isPromise(completion), 'The fixture must await its MutationObserver delivery')
        await completion
    })
}

test('injected globals resolve outside the plugin dependency tree', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vpt-inject-'))
    try {
        const entry = path.join(root, 'entry.js')
        await writeFile(entry, 'console.log(document, window, Element, SVGElement)')
        const config = await resolveConfig(
            {
                configFile: false,
                plugins: vpt({
                    target: 'wx',
                    app: 'src/app.tsx',
                    pages: [{ path: 'pages/home/index' }],
                    appJson: {},
                    projectConfigJson: {}
                })
            },
            'build'
        )
        const result = await build({
            input: entry,
            transform: {
                ...config.build.rolldownOptions.transform,
                define: { ...config.define, 'process.env.NODE_ENV': JSON.stringify('production') }
            },
            write: false
        })
        const chunk = result.output[0]
        assert.ok(chunk?.type === 'chunk')
        assert.deepEqual(chunk.imports, [])
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

const fixture = `
import 'vite-plugin-taro-runtime/plugin-html/runtime'
import { internalComponents, getComponentsAlias as createComponentsAlias } from '@tarojs/shared'
import { document as runtimeDocument, window as runtimeWindow, TaroElement, SVGElement as RuntimeSVGElement, hooks, getComponentsAlias } from 'vite-plugin-taro-runtime/runtime/mini'

function check(condition, message) {
    if (!condition) throw new Error(message)
}
function localBinding(document) {
    return document
}
check(localBinding('local') === 'local', 'injection must respect local bindings')
check(document === runtimeDocument && window === runtimeWindow, 'injected singleton identity')
check(window.document === document, 'window.document identity')
check(document.getElementById('app').id === 'app', 'App root remains indexed by id')
const expectedAliases = createComponentsAlias(internalComponents)
check(JSON.stringify(getComponentsAlias()) === JSON.stringify(expectedAliases), 'cached aliases must include target components')
check(Element === TaroElement, 'Element constructor binding')
check(SVGElement === RuntimeSVGElement, 'SVGElement constructor binding')
check(typeof requestAnimationFrame === 'function', 'animation frame binding')
check(typeof window.getComputedStyle === 'function', 'window computed style API')
check(typeof URL === 'undefined' && typeof URLSearchParams === 'undefined', 'URL APIs must be native or explicitly polyfilled')
const node = document.createElement('div')
check(node instanceof Element, 'created HTML node uses injected Element')
const inline = document.createElement('b')
node.appendChild(inline)
check(node.contains(inline), 'contains gate')
const clone = node.cloneNode(true)
check(clone !== node && clone.childNodes[0].nodeName === 'b', 'deep clone gate')
node.innerHTML = '<p>Hello</p>'
check(node.firstChild.h5tagName === 'p' && node.firstChild.textContent === 'Hello', 'innerHTML gate')
node.insertAdjacentHTML('beforeend', '<span>World</span>')
check(node.lastChild.h5tagName === 'span' && node.lastChild.textContent === 'World', 'adjacent HTML gate')
check(typeof node.getBoundingClientRect === 'function', 'size API gate')
const template = document.createElement('template')
template.innerHTML = '<b>Template</b>'
check(template.content.firstChild.h5tagName === 'b', 'template content gate')

const data = { nn: 'div', cn: [], cl: 'card' }
hooks.call('modifyHydrateData', data, node)
check(data.nn === 'pure-view' && data.cl === 'h5-div card', 'block mapping and class preservation')
const inlineData = { nn: 'b', cn: [] }
hooks.call('modifyHydrateData', inlineData, inline)
check(inlineData.nn === 'text', 'inline mapping')
const anchor = document.createElement('a')
anchor.setAttribute('href', '/pages/home/index')
const anchorData = { nn: 'a', href: '/pages/home/index', target: '_self', cn: [] }
hooks.call('modifyHydrateData', anchorData, anchor)
check(anchorData.nn === 'navigator' && anchorData.url === '/pages/home/index' && anchorData.openType === 'redirect', 'special attribute mapping')
const aliases = getComponentsAlias()
const payload = { path: '', value: 'changed' }
hooks.call('modifySetAttrPayload', node, 'cl', payload, aliases)
check(payload.value === 'h5-div changed', 'updated class retains tag identity')
const removal = { path: '', value: '' }
hooks.call('modifyRmAttrPayload', node, 'cl', removal, aliases)
check(removal.value.trim() === 'h5-div', 'removed class retains tag identity')
const handler = () => {}
anchor.addEventListener('click', handler)
check(anchor.__handlers.click === anchor.__handlers.tap, 'click maps to tap')
anchor.removeEventListener('click', handler)
check(anchor.__handlers.tap.length === 0, 'mapped listener removal')
const input = document.createElement('input')
input.addEventListener('change', handler)
check(input.__handlers.change === input.__handlers.input, 'change maps to input')

// Observe a real queued mutation, rather than merely asserting that a constructor survived tree shaking.
new Promise((resolve, reject) => {
    const observer = new MutationObserver((records) => {
        try {
            check(records.some(record => record.type === 'childList'), 'mutation observer gate')
            observer.disconnect()
            resolve()
        } catch (error) {
            reject(error)
        }
    })
    observer.observe(node, { childList: true })
    node.appendChild(document.createElement('i'))
})
`
