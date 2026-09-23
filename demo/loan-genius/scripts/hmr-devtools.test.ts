import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeDevToolsResponse, LoanDevToolsToolError, waitFor } from './hmr-devtools.ts'

test('decodes transient reload observations without treating authorization failures as retryable', () => {
    assert.throws(
        () =>
            decodeDevToolsResponse(
                'automation_element_action',
                JSON.stringify({ ok: false, message: 'timeout waiting for automator response' })
            ),
        (error: unknown) => error instanceof LoanDevToolsToolError && error.retryableObservation
    )
    assert.throws(
        () =>
            decodeDevToolsResponse('automation_element_action', JSON.stringify({ ok: false, message: 'User denied' })),
        (error: unknown) => error instanceof LoanDevToolsToolError && !error.retryableObservation
    )
})

test('observation polling spans a simulator reload but preserves fatal failures', async () => {
    const observations = [
        false,
        new LoanDevToolsToolError('automation_element_action', { message: 'no such element' }),
        new LoanDevToolsToolError('automation_element_action', { message: 'page node not found' }),
        true
    ]
    // The cursor is the recorded native reload timeline; success requires reaching its final attached observation.
    let index = 0
    await waitFor(
        () => {
            const observation = observations[index++]
            if (observation instanceof Error) {
                throw observation
            }
            return observation === true
        },
        1_000,
        1
    )
    assert.equal(index, observations.length)

    const fatal = new LoanDevToolsToolError('automation_element_action', { message: 'User denied' })
    await assert.rejects(
        waitFor(
            () => {
                throw fatal
            },
            1_000,
            1
        ),
        (error: unknown) => error === fatal
    )
})
