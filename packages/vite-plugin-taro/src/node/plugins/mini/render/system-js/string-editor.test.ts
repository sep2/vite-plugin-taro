import assert from 'node:assert/strict'
import test from 'node:test'
import { StringEditor } from './string-editor.ts'

test('renders nested and boundary edits with MagicString-compatible ordering', () => {
    const editor = new StringEditor('abcdef')
    editor.prependLeft(1, 'first')
    editor.prependLeft(1, 'second')
    editor.appendLeft(1, 'left')
    editor.appendRight(1, 'right')
    editor.overwrite(2, 5, 'outer')
    editor.overwrite(3, 4, 'nested')

    assert.equal(editor.compile().render(0, 6), 'asecondfirstleftrightbouterf')
})

test('lets an outer same-start replacement dominate its nested range', () => {
    const editor = new StringEditor('abcdef')
    editor.overwrite(1, 3, 'nested')
    editor.overwrite(1, 4, 'outer')

    assert.equal(editor.compile().render(0, 6), 'aouteref')
})

test('filters replacements outside or crossing a requested source slice', () => {
    const editor = new StringEditor('abcdef')
    editor.overwrite(0, 1, 'before')
    editor.overwrite(1, 6, 'crossing-start')
    editor.overwrite(2, 6, 'crossing-end')
    editor.overwrite(2, 4, 'inside')
    editor.overwrite(5, 6, 'after')

    assert.equal(editor.compile().render(2, 5), 'insidee')
})

test('rejects partially overlapping source replacements', () => {
    const editor = new StringEditor('abcdef')
    editor.overwrite(1, 4, 'left')
    editor.overwrite(3, 5, 'right')

    assert.throws(() => editor.compile().render(0, 6), /Partially overlapping source edits at 3:5/)
})

test('omits a relocated range and both boundary insertions without mutating its view', () => {
    const editor = new StringEditor('abcdef')
    editor.prependLeft(1, 'start')
    editor.prependLeft(2, 'inside')
    editor.appendRight(4, 'end')
    editor.overwrite(2, 3, 'replacement')
    const plan = editor.compile()

    assert.equal(plan.render(1, 4), 'startbreplacementdend')
    assert.equal(plan.renderOutside([{ start: 1, end: 4 }]), 'aef')
    assert.equal(plan.render(1, 4), 'startbreplacementdend')
    assert.equal(plan.render(0, 6), 'astartbreplacementdendef')
})

test('preserves insertion ordering at starts, ends, gaps, replacements and empty ranges', () => {
    const editor = new StringEditor('abcdef')
    // Record boundaries out of source order so compilation must build its index rather than trust insertion order.
    editor.appendRight(6, 'end')
    editor.appendLeft(3, 'replaced')
    editor.prependLeft(0, 'start')
    editor.appendRight(4, 'after')
    editor.overwrite(2, 4, 'X')
    editor.prependLeft(2, 'also-replaced')
    const plan = editor.compile()

    assert.equal(plan.render(0, 6), 'startabXafterefend')
    assert.equal(plan.render(0, 0), 'start')
    assert.equal(plan.render(6, 6), 'end')
    assert.equal(plan.renderOutside([]), plan.render(0, 6))
    assert.equal(plan.renderOutside([{ start: 0, end: 6 }]), '')
    assert.equal(
        plan.renderOutside([
            { start: 0, end: 2 },
            { start: 4, end: 6 }
        ]),
        'X'
    )
    assert.equal(
        plan.renderOutside([
            { start: 0, end: 4 },
            { start: 4, end: 6 }
        ]),
        ''
    )
    assert.equal(new StringEditor('').compile().renderOutside([]), '')
})

test('compiled plans are immutable snapshots, even when the collection journal is extended', () => {
    const editor = new StringEditor('abcdef')
    editor.prependLeft(1, 'first')
    const first = editor.compile()
    editor.prependLeft(1, 'second')
    editor.appendRight(1, 'last')
    editor.overwrite(3, 4, 'X')
    const second = editor.compile()

    assert.equal(first.render(0, 6), 'afirstbcdef')
    assert.equal(second.render(0, 6), 'asecondfirstlastbcXef')
    assert.equal(first.render(0, 6), 'afirstbcdef')
})

test('renders many disjoint relocated views and dense edits from the same compiled plan', () => {
    for (const count of [16, 256, 4096]) {
        const editor = new StringEditor('abc;'.repeat(count))
        const ranges = Array.from({ length: count }, (_, index) => ({ start: index * 4, end: index * 4 + 3 }))
        for (const { start, end } of ranges) {
            editor.prependLeft(start, '[')
            editor.overwrite(start + 1, start + 2, 'X')
            editor.appendRight(end, ']')
        }
        const plan = editor.compile()
        assert.equal(plan.render(0, editor.original.length), '[aXc];'.repeat(count))
        assert.equal(ranges.map(({ start, end }) => plan.render(start, end)).join(''), '[aXc]'.repeat(count))
        assert.equal(plan.renderOutside(ranges), ';'.repeat(count))
    }
})

test('assembles many same-position prepends in reverse call order', () => {
    const editor = new StringEditor('x')
    const insertions = Array.from({ length: 4096 }, (_, index) => `${index},`)
    for (const insertion of insertions) {
        editor.prependLeft(0, insertion)
    }
    assert.equal(editor.compile().render(0, 1), `${insertions.toReversed().join('')}x`)
})
