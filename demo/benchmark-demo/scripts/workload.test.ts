import assert from 'node:assert/strict'
import test from 'node:test'
import { actions, initialState, reduceWorkload, scenarios } from '../src/workload.ts'
import { geometricMean, summarize } from './statistics.ts'

test('keyed create, replace, append, and clear keep IDs monotonic and labels deterministic', () => {
    const first = reduceWorkload(initialState, 'run', undefined)
    assert.equal(first.rows.length, 1000)
    assert.equal(first.rows[0]?.id, 1)
    assert.deepEqual(first, reduceWorkload(initialState, 'run', undefined))
    const replaced = reduceWorkload(first, 'replace', undefined)
    assert.equal(replaced.rows[0]?.id, 1001)
    assert.notEqual(first.rows[0], replaced.rows[0])
    const appended = reduceWorkload(first, 'add', undefined)
    assert.equal(appended.rows.length, 2000)
    assert.strictEqual(appended.rows[0], first.rows[0])
    assert.equal(appended.rows[1999]?.id, 2000)
    const cleared = reduceWorkload(appended, 'clear', undefined)
    assert.equal(cleared.rows.length, 0)
    assert.equal(cleared.nextId, 2001)
    assert.equal(reduceWorkload(cleared, 'runlots', undefined).rows.length, 10000)
    assert.equal(initialState.rows.length, 0)
})

test('partial updates retain unchanged rows and only change every tenth label', () => {
    const before = reduceWorkload(initialState, 'run', undefined)
    const after = reduceWorkload(before, 'update', undefined)
    assert.equal(after.rows.filter((row) => row.label.endsWith(' !!!')).length, 100)
    after.rows.forEach((row, index) => {
        assert.equal(row.id, before.rows[index]?.id)
        if (index % 10 === 0) {
            assert.equal(row.label, `${before.rows[index]?.label} !!!`)
        } else {
            assert.strictEqual(row, before.rows[index])
        }
    })
})

test('select, swap, and remove target stable keys without mutating the original array', () => {
    const before = reduceWorkload(initialState, 'run', undefined)
    const selected = reduceWorkload(before, 'select', 42)
    assert.equal(selected.selected, 42)
    assert.strictEqual(selected.rows, before.rows)
    const swapped = reduceWorkload(selected, 'swaprows', undefined)
    assert.strictEqual(swapped.rows[1], before.rows[998])
    assert.strictEqual(swapped.rows[998], before.rows[1])
    assert.equal(before.rows[1]?.id, 2)
    assert.equal(swapped.selected, 42)
    const removed = reduceWorkload(swapped, 'remove', 42)
    assert.equal(removed.rows.length, 999)
    assert.equal(removed.selected, null)
    assert.ok(removed.rows.every((row) => row.id !== 42))
    assert.equal(reduceWorkload(before, 'remove', undefined).rows[1]?.id, 3)
    assert.equal(reduceWorkload(before, 'select', undefined).selected, 2)
})

test('empty lists support selection, removal, and swaps', () => {
    for (const action of ['select', 'remove', 'swaprows'] as const) {
        const state = reduceWorkload(initialState, action, undefined)
        assert.equal(state.rows.length, 0)
        assert.equal(state.selected, null)
        assert.equal(state.revision, 1)
    }
})

test('all benchmark scenarios have unique IDs and valid prepared transitions', () => {
    assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, 10)
    assert.deepEqual(new Set(scenarios.map((scenario) => scenario.action)), new Set(actions))
    for (const scenario of scenarios) {
        const prepared = scenario.setup.reduce(
            (state, action) => reduceWorkload(state, action, undefined),
            initialState
        )
        const result = reduceWorkload(prepared, scenario.action, undefined)
        assert.equal(result.revision, prepared.revision + 1)
        assert.equal(new Set(result.rows.map((row) => row.id)).size, result.rows.length)
    }
})

test('statistics retain outliers, use midpoint medians, nearest-rank p95, and geometric ratios', () => {
    assert.deepEqual(summarize([100, 3, 1, 2]), { count: 4, median: 2.5, p95: 100, min: 1, max: 100 })
    assert.equal(summarize([3, 1, 2]).median, 2)
    assert.equal(summarize([7]).p95, 7)
    assert.equal(summarize(Array.from({ length: 20 }, (_, index) => index + 1)).p95, 19)
    assert.equal(geometricMean([1, 4]), 2)
    assert.deepEqual(summarize([0]), { count: 1, median: 0, p95: 0, min: 0, max: 0 })
    assert.throws(() => geometricMean([0]))
    for (const invalid of [[], [-1], [NaN], [Infinity]]) {
        assert.throws(() => summarize(invalid))
        assert.throws(() => geometricMean(invalid))
    }
})
