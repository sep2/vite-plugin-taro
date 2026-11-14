import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePages } from './resolve-pages.ts'

test('resolves configured pages asynchronously with their order and metadata intact', async () => {
    const pages = Object.freeze([
        Object.freeze({ path: 'pages/home/index', entry: true, config: { title: 'Home' } }),
        Object.freeze({ path: 'pages/detail/index', prerender: true })
    ])
    const result = resolvePages({ pages, target: 'wx', root: '/project' })
    assert.ok(result instanceof Promise)
    const resolved = await result
    assert.deepEqual(resolved, pages)
    assert.equal(resolved[0], pages[0])
    assert.equal(resolved[1], pages[1])
})

test('resolves an explicit empty page list', async () => {
    const pages = Object.freeze([])
    assert.deepEqual(await resolvePages({ pages, target: 'h5', root: '/project' }), [])
})

test('places the selected entry first without mutating the configured page order', async () => {
    const pages = Object.freeze([
        Object.freeze({ path: 'pages/profile/index', config: { title: 'Profile' } }),
        Object.freeze({ path: 'pages/home/index', entry: true, prerender: true })
    ])
    const original = structuredClone(pages)
    const resolved = await resolvePages({ pages, target: 'wx', root: '/project' })
    assert.deepEqual(resolved, [pages[1], pages[0]])
    assert.equal(resolved[0], pages[1])
    assert.deepEqual(pages, original)
})

test('rejects multiple selected entries during asynchronous page resolution', async () => {
    await assert.rejects(
        resolvePages({
            pages: [
                { path: 'pages/home/index', entry: true },
                { path: 'pages/profile/index', entry: true }
            ],
            target: 'h5',
            root: '/project'
        }),
        /Only one page may set entry: true.*pages\/home\/index, pages\/profile\/index/
    )
})
