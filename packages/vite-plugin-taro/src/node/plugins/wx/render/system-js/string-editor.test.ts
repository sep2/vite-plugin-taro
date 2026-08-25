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

    assert.equal(editor.render(0, 6), 'asecondfirstleftrightbouterf')
})

test('lets an outer same-start replacement dominate its nested range', () => {
    const editor = new StringEditor('abcdef')
    editor.overwrite(1, 3, 'nested')
    editor.overwrite(1, 4, 'outer')

    assert.equal(editor.render(0, 6), 'aouteref')
})

test('filters replacements outside a requested source slice', () => {
    const editor = new StringEditor('abcdef')
    editor.overwrite(0, 1, 'before')
    editor.overwrite(2, 4, 'inside')
    editor.overwrite(5, 6, 'after')

    assert.equal(editor.render(2, 5), 'insidee')
})

test('rejects partially overlapping source replacements', () => {
    const editor = new StringEditor('abcdef')
    editor.overwrite(1, 4, 'left')
    editor.overwrite(3, 5, 'right')

    assert.throws(() => editor.render(0, 6), /Partially overlapping source edits at 3:5/)
})

test('removes insertions owned by a removed range', () => {
    const editor = new StringEditor('abcdef')
    editor.prependLeft(2, 'removed')
    editor.appendRight(4, 'also-removed')
    editor.remove(1, 4)

    assert.equal(editor.render(0, 6), 'aef')
})
