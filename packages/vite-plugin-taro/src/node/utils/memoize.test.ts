import assert from 'node:assert/strict'
import { test } from 'node:test'
import { memoize } from './memoize.ts'

test('memoize reuses results by argument identity and exposes its cache', () => {
    const compute = memoize((value: number) => ({ value }))
    const first = compute(1)
    assert.equal(compute(1), first)
    assert.notEqual(compute(2), first)
    assert.equal(compute.cache.size, 2)
    assert.equal(compute.cache.get(1), first)
})

test('memoize uses custom keys and a supplied cache for equivalent arguments', () => {
    // This test-owned cache is populated by memoize, then cleared to verify recomputation.
    const cache = new Map<unknown, { value: number }>()
    const compute = memoize((input: { value: number }) => ({ value: input.value }), {
        cache,
        getCacheKey: (input) => input.value
    })
    const first = compute({ value: 1 })
    assert.equal(compute({ value: 1 }), first)
    assert.notEqual(compute({ value: 2 }), first)
    assert.equal(compute.cache, cache)
    assert.equal(cache.size, 2)
    cache.clear()
    assert.notEqual(compute({ value: 1 }), first)
})
