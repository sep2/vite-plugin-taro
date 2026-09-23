import assert from 'node:assert/strict'
import test from 'node:test'
import { DevToolsToolError, decodeDevToolsResponse, waitFor } from './devtools-harness.ts'

test('decodes a reload observation error even when the CLI exits with status 1', () => {
    assert.throws(
        () =>
            decodeDevToolsResponse('automation_element_action', {
                exitCode: 1,
                stdout: JSON.stringify({ ok: false, message: 'timeout waiting for automator response' }),
                stderr: '[wechatide] skill-call'
            }),
        (error: unknown) => error instanceof DevToolsToolError && error.retryableObservation
    )
    assert.throws(
        () =>
            decodeDevToolsResponse('automation_element_action', {
                exitCode: 1,
                stdout: JSON.stringify({ ok: false, message: 'User denied' }),
                stderr: ''
            }),
        (error: unknown) => error instanceof DevToolsToolError && !error.retryableObservation
    )
})

test('accepts successful CLI responses and preserves command failures', () => {
    assert.equal(
        decodeDevToolsResponse('automation_element_action', {
            exitCode: 0,
            stdout: JSON.stringify({ ok: true, result: 'marker:updated' }),
            stderr: ''
        }),
        'marker:updated'
    )
    assert.throws(
        () =>
            decodeDevToolsResponse('automation_element_action', {
                exitCode: 1,
                stdout: '',
                stderr: 'command failed before returning a tool response'
            }),
        /command failed before returning a tool response/
    )
})

test('observation polling spans a simulator reload without accepting a stale result', async () => {
    const observations = [
        false,
        new DevToolsToolError('automation_element_action', { message: 'no such element' }),
        new DevToolsToolError('automation_element_action', { message: 'page node not found' }),
        new DevToolsToolError('automation_element_action', { message: 'timeout waiting for automator response' }),
        true
    ]
    // The cursor advances through the recorded reload states; success requires reaching the final fresh observation.
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
})

test('observation polling preserves authorization and assertion failures', async () => {
    for (const error of [
        new DevToolsToolError('automation_element_action', { message: 'User denied' }),
        new Error('unexpected assertion failure')
    ]) {
        await assert.rejects(
            waitFor(
                () => {
                    throw error
                },
                1_000,
                1
            ),
            (actual: unknown) => actual === error
        )
    }
})

test('a detached runtime cannot turn a timeout into success', async () => {
    const error = new DevToolsToolError('automation_element_action', {
        message: 'timeout waiting for automator response'
    })
    await assert.rejects(
        waitFor(
            () => {
                throw error
            },
            20,
            1
        ),
        (actual: unknown) => actual === error || (actual instanceof Error && /Timed out/.test(actual.message))
    )
})
