import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { scenarios } from '../src/workload.ts'
import { geometricMean, summarize } from './statistics.ts'

interface SavedSample {
    duration: number
    commitDuration: number
    layoutDuration: number
    block: number
    session: number
    iteration: number
    warmup: boolean
    verification: { count: number; selected: number | null; verified: boolean }
}
type SavedDistribution = ReturnType<typeof summarize> & {
    phases: Record<'commit' | 'layout', ReturnType<typeof summarize>>
}
interface SavedResult {
    schemaVersion: number
    methodology: {
        completion: {
            schedule: string
            api: string
            selector: string
            fields: { id: boolean; rect: boolean; size: boolean }
        }
    }
    metadata: { sourceHashes: Record<string, string>; devtoolsVersion: string; startedAt: string; finishedAt: string }
    cases: { id: string; dom: SavedSample[]; template: SavedSample[] }[]
    summary: {
        id: string
        dom: SavedDistribution
        template: SavedDistribution
        speedup: number
    }[]
    geometricMeanSpeedup: number
    interruptedContexts: {
        block: number
        session: number
        renderer: 'dom' | 'template'
        caseId: string
        reason: string
        samples: SavedSample[]
    }[]
    environments: {
        block: number
        session: number
        renderer: 'dom' | 'template'
        caseId: string
        environment: {
            renderer: string
            dataKeys: string[]
            info: { SDKVersion: string; model: string; windowWidth: number; windowHeight: number }
        }
    }[]
}

const root = fileURLToPath(new URL('..', import.meta.url))
const result: SavedResult = JSON.parse(await readFile(path.join(root, 'results/wechat-devtools.json'), 'utf8'))

test('published metadata contains benchmark provenance and toolchain versions', () => {
    assert.deepEqual(
        Object.keys(result.metadata).toSorted(),
        [
            'startedAt',
            'gitCommit',
            'gitStatus',
            'node',
            'devtoolsVersion',
            'packages',
            'runtimeVersion',
            'sourceHashes',
            'buildHashes',
            'collectorRevisions',
            'finishedAt'
        ].toSorted()
    )
})

test('saved benchmark retains a complete paired run with native verification', () => {
    assert.equal(result.schemaVersion, 3)
    assert.deepEqual(result.methodology.completion, {
        schedule: 'wx.nextTick',
        api: 'wx.createSelectorQuery().select(selector).fields(fields, callback).exec()',
        selector: '>>> #benchmark-state-{revision}',
        fields: { id: true, rect: true, size: true }
    })
    assert.equal(result.cases.length, scenarios.length)
    assert.equal(result.summary.length, scenarios.length)
    assert.ok(result.metadata.devtoolsVersion)
    assert.ok(Date.parse(result.metadata.finishedAt) > Date.parse(result.metadata.startedAt))
    for (const [index, scenario] of scenarios.entries()) {
        const item = result.cases[index]!
        assert.equal(item.id, scenario.id)
        for (const renderer of ['dom', 'template'] as const) {
            assert.ok(item[renderer].length >= 7)
            assert.ok(item[renderer].filter((sample) => sample.warmup).length >= 2)
            assert.ok(item[renderer].filter((sample) => !sample.warmup).length >= 5)
            for (const sample of item[renderer]) {
                assert.ok(Number.isFinite(sample.duration) && sample.duration > 0)
                for (const value of [sample.commitDuration, sample.layoutDuration]) {
                    assert.ok(Number.isFinite(value) && value >= 0)
                }
                assert.equal(sample.commitDuration + sample.layoutDuration, sample.duration)
                assert.equal(sample.verification.verified, true)
                assert.equal(sample.warmup, sample.iteration < 2)
                const expectedCount = scenario.id.startsWith('clear')
                    ? 0
                    : scenario.id === 'remove-1000'
                      ? 999
                      : scenario.id === 'append-1000'
                        ? 2000
                        : scenario.id === 'create-10000'
                          ? 10000
                          : 1000
                assert.equal(sample.verification.count, expectedCount)
                assert.equal(sample.verification.selected !== null, scenario.id === 'select-1000')
            }
            for (const block of renderer === 'dom' ? [0] : [1]) {
                const blockSamples = item[renderer].filter((sample) => sample.block === block)
                assert.ok(blockSamples.filter((sample) => !sample.warmup).length >= 5)
                for (const session of new Set(blockSamples.map((sample) => sample.session))) {
                    const sessionSamples = blockSamples.filter((sample) => sample.session === session)
                    assert.equal(
                        sessionSamples.filter((sample) => sample.warmup).length,
                        Math.min(2, sessionSamples.length)
                    )
                    assert.deepEqual(
                        sessionSamples.map((sample) => sample.iteration),
                        Array.from({ length: sessionSamples.length }, (_, index) => index)
                    )
                }
            }
        }
    }
})

