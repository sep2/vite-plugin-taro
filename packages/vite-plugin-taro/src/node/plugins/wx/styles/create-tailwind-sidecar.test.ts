import assert from 'node:assert/strict'
import test from 'node:test'
import { createTailwindSidecar } from './create-tailwind-sidecar.ts'

test('owns the tracked roots only during serve', () => {
    // This models the live registry owned and updated by the root tracker.
    const rootIds = new Set(['/project/src/app.css'])
    const getTailwindRoots = () => rootIds
    const plugin = createTailwindSidecar(getTailwindRoots)

    assert.equal(plugin.apply, 'serve')
    assert.equal(plugin.api?.getTailwindRoots, getTailwindRoots)
    assert.equal(plugin.api.getTailwindRoots(), rootIds)
})
