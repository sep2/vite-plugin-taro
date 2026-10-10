import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'rolldown'
import { normalizePath, resolveConfig } from 'vite'
import vpt from '../../index.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../node/utils/packages.ts'

const require = createRequire(import.meta.url)

test('template host preserves outlet branch markers through moves, replacements and independent App roots', async (t) => {
    // Own Taro's existing native-update timers for the duration of this synchronous host test.
    const timers = new Set<ReturnType<typeof setTimeout>>()
    t.after(() => {
        for (const timer of timers) {
            clearTimeout(timer)
        }
    })
    const config = await resolveConfig(
        {
            configFile: false,
            plugins: vpt({ target: 'wx', app: 'src/app.tsx', pages: [], appJson: {}, projectConfigJson: {} })
        },
        'build'
    )
    // A virtual source URL lets V8 attribute the bundled host to its original TypeScript without writing a fixture.
    const outputFile = fileURLToPath(new URL('./template-host-fixture.js', import.meta.url))
    const runtimeRoot = normalizePath(fileURLToPath(new URL('../', import.meta.url)))
    const result = await build({
        input: 'test:template-host',
        plugins: [
            {
                name: 'test:template-host',
                resolveId(id) {
                    if (id === 'test:template-host') {
                        return id
                    }
                    if (id === '@tarojs/runtime') {
                        return resolveTaroRuntime('runtime/mini')
                    }
                },
                load(id) {
                    if (id === 'test:template-host') {
                        return `import host from ${JSON.stringify(resolveVptRuntime('mini/taro/template-host'))}\n${fixture}`
                    }
                },
                transform(code, id) {
                    if (!normalizePath(id).startsWith(runtimeRoot)) {
                        // Dependencies and the virtual fixture are outside VPT's production-source coverage.
                        return { code, map: { version: 3, sources: [], names: [], mappings: '' } }
                    }
                }
            }
        ],
        transform: { define: { ...config.define, 'process.env.NODE_ENV': '"production"' } },
        output: {
            file: outputFile,
            format: 'cjs',
            postBanner: 'export default function(exports, require, globalThis, global, setTimeout, clearTimeout) {',
            postFooter: '}',
            sourcemap: 'inline'
        },
        write: false
    })
    const chunk = result.output[0]
    assert.ok(chunk?.type === 'chunk')
    const url = pathToFileURL(outputFile).href
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            return specifier === url ? { url, shortCircuit: true } : nextResolve(specifier, context)
        },
        load(id, context, nextLoad) {
            return id === url ? { format: 'module', source: chunk.code, shortCircuit: true } : nextLoad(id, context)
        }
    })
    try {
        const { default: execute }: { default: (...args: unknown[]) => void } = await import(url)
        execute(
            {},
            require,
            {},
            {},
            (callback: () => void, delay: number | undefined) => {
                const timer = setTimeout(() => {
                    timers.delete(timer)
                    callback()
                }, delay)
                timers.add(timer)
                return timer
            },
            (timer: ReturnType<typeof setTimeout>) => {
                timers.delete(timer)
                clearTimeout(timer)
            }
        )
    } finally {
        hooks.deregister()
    }
})

