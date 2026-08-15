import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import type { Plugin } from 'vite'
import { wrapPluginTransform } from './vite.ts'

test('wraps a transform without changing its plugin context or result', async () => {
    const observedContext = Promise.withResolvers<object>()
    const plugin: Plugin = {
        name: 'test:wrapped-transform',
        transform(code, id) {
            if (id !== '\0virtual:entry') return
            observedContext.resolve(this)
            return { code: `${code}\nexport const wrapped = true`, map: null }
        }
    }
    wrapPluginTransform(plugin, (transform) => {
        return async function (code, id, options) {
            const result = await transform.call(this, code, id, options)
            if (id === '\0virtual:entry') {
                assert.equal(await observedContext.promise, this)
            }
            return result
        }
    })

    const sourcePlugin: Plugin = {
        name: 'test:virtual-source',
        resolveId(id) {
            if (id === 'virtual:entry') return '\0virtual:entry'
        },
        load(id) {
            if (id === '\0virtual:entry') return 'export const source = true'
        }
    }
    const output = await build({
        input: 'virtual:entry',
        plugins: [sourcePlugin, plugin],
        output: { format: 'es' },
        write: false
    })
    const [entry] = output.output

    assert.equal(entry.type, 'chunk')
    if (entry.type === 'chunk') {
        assert.match(entry.code, /wrapped = true/)
    }
})

test('preserves object transform metadata on the existing plugin', () => {
    const filter = { id: /\.css$/ }
    const transform: NonNullable<Plugin['transform']> = {
        order: 'pre',
        filter,
        handler() {
            return null
        }
    }
    const plugin: Plugin = { name: 'test:object-transform', transform }

    wrapPluginTransform(plugin, (execute) => execute)

    assert.equal(plugin.transform === transform, false)
    if (!plugin.transform || typeof plugin.transform === 'function') {
        assert.fail('Expected an object transform hook')
    }
    assert.equal(plugin.transform.order, 'pre')
    assert.equal(plugin.transform.filter, filter)
})
