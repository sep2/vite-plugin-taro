import assert from 'node:assert/strict'
import test from 'node:test'
import { replaceExactlyOnce, toRootRelativePath } from './skeleton-utils.ts'

test('creates importable output-root paths from root and nested pages', () => {
    assert.equal(toRootRelativePath('index.style', 'app.style'), './app.style')
    assert.equal(toRootRelativePath('pages/home/index.style', 'app.style'), '../../app.style')
})

test('enforces exact pinned source fragments', () => {
    assert.equal(
        replaceExactlyOnce('before TOKEN after', 'TOKEN', 'replacement', 'fixture'),
        'before replacement after'
    )
    assert.throws(() => replaceExactlyOnce('before after', 'TOKEN', 'replacement', 'fixture'), /found 0/)
    assert.throws(
        () => replaceExactlyOnce('TOKEN before TOKEN after', 'TOKEN', 'replacement', 'fixture'),
        /found multiple/
    )
})
