import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { scenarios } from '../src/workload.ts'
import { createBenchmarkChannel } from './create-benchmark-channel.ts'
import { geometricMean, summarize } from './statistics.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const repo = path.resolve(root, '../..')
const execute = promisify(execFile)
const order = ['dom', 'template'] as const
const warmups = 2
const repetitions = 5
// Stop requests unwind the active project's finally block before the runner exits.
const stopping = new AbortController()
process.once('SIGINT', () => stopping.abort(new Error('Benchmark interrupted')))
process.once('SIGTERM', () => stopping.abort(new Error('Benchmark interrupted')))
const devtoolsVersion = process.env.WECHAT_DEVTOOLS_VERSION
assert.ok(devtoolsVersion, 'Set WECHAT_DEVTOOLS_VERSION to the version shown in DevTools About.')
await mkdir(path.join(root, 'tmp'), { recursive: true })
const resume = process.env.BENCHMARK_RESUME
const scratch = resume ? path.resolve(root, resume) : await mkdtemp(path.join(root, 'tmp/run-'))
const saved: Checkpoint | undefined = resume
    ? JSON.parse(await readFile(path.join(scratch, 'checkpoint.json'), 'utf8'))
    : undefined
console.log(`Evidence: ${scratch}`)

async function command(file: string, args: string[]): Promise<string> {
    const { stdout } = await execute(file, args, {
        cwd: root,
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024,
        shell: process.platform === 'win32'
    })
    return stdout
}

async function ide(tool: string, args: string[]): Promise<unknown> {
    const output = await command('wechatide', ['-c', 'pi', tool, ...args])
    const response = JSON.parse(output.slice(output.indexOf('{')))
    assert.equal(response.ok, true, output)
    return response.result
}

async function evaluate(project: string, fn: string, args: unknown[]): Promise<unknown> {
    const response = await ide('automation_evaluate', [
        '--project',
        project,
        '--fn-source',
        `function() { return (${fn})(...${JSON.stringify(args)}); }`
    ])
    // wechatide wraps the automator's evaluate response once inside its business result.
    assert.ok(response && typeof response === 'object' && 'result' in response)
    const result = response.result
    assert.ok(result && typeof result === 'object' && 'result' in result)
    return result.result
}

async function sample(project: string, id: string): Promise<unknown> {
    const job = await channel.run(
        (url) =>
            evaluate(
                project,
                `function(id, url) {
            const report = data => wx.request({
                url, method: 'POST', header: { 'content-type': 'application/json' }, data
            });
            wx.request({
                url,
                method: 'GET',
                success(response) {
                    if (response.statusCode !== 200) {
                        report({ status: 'error', message: 'Benchmark launch was cancelled' });
                        return;
                    }
                    getApp().benchmark.sample(id, 0, 1).then(
                        value => report({ status: 'done', value }),
                        error => report({ status: 'error', message: String(error) })
                    );
                },
                fail(error) { report({ status: 'error', message: JSON.stringify(error) }); }
            });
            return true;
        }`,
                [id, url]
            ),
        stopping.signal,
        120000
    )
    assert.ok(job && typeof job === 'object' && 'status' in job)
    assert.equal(job.status, 'done', JSON.stringify(job))
    assert.ok('value' in job)
    return job.value
}

function milliseconds(value: unknown, positive: boolean): number {
    assert.ok(typeof value === 'number' && Number.isFinite(value) && (positive ? value > 0 : value >= 0))
    return value
}

function summarizeSamples(samples: readonly Sample[]) {
    const retained = samples.filter((sample) => !sample.warmup)
    return {
        ...summarize(retained.map((sample) => sample.duration)),
        phases: {
            commit: summarize(retained.map((sample) => sample.commitDuration)),
            layout: summarize(retained.map((sample) => sample.layoutDuration))
        }
    }
}

async function hashes(directory: string): Promise<Record<string, string>> {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true })
    const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name))
        .sort()
    return Object.fromEntries(
        await Promise.all(
            files.map(async (file) => [
                path.relative(repo, file).split(path.sep).join('/'),
                createHash('sha256')
                    .update(await readFile(file))
                    .digest('hex')
            ])
        )
    )
}