const fixture = `
import assert from 'node:assert/strict'
import { document, FormElement, TaroElement, TaroText } from 'vite-plugin-taro-runtime/runtime/mini'

const container = document.createElement('container')
const root = document.createElement('root')
const context = {}
assert.ok(host.createElement(root, context, 'view') instanceof TaroElement)
const input = host.createElement(root, context, 'input')
assert.ok(input instanceof FormElement)
assert.equal(host.isFormElement(input), true)
assert.equal(host.isFormElement(root), false)
const text = host.createText(root, context, 'prefix text')
assert.ok(text instanceof TaroText)
assert.equal(text.nodeValue, 'prefix text')

host.afterCommit(root)
const nonAppParent = document.createElement('view')
nonAppParent.appendChild(root)
host.afterCommit(root)
assert.equal(root.props.vo, undefined)
container.appendChild(root)
assert.throws(() => host.afterCommit(root), /App must render children exactly once/)

// Record only marker writes, retaining the actual Taro attribute implementation and scheduler.
const writes = []
function element(name, type) {
    const node = document.createElement(type)
    const setAttribute = node.setAttribute
    node.setAttribute = function(key, value) {
        if (key === 'vo') {
            writes.push([name, value])
        }
        setAttribute.call(this, key, value)
    }
    return node
}
const shell = element('shell', 'view')
const left = element('left', 'view')
const nested = element('nested', 'view')
const right = element('right', 'view')
const outlet = element('outlet', 'vpt_page_outlet')
root.appendChild(shell)
shell.appendChild(text)
shell.appendChild(left)
shell.appendChild(right)
left.appendChild(nested)
nested.appendChild(outlet)
host.afterCommit(root)
assert.deepEqual(writes, [['outlet', true], ['nested', true], ['left', true], ['shell', true]])
assert.equal(right.props.vo, undefined)
assert.equal(root.props.vo, undefined)
writes.length = 0
host.afterCommit(root)
assert.deepEqual(writes, [], 'unchanged ancestor identities produce no marker writes')

right.appendChild(outlet)
host.afterCommit(root)
assert.deepEqual(writes, [['outlet', false], ['nested', false], ['left', false], ['outlet', true], ['right', true]])
assert.equal(left.props.vo, false)
assert.equal(nested.props.vo, false)
assert.equal(right.props.vo, true)
assert.equal(outlet.props.vo, true)
writes.length = 0

right.removeChild(outlet)
const replacement = element('replacement', 'vpt_page_outlet')
right.appendChild(replacement)
host.afterCommit(root)
assert.deepEqual(writes, [['replacement', true]], 'detached cached outlets are replaced by a fresh tree search')
assert.equal(outlet.props.vo, true, 'detached nodes need no attribute update')
writes.length = 0

shell.removeChild(right)
const next = element('next', 'vpt_page_outlet')
left.appendChild(next)
host.afterCommit(root)
assert.deepEqual(writes, [['next', true], ['left', true]])
writes.length = 0

const otherRoot = document.createElement('root')
const otherOutlet = element('other', 'vpt_page_outlet')
container.appendChild(otherRoot)
otherRoot.appendChild(otherOutlet)
host.afterCommit(otherRoot)
assert.deepEqual(writes, [['other', true]])
writes.length = 0
host.afterCommit(root)
assert.deepEqual(writes, [], 'each App root retains its own projection state')

left.removeChild(next)
assert.throws(() => host.afterCommit(root), /App must render children exactly once/)

// Root namespaces are VPT policy; initial payload deduplication follows the root's actual prefix.
for (const prefix of ['app', 'page', 'custom']) {
    const initialRoot = document.createElement('root')
    if (prefix === 'app') {
        container.appendChild(initialRoot)
    } else if (prefix === 'custom') {
        Object.defineProperty(initialRoot, '_path', { value: prefix })
    }
    assert.equal(initialRoot._path, prefix)
    initialRoot.scheduleTask = callback => callback()
    initialRoot.enqueueUpdate({ path: prefix + '.cn.[0].cl', value: () => assert.fail('redundant dot-index payload') })
    initialRoot.enqueueUpdate({ path: prefix + '.cn[0].cl', value: () => assert.fail('redundant index payload') })
    initialRoot.enqueueUpdate({ path: prefix + '.cn[0]', value: { nn: 'view' } })
    initialRoot.performUpdate(true, data => {
        assert.deepEqual({ ...data }, { [prefix + '.cn[0]']: { nn: 'view' } })
    })
}

// Outlet topology stays in the logical tree, while its Page scheduler owns descendant updates.
const appPayloads = []
const pagePayloads = []
const pageRoot = document.createElement('root')
otherRoot.enqueueUpdate = payload => appPayloads.push(payload)
pageRoot.enqueueUpdate = payload => pagePayloads.push(payload)
otherOutlet.appendChild(pageRoot)
const pageView = document.createElement('view')
pageRoot.appendChild(pageView)
pageView.setAttribute('title', 'page-only')
assert.equal(pageRoot.parentNode, otherOutlet)
assert.equal(pageView._root, pageRoot)
assert.equal(appPayloads.length, 0)
assert.ok(pagePayloads.some(payload => payload.path.startsWith('page.cn.')))
const payload = { path: pageView._path + '.cl', value: () => 'latest' }
pageView.enqueueUpdate(payload)
assert.strictEqual(pagePayloads.at(-1), payload, 'forward the original lazy payload to the owning root')
otherOutlet.removeChild(pageRoot)
assert.equal(appPayloads.length, 0)
`
