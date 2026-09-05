import assert from 'node:assert/strict'
import test from 'node:test'
import { recursiveMerge } from './recursive-merge.ts'

test('recursively merges objects and concatenates arrays into the retained target', () => {
    // This fixture is intentionally mutable because Taro retains the target and ignores the merge return value.
    const target = {
        component: {
            attributes: {
                existing: '',
                overridden: 'base'
            },
            events: ['tap']
        }
    }
    const retainedComponent = target.component

    const result = recursiveMerge(
        target,
        {
            component: {
                attributes: {
                    added: '',
                    overridden: 'platform'
                },
                events: ['change']
            }
        },
        undefined
    )

    assert.equal(result, target)
    assert.equal(result.component, retainedComponent)
    assert.deepEqual(result, {
        component: {
            attributes: {
                existing: '',
                added: '',
                overridden: 'platform'
            },
            events: ['tap', 'change']
        }
    })
})
