import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'rolldown'
import type { Plugin } from 'vite'
import { transformVitePlugin, wrapPluginTransform } from './vite.ts'

test('transforms every matching nested and promised plugin without mutating them', async () => {
    const first: Plugin = { name: 'first' }
    const second: Plugin = { name: 'second' }
    const untouched: Plugin = { name: 'untouched' }
    const [mappedFirst, mappedGroup, mappedUntouched] = transformVitePlugin(
        [first, [false, Promise.resolve(second)], untouched],
        (plugin) => {
            return plugin.name === 'untouched' ? plugin : { ...plugin, name: `mapped:${plugin.name}` }
        }
    )

    if (!mappedFirst || Array.isArray(mappedFirst) || mappedFirst instanceof Promise) {
        assert.fail('Expected a mapped concrete plugin')
    }
    assert.equal(mappedFirst.name, 'mapped:first')
    if (!Array.isArray(mappedGroup)) assert.fail('Expected a preserved nested plugin group')
    assert.equal(mappedGroup[0], false)

    const mappedSecond = await mappedGroup[1]
    if (!mappedSecond || Array.isArray(mappedSecond) || mappedSecond instanceof Promise) {
        assert.fail('Expected a mapped promised plugin')
    }
    assert.equal(mappedSecond.name, 'mapped:second')
    assert.equal(mappedUntouched, untouched)
    assert.equal(first.name, 'first')
    assert.equal(second.name, 'second')
})

test('wraps a transform without changing its context or result', async () => {
    const handlerCompleted = Promise.withResolvers<void>()
    const handlerContext = Promise.withResolvers<object>()
    const observation = Promise.withResolvers<Readonly<{ id: string; result: unknown }>>()
    const transform: NonNullable<Plugin['transform']> = function (code, id) {
        if (id !== '\0virtual:entry') return null
        handlerContext.resolve(this)
        handlerCompleted.resolve()
        return { code: `${code}\nexport const wrapped = true`, map: null }
    }
    const wrappedPlugin = wrapPluginTransform(
        {
            name: 'test:wrapped-transform',
            transform
        },
        (execute) => {
            return async function (code, id, meta) {
                const result = await execute.call(this, code, id, meta)
                if (result !== null && result !== undefined) {
                    await handlerCompleted.promise
                    assert.equal(await handlerContext.promise, this)
                    observation.resolve({ id, result })
                }
                return result
            }
        }
    )
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
        plugins: [sourcePlugin, wrappedPlugin],
        output: { format: 'es' },
        write: false
    })
    const observed = await observation.promise

    assert.equal(observed.id, '\0virtual:entry')
    assert.deepEqual(observed.result, {
        code: 'export const source = true\nexport const wrapped = true',
        map: null
    })
    const [entry] = output.output
    assert.equal(entry.type, 'chunk')
    if (entry.type !== 'chunk') assert.fail('Expected a generated chunk')
    assert.match(entry.code, /wrapped = true/)
})

test('preserves object transform metadata without mutating the input', () => {
    const filter = { id: /\.css$/ }
    const transform: NonNullable<Plugin['transform']> = {
        order: 'pre',
        filter,
        handler() {
            return null
        }
    }
    const plugin: Plugin = { name: 'test:object-transform', transform }
    const wrappedPlugin = wrapPluginTransform(plugin, (execute) => execute)
    const wrapped = wrappedPlugin.transform

    assert.notEqual(wrappedPlugin, plugin)
    assert.equal(plugin.transform, transform)
    if (!wrapped || typeof wrapped !== 'object') assert.fail('Expected an object transform hook')
    assert.equal(wrapped.order, 'pre')
    assert.equal(wrapped.filter, filter)
    assert.equal(transform.handler === wrapped.handler, false)
})
