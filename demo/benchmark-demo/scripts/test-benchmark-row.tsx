import assert from 'node:assert/strict'
import { createElement } from 'react'
import { createRoot, flushSync } from 'vite-plugin-taro-runtime/react'
import { document, TaroElement, TaroEvent } from 'vite-plugin-taro-runtime/runtime/mini'
import BenchmarkRow from '../src/benchmark-row.tsx'

/** Exercise the production memoized row with the actual React/Taro reconciler and an in-memory host. */
export function testBenchmarkRow(): void {
    // These local records observe renders and action dispatch without mutating component props.
    const reads: number[] = []
    const actions: string[] = []
    const first = { id: 1, label: 'first' }
    const second = {
        id: 2,
        get label() {
            reads.push(2)
            return 'second'
        }
    }
    const onSelect = (id: number) => {
        actions.push(`select:${id}`)
    }
    const onRemove = (id: number) => {
        actions.push(`remove:${id}`)
    }
    const container = document.createElement('root')
    const root = createRoot(container)
    const render = (label: string, selected: boolean) =>
        flushSync(() =>
            root.render([
                createElement(BenchmarkRow, {
                    key: 1,
                    row: label === 'first' ? first : { ...first, label },
                    selected: false,
                    onSelect,
                    onRemove
                }),
                createElement(BenchmarkRow, { key: 2, row: second, selected, onSelect, onRemove })
            ])
        )
    try {
        render('first', false)
        const row = document.getElementById('row-2')
        assert.ok(row instanceof TaroElement)
        const label = row.childNodes[1]
        const remove = row.childNodes[2]
        assert.ok(label instanceof TaroElement && remove instanceof TaroElement)
        const selectHandler = label.getEventHandlers('tap')?.[0]
        const removeHandler = remove.getEventHandlers('tap')?.[0]
        assert.ok(selectHandler && removeHandler)
        assert.equal(reads.length, 1)
        reads.length = 0
        render('first !!!', false)
        assert.equal(reads.length, 0, 'unchanged rows bail out of React rendering')
        render('first !!!', true)
        assert.equal(reads.length, 1, 'selection changes render the selected row')
        assert.equal(row.className, 'benchmark-row selected')
        assert.strictEqual(label.getEventHandlers('tap')?.[0], selectHandler)
        assert.strictEqual(remove.getEventHandlers('tap')?.[0], removeHandler)
        label.dispatchEvent(new TaroEvent('tap', { bubbles: false, cancelable: false }))
        remove.dispatchEvent(new TaroEvent('tap', { bubbles: false, cancelable: false }))
        assert.deepEqual(actions, ['select:2', 'remove:2'])
    } finally {
        flushSync(() => root.unmount())
    }
}
