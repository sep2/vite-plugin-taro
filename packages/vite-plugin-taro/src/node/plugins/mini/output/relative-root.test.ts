import assert from 'node:assert/strict'
import test from 'node:test'
import { toRootRelativePath } from './relative-root.ts'

test('creates importable output-root paths from root and nested pages', () => {
    assert.equal(toRootRelativePath('index.wxss', 'app.wxss'), './app.wxss')
    assert.equal(toRootRelativePath('pages/home/index.wxss', 'app.wxss'), '../../app.wxss')
})
