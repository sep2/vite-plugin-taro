import assert from 'node:assert/strict'
import test from 'node:test'
import type { VptPageOption } from '../../options.ts'
import { orderPages } from './order-pages.ts'

test('preserves empty pages and declared order when no entry is selected', () => {
    assert.deepEqual(orderPages([]), [])
    const pages = [{ path: 'pages/b' }, { path: 'pages/a', entry: false }]
    assert.deepEqual(orderPages(pages), pages)
})

for (const entryIndex of [0, 1, 2]) {
    test(`places entry at index ${entryIndex} first without mutating page options`, () => {
        const pages = Object.freeze(
            ['pages/b', 'pages/a', 'pages/c'].map((path, index) =>
                Object.freeze({
                    path,
                    entry: index === entryIndex,
                    config: Object.freeze({ navigationBarTitleText: path }),
                    prerender: true
                })
            )
        )
        const entry = pages[entryIndex]
        assert.ok(entry)
        const ordered = orderPages(pages)
        assert.deepEqual(ordered, [entry, ...pages.filter((page) => page !== entry)])
        assert.strictEqual(ordered[0], entry)
        assert.deepEqual(
            pages.map((page) => page.path),
            ['pages/b', 'pages/a', 'pages/c']
        )
    })
}

test('rejects multiple entry pages with their route paths', () => {
    const pages: VptPageOption[] = [
        { path: 'pages/a', entry: true },
        { path: 'pages/b', entry: false },
        { path: 'pages/c', entry: true }
    ]
    assert.throws(() => orderPages(pages), {
        message: 'Only one page may set entry: true. Received: pages/a, pages/c'
    })
})