const status = await ide('check_wechatide_status', ['--skill-version', '0.3.10'])
assert.ok(
    status &&
        typeof status === 'object' &&
        'loginExpired' in status &&
        'tokenRequired' in status &&
        'versionRelation' in status
)
assert.equal(status.loginExpired, false)
assert.equal(status.tokenRequired, false, 'Configure CLI token access before running this harness.')
assert.ok(status.versionRelation === 'equal' || status.versionRelation === 'agent_ahead')
if (!saved) {
    for (const renderer of ['dom', 'template']) {
        await command('pnpm', ['exec', 'vite', 'build', '--mode', renderer])
    }
}

async function collectMetadata() {
    return {
        startedAt: new Date().toISOString(),
        gitCommit: (await command('git', ['rev-parse', 'HEAD'])).trim(),
        gitStatus: (await command('git', ['status', '--short'])).trim(),
        node: process.version,
        devtoolsVersion,
        packages: Object.fromEntries(
            await Promise.all(
                ['react', 'vite', 'vite-plugin-taro'].map(async (name) => {
                    const content = await command('node', [
                        '--input-type=module',
                        '-e',
                        `import {createRequire} from 'node:module';const r=createRequire(import.meta.url);console.log(r('${name}/package.json').version)`
                    ])
                    return [name, content.trim()]
                })
            )
        ),
        runtimeVersion: JSON.parse(await readFile(path.join(repo, 'packages/taro-runtime/package.json'), 'utf8'))
            .version,
        sourceHashes: {
            ...(await hashes(path.join(root, 'src'))),
            ...(await hashes(path.join(root, 'scripts'))),
            ...(await hashes(path.join(repo, 'packages/vite-plugin-taro/src/runtime')))
        },
        buildHashes: {
            ...(await hashes(path.join(root, 'dist/dom'))),
            ...(await hashes(path.join(root, 'dist/template')))
        }
    }
}
const collected = await collectMetadata()
if (saved) {
    assert.deepEqual(
        collected.buildHashes,
        saved.metadata.buildHashes,
        'Resume requires the identical measured builds.'
    )
    const application = (sources: Record<string, string>) =>
        Object.fromEntries(Object.entries(sources).filter(([name]) => name.includes('/src/')))
    assert.deepEqual(
        application(collected.sourceHashes),
        application(saved.metadata.sourceHashes),
        'Resume requires unchanged application and runtime sources.'
    )
    assert.equal(collected.devtoolsVersion, saved.metadata.devtoolsVersion)
    assert.deepEqual(collected.packages, saved.metadata.packages)
}
const metadata = {
    ...collected,
    startedAt: saved?.metadata.startedAt ?? collected.startedAt,
    collectorRevisions: [
        ...(saved?.metadata.collectorRevisions ?? []),
        {
            at: collected.startedAt,
            sha256: createHash('sha256')
                .update(await readFile(fileURLToPath(import.meta.url)))
                .digest('hex')
        }
    ]
}
interface Sample {
    readonly duration: number
    readonly commitDuration: number
    readonly layoutDuration: number
    readonly block: number
    readonly session: number
    readonly iteration: number
    readonly warmup: boolean
    readonly verification: unknown
}
interface Case {
    readonly id: string
    readonly label: string
    readonly dom: Sample[]
    readonly template: Sample[]
}
interface Environment {
    readonly session: number
    readonly block: number
    readonly renderer: 'dom' | 'template'
    readonly caseId: string
    readonly environment: unknown
}
interface InterruptedContext extends Environment {
    readonly reason: string
    readonly samples: Sample[]
}
interface Checkpoint {
    readonly metadata: Awaited<ReturnType<typeof collectMetadata>> & {
        readonly collectorRevisions: readonly { readonly at: string; readonly sha256: string }[]
    }
    readonly cases: Case[]
    readonly environments: Environment[]
    readonly interruptedContexts: InterruptedContext[]
}
// Local accumulators retain every completed measurement and its SDK context across resumable collection.
const cases: Case[] = saved?.cases ?? scenarios.map(({ id, label }) => ({ id, label, dom: [], template: [] }))
const environments: Environment[] = saved?.environments ?? []
const interruptedContexts: InterruptedContext[] = saved?.interruptedContexts ?? []
async function saveCheckpoint(): Promise<void> {
    await writeFile(
        path.join(scratch, 'checkpoint.json'),
        JSON.stringify({ metadata, cases, environments, interruptedContexts }, null, 4)
    )
}
const channel = await createBenchmarkChannel()
try {
    await saveCheckpoint()
    async function collectContext(
        block: number,
        renderer: 'dom' | 'template',
        scenario: (typeof scenarios)[number],
        session: number,
        count: number
    ): Promise<void> {
        const project = path.join(scratch, `block-${block}-${renderer}-${scenario.id}-session-${session}`)
        await cp(path.join(root, 'dist', renderer), project, { recursive: true })
        stopping.signal.throwIfAborted()
        try {
            await ide('open_project_window', ['--project', project])
            const environment = await evaluate(
                project,
                `function() {
        const page = getCurrentPages()[0];
        return { ready: !!getApp().benchmark, info: wx.getSystemInfoSync(), renderer: page.renderer, dataKeys: Object.keys(page.data) };
    }`,
                []
            )
            assert.ok(environment && typeof environment === 'object' && 'ready' in environment && environment.ready)
            assert.ok('dataKeys' in environment && Array.isArray(environment.dataKeys))
            assert.equal(
                environment.dataKeys.includes('page'),
                renderer === 'template',
                'Verify active host, including DOM fallback detection.'
            )
            assert.ok('renderer' in environment && environment.renderer === 'webview')
            environments.push({ block, renderer, caseId: scenario.id, session, environment })
            await saveCheckpoint()
            console.log(`block ${block} · ${renderer} · ${scenario.id}`)
            for (const iteration of Array.from({ length: warmups + count }, (_, i) => i)) {
                stopping.signal.throwIfAborted()
                const result = await sample(project, scenario.id)
                assert.ok(result && typeof result === 'object' && 'samples' in result && Array.isArray(result.samples))
                assert.ok('renderer' in result && result.renderer === renderer)
                assert.ok(
                    'verification' in result &&
                        result.verification &&
                        typeof result.verification === 'object' &&
                        'verified' in result.verification &&
                        result.verification.verified === true
                )
                assert.equal(result.samples.length, 1)
                const duration = milliseconds(result.samples[0], true)
                assert.ok(
                    'measurements' in result && Array.isArray(result.measurements) && result.measurements.length === 1
                )
                const measurement: unknown = result.measurements[0]
                assert.ok(
                    measurement &&
                        typeof measurement === 'object' &&
                        'duration' in measurement &&
                        'commitDuration' in measurement &&
                        'layoutDuration' in measurement
                )
                assert.equal(measurement.duration, duration)
                const commitDuration = milliseconds(measurement.commitDuration, false)
                const layoutDuration = milliseconds(measurement.layoutDuration, false)
                assert.equal(commitDuration + layoutDuration, duration)
                cases
                    .find((item) => item.id === scenario.id)!
                    [renderer].push({
                        duration,
                        commitDuration,
                        layoutDuration,
                        block,
                        session,
                        iteration,
                        warmup: iteration < warmups,
                        verification: result.verification
                    })
                await saveCheckpoint()
            }
            if (scenario.id === 'update-1000' || scenario.id === 'select-1000') {
                const text = await ide('automation_element_action', [
                    '--project',
                    project,
                    '--selector',
                    '.row-label',
                    '--action',
                    'text'
                ])
                assert.ok(typeof text === 'string')
                assert.equal(text.includes(' !!!'), scenario.id === 'update-1000')
                await writeFile(path.join(scratch, `text-${block}-${scenario.id}.json`), JSON.stringify(text, null, 4))
                await ide('simulator_screenshot', [
                    '--project',
                    project,
                    '--path',
                    path.join(scratch, `block-${block}-${renderer}-${scenario.id}.jpg`)
                ])
            }
        } catch (error) {
            const environment = environments.find(
                (item) =>
                    item.block === block &&
                    item.renderer === renderer &&
                    item.caseId === scenario.id &&
                    item.session === session
            )
            const samples = cases
                .find((item) => item.id === scenario.id)!
                [renderer].filter((sample) => sample.block === block && sample.session === session)
            if (environment) {
                interruptedContexts.push({
                    ...environment,
                    reason: error instanceof Error ? error.message : String(error),
                    samples
                })
                await saveCheckpoint()
            }
            throw error
        } finally {
            await ide('close_project_window', ['--project', project])
        }
    }

    for (const [block, renderer] of order.entries()) {
        for (const scenario of scenarios) {
            const samples = cases.find((item) => item.id === scenario.id)![renderer]
            const measured = () => samples.filter((sample) => sample.block === block && !sample.warmup).length
            while (measured() < repetitions) {
                const sessions = environments.filter(
                    (item) => item.block === block && item.renderer === renderer && item.caseId === scenario.id
                )
                const session = sessions.length
                await collectContext(block, renderer, scenario, session, repetitions - measured())
            }
        }
    }
    stopping.signal.throwIfAborted()
    const summary = cases.map((item) => {
        const dom = summarizeSamples(item.dom)
        const template = summarizeSamples(item.template)
        return { id: item.id, label: item.label, dom, template, speedup: template.median / dom.median }
    })
    const result = {
        schemaVersion: 3,
        metadata: { ...metadata, finishedAt: new Date().toISOString() },
        methodology: {
            reference: 'https://github.com/krausest/js-framework-benchmark',
            metric: 'Action handler start to native revision/layout query acknowledgment, milliseconds',
            boundary:
                'State update → React commit → wx.nextTick → identical native revision-marker geometry query callback',
            completion: {
                schedule: 'wx.nextTick',
                api: 'wx.createSelectorQuery().select(selector).fields(fields, callback).exec()',
                selector: '>>> #benchmark-state-{revision}',
                fields: { id: true, rect: true, size: true }
            },
            includes:
                'Data generation, React reconciliation, host mutations, SDK scheduling and native layout-query bridge overhead',
            phases: {
                commit: 'Handler start through React layout effect',
                layout: 'React layout effect through the common native revision/layout query callback'
            },
            scope: 'WeChat DevTools WebView + glass-easel; VPT DOM versus VPT template (the original Taro rendering architecture)',
            sampling: {
                order,
                warmupsPerCasePerBlock: warmups,
                minimumRepetitionsPerCasePerBlock: repetitions,
                isolation: 'Fresh DevTools project window per case per block',
                transport: 'Localhost HTTP start handshake and completion callback outside the measured interval',
                recovery:
                    'Resume verifies identical builds and application sources. Every new context gets two warmups. All completed measurements, including those from interrupted contexts, enter the aggregates. Context interruptions and their observations are recorded.'
            },
            aggregation:
                'Median and nearest-rank p95; geometric mean of template/DOM median ratios; no outlier removal',
            validation:
                'The timed common query verifies current revision ID and positive marker height. Every completed iteration also checks all native row IDs in order, row height, count, and selected class outside the timer.',
            limitations:
                'Results rank these two renderers for keyed workloads in the recorded WeChat DevTools WebView environment. The metric includes SDK query/scheduling latency; device presentation and CPU tracing are separate measurements.'
        },
        environments,
        interruptedContexts,
        cases,
        summary,
        geometricMeanSpeedup: geometricMean(summary.map((item) => item.speedup))
    }
    await writeFile(path.join(scratch, 'wechat-devtools.json'), `${JSON.stringify(result, null, 4)}\n`)
    await mkdir(path.join(root, 'results'), { recursive: true })
    await writeFile(path.join(root, 'results/wechat-devtools.json'), `${JSON.stringify(result, null, 4)}\n`)
    await command('pnpm', ['exec', 'biome', 'format', '--write', 'results/wechat-devtools.json'])
    console.log(JSON.stringify({ geometricMeanSpeedup: result.geometricMeanSpeedup, summary }, null, 4))
} finally {
    await channel.close()
}
