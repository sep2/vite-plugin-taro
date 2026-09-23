import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isRecord, type PortSwapHarness, waitFor } from './devtools-harness.ts'

const projectNames = ['a', 'b'] as const
const markerPattern = /export const hmrMarker = '[^']*'/

type ProjectName = (typeof projectNames)[number]
type HmrInfo = Readonly<{
    buildId: string
    endpoint: string
}>

/** Reproduces issue #29's reverse-order restart while both native project windows remain open. */
export async function runPortSwapCase(harness: PortSwapHarness): Promise<void> {
    const { a, b } = harness.projects
    const originalSources = {
        a: await readFile(a.markerPath, 'utf8'),
        b: await readFile(b.markerPath, 'utf8')
    }
    assert.match(originalSources.a, markerPattern)
    assert.match(originalSources.b, markerPattern)

    const infoPaths = {
        a: path.join(a.outDir, 'hmr/info.js'),
        b: path.join(b.outDir, 'hmr/info.js')
    }
    const appStylePaths = { a: path.join(a.outDir, 'app.wxss'), b: path.join(b.outDir, 'app.wxss') }
    const obsoletePaths = {
        a: path.join(a.outDir, 'obsolete-port-swap-output.txt'),
        b: path.join(b.outDir, 'obsolete-port-swap-output.txt')
    }
    const projectConfigPaths = {
        a: ['project.config.json', 'project.private.config.json'].map((fileName) => path.join(a.outDir, fileName)),
        b: ['project.config.json', 'project.private.config.json'].map((fileName) => path.join(b.outDir, fileName))
    }

    const publishMarker = async (project: ProjectName, marker: string): Promise<void> => {
        const target = harness.projects[project]
        await writeFile(
            target.markerPath,
            originalSources[project].replace(markerPattern, `export const hmrMarker = '${marker}'`)
        )
        await waitForMarker(target, marker)
        console.log(`[hmr-port-swap] ${project} rendered marker:${marker}`)
    }

    try {
        const initialInfo = { a: await waitForRuntimeStartup(a), b: await waitForRuntimeStartup(b) }
        const initialPorts = { a: endpointPort(initialInfo.a), b: endpointPort(initialInfo.b) }
        assert.equal(initialPorts.b, initialPorts.a + 1, 'Initial projects must occupy adjacent Vite ports')
        console.log(`[hmr-port-swap] initial ports: A=${initialPorts.a}, B=${initialPorts.b}`)

        for (const project of projectNames) {
            const target = harness.projects[project]
            await target.inputElement('#stress-input', `${project}-before-swap-state`)
            await publishMarker(project, `${project}-before-swap`)
            assert.equal(await target.readElement('#stress-input', 'value'), `${project}-before-swap-state`)
            await writeFile(obsoletePaths[project], 'obsolete output from the previous server')
        }

        console.log('[hmr-port-swap] restarting B before A without reopening or compiling either DevTools project')
        // These observations span both delayed replacement builds; final existence checks could miss deletion and recreation.
        let projectAConfigMissing = false
        let projectBConfigMissing = false
        const configMonitor = setInterval(() => {
            projectAConfigMissing ||= projectConfigPaths.a.some((fileName) => !existsSync(fileName))
            projectBConfigMissing ||= projectConfigPaths.b.some((fileName) => !existsSync(fileName))
        }, 1)
        try {
            await harness.restartInReverseOrder()
        } finally {
            clearInterval(configMonitor)
        }
        assert.equal(projectAConfigMissing, false, 'Project A config files must remain present during restart')
        assert.equal(projectBConfigMissing, false, 'Project B config files must remain present during restart')

        const restartedInfo = { a: await readHmrInfo(infoPaths.a), b: await readHmrInfo(infoPaths.b) }
        assert.notEqual(restartedInfo.a.buildId, initialInfo.a.buildId)
        assert.notEqual(restartedInfo.b.buildId, initialInfo.b.buildId)
        assert.equal(endpointPort(restartedInfo.b), initialPorts.a, "B must claim A's former port")
        assert.equal(endpointPort(restartedInfo.a), initialPorts.b, "A must move to B's former port")
        console.log(
            `[hmr-port-swap] exchanged ports: A=${endpointPort(restartedInfo.a)}, B=${endpointPort(restartedInfo.b)}`
        )

        for (const project of projectNames) {
            const target = harness.projects[project]
            const info = restartedInfo[project]
            await assert.rejects(stat(obsoletePaths[project]), { code: 'ENOENT' })
            await waitForRuntimeStartup(target)
            await waitFor(
                async () =>
                    (await target.readCurrentPage()).path === 'pages/index/index' &&
                    (await target.readElement('#stress-input', 'value')) === 'seed-000',
                20_000,
                100
            )
            await waitForMarker(target, `${project}-before-swap`)
            const appStyle = await readFile(appStylePaths[project], 'utf8')
            assert.ok(appStyle.includes(info.buildId))

            const retainedValue = `${project}-after-swap-state`
            await target.inputElement('#stress-input', retainedValue)
            await publishMarker(project, `${project}-after-swap`)
            assert.equal(await target.readElement('#stress-input', 'value'), retainedValue)
            assert.equal((await readHmrInfo(infoPaths[project])).buildId, info.buildId)
            assert.equal(
                await readFile(appStylePaths[project], 'utf8'),
                appStyle,
                'A full reload must not mask broken HMR'
            )
            assert.equal(await target.readConsoleErrors(), '')
        }
    } finally {
        await Promise.all(
            projectNames.map((project) => writeFile(harness.projects[project].markerPath, originalSources[project]))
        )
    }
}

async function waitForRuntimeStartup(project: PortSwapHarness['projects'][ProjectName]): Promise<HmrInfo> {
    const info = await readHmrInfo(path.join(project.outDir, 'hmr/info.js'))
    await waitFor(
        async () =>
            (await readFile(project.serverLogPath, 'utf8')).includes(`[hmr-stress] runtime ready ${info.buildId}`),
        20_000,
        100
    )
    return info
}

async function waitForMarker(project: PortSwapHarness['projects'][ProjectName], marker: string): Promise<void> {
    await waitFor(async () => (await project.readElement('#hmr-status', 'text')) === `marker:${marker}`, 8_000, 100)
}

async function readHmrInfo(infoPath: string): Promise<HmrInfo> {
    const source = await readFile(infoPath, 'utf8')
    const serialized = source.match(/Object\.freeze\((.*)\);/)?.[1]
    const value: unknown = serialized ? JSON.parse(serialized) : undefined
    if (!isRecord(value) || typeof value.buildId !== 'string' || typeof value.endpoint !== 'string') {
        throw new Error(`Invalid HMR info: ${source}`)
    }
    return { buildId: value.buildId, endpoint: value.endpoint }
}

function endpointPort(info: HmrInfo): number {
    const port = Number(new URL(info.endpoint).port)
    assert.ok(Number.isSafeInteger(port) && port > 0, `Invalid HMR endpoint: ${info.endpoint}`)
    return port
}
