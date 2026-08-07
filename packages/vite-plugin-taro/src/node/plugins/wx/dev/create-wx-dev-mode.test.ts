import assert from 'node:assert/strict'
import test from 'node:test'
import { createWxDevMode } from './create-wx-dev-mode.ts'

test('restores the common runtime when replacing Vite bundled dev defaults', () => {
    assert.deepEqual(
        createWxDevMode(
            {
                implement: '',
                lazy: true,
                skipCommonRuntimeInjection: true
            },
            'wx runtime'
        ),
        {
            implement: 'wx runtime',
            lazy: false,
            skipCommonRuntimeInjection: false
        }
    )
})
