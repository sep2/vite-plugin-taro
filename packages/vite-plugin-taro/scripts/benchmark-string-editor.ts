import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { StringEditor } from '../src/node/plugins/mini/render/system-js/string-editor.ts'

const fixtures = [1000, 2000, 4000, 8000].flatMap((count) => {
    const denseSource = 'a;'.repeat(count)
    const hoistedSource = 'abc;'.repeat(count)
    const ranges = Array.from({ length: count }, (_, index) => ({ start: index * 4, end: index * 4 + 3 }))
    return [
        {
            name: `dense edits (${count})`,
            expected: 'b();'.repeat(count),
            run() {
                // Every sample owns its collection journal and compiled plan, including their allocation/sorting costs.
                const editor = new StringEditor(denseSource)
                for (let index = 0; index < count; index++) {
                    editor.overwrite(index * 2, index * 2 + 1, 'b')
                    editor.appendRight(index * 2 + 1, '()')
                }
                return editor.compile().render(0, denseSource.length)
            }
        },
        {
            name: `hoisted ranges (${count})`,
            expected: ';'.repeat(count) + '[aXc]'.repeat(count),
            run() {
                const editor = new StringEditor(hoistedSource)
                for (const { start, end } of ranges) {
                    editor.prependLeft(start, '[')
                    editor.overwrite(start + 1, start + 2, 'X')
                    editor.appendRight(end, ']')
                }
                const plan = editor.compile()
                const functions = ranges.map(({ start, end }) => plan.render(start, end)).join('')
                return plan.renderOutside(ranges) + functions
            }
        }
    ]
})

console.log('StringEditor collection + compilation + rendering; excludes fixture generation and parsing')
console.table(
    fixtures.map(({ name, expected, run }) => {
        assert.equal(run(), expected)
        return { fixture: name, 'median ms': measure(run).toFixed(2) }
    })
)

function measure(run: () => string): number {
    // Warm before sampling; medians are diagnostic, never timing-dependent correctness assertions.
    for (let iteration = 0; iteration < 5; iteration++) {
        run()
    }
    const samples = Array.from({ length: 15 }, () => {
        const start = performance.now()
        run()
        return performance.now() - start
    })
    return samples.toSorted((left, right) => left - right)[7]
}
