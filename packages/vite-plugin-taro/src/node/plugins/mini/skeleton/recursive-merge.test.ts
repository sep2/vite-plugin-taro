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

test('clones source-only records and arrays before attaching them to the mutable target', () => {
    const source = {
        component: {
            events: ['tap']
        },
        definitions: [
            {
                attributes: {
                    value: ''
                }
            }
        ]
    }
    // The empty target is intentionally mutable because recursiveMerge populates it in place.
    const target: Record<string, unknown> = {}

    const result = recursiveMerge(target, source)

    assert.equal(result, target)
    assert.deepEqual(result, source)
    assert.notEqual(result.component, source.component)
    assert.notEqual(result.definitions, source.definitions)
})
