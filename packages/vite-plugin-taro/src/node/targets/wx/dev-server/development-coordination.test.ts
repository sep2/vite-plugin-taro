import assert from 'node:assert/strict'
import test from 'node:test'
import { FullBuildScheduler } from './development-coordination.ts'

const waitForTimers = () => new Promise<void>((resolve) => setTimeout(resolve, 10))

test('coalesces scheduled and in-flight full-build requests', async () => {
    const firstBuild = Promise.withResolvers<void>()
    let builds = 0
    const scheduler = new FullBuildScheduler(
        0,
        async () => {
            builds++
            if (builds === 1) await firstBuild.promise
        },
        (error) => assert.fail(error)
    )

    scheduler.request()
    scheduler.request()
    await waitForTimers()
    assert.equal(builds, 1)

    scheduler.request()
    scheduler.request()
    firstBuild.resolve()
    await waitForTimers()
    assert.equal(builds, 2)
    await scheduler.close()
})

test('closing cancels a scheduled full build', async () => {
    let builds = 0
    const scheduler = new FullBuildScheduler(
        20,
        async () => {
            builds++
        },
        (error) => assert.fail(error)
    )

    scheduler.request()
    await scheduler.close()
    await waitForTimers()
    assert.equal(builds, 0)
})