test('saved summaries and homepage speedup are reproducible from raw samples', () => {
    for (const [index, item] of result.cases.entries()) {
        const summary = result.summary[index]!
        assert.equal(summary.id, item.id)
        for (const renderer of ['dom', 'template'] as const) {
            const retained = item[renderer].filter((sample) => !sample.warmup)
            const { phases, ...duration } = summary[renderer]
            assert.deepEqual(duration, summarize(retained.map((sample) => sample.duration)))
            assert.deepEqual(phases.commit, summarize(retained.map((sample) => sample.commitDuration)))
            assert.deepEqual(phases.layout, summarize(retained.map((sample) => sample.layoutDuration)))
        }
        assert.equal(summary.speedup, summary.template.median / summary.dom.median)
    }
    const recomputed = geometricMean(result.summary.map((item) => item.speedup))
    // Transcendental math can differ by a few ULPs across CPU architectures.
    assert.ok(Math.abs(result.geometricMeanSpeedup - recomputed) <= recomputed * Number.EPSILON * 16)
})

test('all sessions use the same SDK and viewport and activate distinct host implementations', () => {
    assert.ok(result.environments.length >= scenarios.length * 2)
    assert.equal(
        new Set(
            result.environments.map(
                ({ block, renderer, caseId, session }) => `${block}:${renderer}:${caseId}:${session}`
            )
        ).size,
        result.environments.length
    )
    assert.deepEqual(
        [
            ...new Set(
                result.environments.map(({ block, renderer, caseId }) => JSON.stringify({ block, renderer, caseId }))
            )
        ].map((value) => JSON.parse(value)),
        ['dom', 'template'].flatMap((renderer, block) => scenarios.map(({ id }) => ({ block, renderer, caseId: id })))
    )
    const baseline = result.environments[0]!.environment.info
    for (const session of result.environments) {
        assert.equal(session.environment.renderer, 'webview')
        assert.equal(session.environment.dataKeys.includes('page'), session.renderer === 'template')
        assert.equal(session.environment.info.SDKVersion, '3.15.2')
        for (const key of ['SDKVersion', 'model', 'windowWidth', 'windowHeight'] as const) {
            assert.equal(session.environment.info[key], baseline[key])
        }
    }
})

test('completed measurements from interrupted sessions remain in the aggregates', () => {
    for (const context of result.interruptedContexts) {
        assert.ok(context.reason)
        const item = result.cases.find((item) => item.id === context.caseId)!
        assert.deepEqual(
            item[context.renderer].filter(
                (sample) => sample.block === context.block && sample.session === context.session
            ),
            context.samples
        )
    }
})

test('measured application fingerprints match the checked-in workload', async () => {
    const sources = Object.entries(result.metadata.sourceHashes).filter(([name]) =>
        name.startsWith('demo/benchmark-demo/src/')
    )
    assert.ok(sources.length >= 5)
    for (const [name, expected] of sources) {
        const content = await readFile(path.resolve(root, '../..', name))
        assert.equal(createHash('sha256').update(content).digest('hex'), expected, name)
    }
})
