import assert from 'node:assert/strict'
import test from 'node:test'
import { transformSync } from '@babel/core'
import { wrapCapsulePlugin } from './capsule-wrapper.ts'

/** Applies the capsule rewrite to a test registration. */
function transformRegistration(code: string): string {
    const result = transformSync(code, {
        babelrc: false,
        configFile: false,
        filename: 'chunk.js',
        plugins: [wrapCapsulePlugin],
        sourceType: 'script'
    })

    assert.ok(result?.code)
    return result.code
}

test('rewrites one anonymous System registration as an inert CommonJS tuple', () => {
    const code = transformRegistration(`System.register(['./dependency.js'], function (_export, _context) {
        throw new Error('the declaration must remain inert')
    })`)
    const commonJsModule: { exports?: unknown } = {}

    Function('module', code)(commonJsModule)

    assert.ok(Array.isArray(commonJsModule.exports))
    assert.deepEqual(commonJsModule.exports[0], ['./dependency.js'])
    assert.equal(typeof commonJsModule.exports[1], 'function')
    assert.doesNotMatch(code, /System\.register/)
})

test('rejects executable statements beside the registration', () => {
    assert.throws(
        () =>
            transformRegistration(`const leaked = true
System.register([], function () {})`),
        /Expected one anonymous System\.register call/
    )
})

test('rejects an unsupported registration signature', () => {
    assert.throws(
        () => transformRegistration(`System.register('named', [], function () {})`),
        /Expected System\.register\(dependencies, declaration\)/
    )
})
