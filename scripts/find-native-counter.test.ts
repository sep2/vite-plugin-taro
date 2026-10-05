import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findNativeCounter } from '../.agents/skills/test-published-packages/scripts/find-native-counter.ts'

const nativeCounter = { nn: 'native-counter', sid: '_BO', count: 0, cn: [] }

test('uses the generated native counter sid without a custom id probe', () => {
    assert.deepEqual(findNativeCounter(nativeCounter), { selector: '#_BO', count: 0 })
    assert.deepEqual(findNativeCounter({ ...nativeCounter, sid: '_other', count: 3 }), {
        selector: '#_other',
        count: 3
    })
    assert.equal(Object.hasOwn(nativeCounter, 'uid'), false)
})

test('matches the native template uid || sid selection', () => {
    assert.deepEqual(findNativeCounter({ ...nativeCounter, uid: 'authored-counter' }), {
        selector: '#authored-counter',
        count: 0
    })
    assert.deepEqual(findNativeCounter({ ...nativeCounter, uid: '' }), { selector: '#_BO', count: 0 })
})

test('finds the counter beneath unrelated native nodes', () => {
    const page = {
        nn: 'root',
        cn: [
            { nn: 'view', count: 7 },
            { nn: 'view', cn: [null, { nn: 'native-counter', sid: '_invalid', count: '0' }] },
            { nn: 'scroll-view', cn: [{ nn: 'view', cn: [nativeCounter] }] }
        ]
    }
    assert.deepEqual(findNativeCounter(page), { selector: '#_BO', count: 0 })
})

test('stops traversal at the first native counter', () => {
    const page = {
        cn: [
            nativeCounter,
            {
                get cn(): never {
                    throw new Error('Visited an unrelated subtree after finding the counter')
                }
            }
        ]
    }
    assert.deepEqual(findNativeCounter(page), { selector: '#_BO', count: 0 })
})

test('returns no counter for non-node values or incomplete counter data', () => {
    for (const value of [
        undefined,
        null,
        'native-counter',
        [],
        {},
        { nn: 'view', cn: [] },
        { nn: 'native-counter', count: 0 },
        { nn: 'native-counter', sid: '_BO' }
    ]) {
        assert.equal(findNativeCounter(value), undefined)
    }
})
