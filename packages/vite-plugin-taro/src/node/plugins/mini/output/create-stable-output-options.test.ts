import assert from 'node:assert/strict'
import test from 'node:test'
import type { OutputOptions, PreRenderedChunk } from 'rolldown'
import { createStableOutputOptions } from './create-stable-output-options.ts'

test('normalizes live output without erasing names when a hash is the whole basename', () => {
    assert.deepEqual(createStableOutputOptions({}), {
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
        entryFileNames: '[name]'
    })
    for (const pattern of ['assets/[name]-[hash:8].js', 'assets/[name].[hash].js', 'assets/[hash].js']) {
        assert.equal(createStableOutputOptions({ chunkFileNames: pattern }).chunkFileNames, 'assets/[name].js')
    }
    assert.equal(createStableOutputOptions({ entryFileNames: '[hash:12]' }).entryFileNames, '[name]')
})

test('preserves native entry naming callbacks and does not mutate the configured output', () => {
    const configured: OutputOptions = {
        entryFileNames: (chunk) => (chunk.name.endsWith('.js') ? '[name]' : 'assets/[name]-[hash].js'),
        chunkFileNames: (chunk) => `chunks/${chunk.name}_[hash:8].js`,
        assetFileNames: 'static/[name]-[hash][extname]'
    }
    const normalized = createStableOutputOptions(configured)
    const chunk: PreRenderedChunk = {
        name: 'app.js',
        isEntry: true,
        isDynamicEntry: false,
        facadeModuleId: null,
        moduleIds: [],
        exports: []
    }
    assert.equal(typeof normalized.entryFileNames, 'function')
    assert.equal(typeof normalized.chunkFileNames, 'function')
    if (typeof normalized.entryFileNames !== 'function' || typeof normalized.chunkFileNames !== 'function') {
        assert.fail('Naming callbacks must remain callbacks')
    }
    assert.equal(normalized.entryFileNames(chunk), '[name]')
    assert.equal(normalized.entryFileNames({ ...chunk, name: 'bootstrap' }), 'assets/[name].js')
    assert.equal(normalized.chunkFileNames({ ...chunk, name: 'lazy' }), 'chunks/lazy.js')
    assert.equal(configured.assetFileNames, 'static/[name]-[hash][extname]')
    assert.equal(normalized.assetFileNames, 'static/[name][extname]')
})
