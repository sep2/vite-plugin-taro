import type { ChildProcessByStdio } from 'node:child_process'
import { createWriteStream, existsSync, realpathSync } from 'node:fs'
import { cp, type FileHandle, mkdir, open, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { createProcessScope } from './create-process-scope.ts'

export type DevToolsProjectHarness = Readonly<{
    inputElement: (selector: string, value: string) => Promise<void>
    markerPath: string
    navigate: (action: string, url: string | undefined) => Promise<void>
    outDir: string
    readConsoleErrors: () => Promise<string>
    readCurrentPage: () => Promise<Readonly<{ path: string }>>
    readElement: (selector: string, action: ElementReadAction) => Promise<string>
    readPageStack: () => Promise<readonly unknown[]>
    root: string
    serverLogPath: string
}>

export type DevToolsHarness = DevToolsProjectHarness &
    Readonly<{
        restartServer: () => Promise<void>
    }>

export type PortSwapHarness = Readonly<{
    projects: Readonly<Record<'a' | 'b', DevToolsProjectHarness>>
    restartInReverseOrder: () => Promise<void>
}>

type ElementReadAction = 'text' | 'value'
type ToolParameters = Readonly<Record<string, string>>
type TestCase = (harness: DevToolsHarness) => Promise<void>
type ServerProcess = ChildProcessByStdio<null, Readable, Readable>
type StartServer = (root: string) => Promise<ServerProcess>
type CommandResult = Readonly<{ exitCode: number | null; stdout: string; stderr: string }>

/** Only observation polling may retry the temporary detach/missing-node responses of a simulator reload. */
export class DevToolsToolError extends Error {
    readonly retryableObservation: boolean

    constructor(tool: string, response: Record<string, unknown>) {
        super(`wechatide ${tool} failed: ${JSON.stringify(response)}`)
        this.retryableObservation =
            response.message === 'timeout waiting for automator response' ||
            response.message === 'no such element' ||
            response.message === 'page node not found'
    }
}

const processes = createProcessScope()
// Each server registers its log completion so finalization also drains file handles.
const logCompletions: Promise<unknown>[] = []
// Cleanup owns only project windows this invocation attempted to open; unrelated DevTools windows remain untouched.
const openedProjectPaths = new Set<string>()

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.dirname(scriptsRoot)
const repositoryRoot = path.resolve(fixtureRoot, '../..')
const commandTimeoutMilliseconds = 12_000
const requestedCase = process.argv[2] ?? 'all'
// Restart includes a second process startup and native App reload; the aggregate suite includes that extra case.
const testBudgetMilliseconds =
    requestedCase === 'port-swap'
        ? 120_000
        : requestedCase === 'all'
          ? 120_000
          : process.env.VPT_HMR_SETUP === '1' || requestedCase === 'restart'
            ? 60_000
            : 30_000
const testDeadline = Date.now() + testBudgetMilliseconds
// Keep both this client name and the temporary project path fixed. WeChat DevTools persists trust by identity/path; random temp
// directories or per-run clients would force a new authorization prompt and make standalone cases slower and interactive.
const devToolsClient = process.env.VPT_HMR_DEVTOOLS_CLIENT ?? 'Pi'

/** Runs development-server cases against one fixed temporary project. */
export function withDevToolsHarness(testName: string, testCase: TestCase): Promise<void> {
    return withServerHarness(testName, testCase, (root) => startDevelopmentServer(root, undefined))
}

/** Runs production build-watch cases through the same project, process, and DevTools ownership boundary. */
export function withBuildWatchHarness(testName: string, testCase: TestCase): Promise<void> {
    return withServerHarness(testName, testCase, startBuildWatcher)
}

/** Runs two development projects whose Vite ports are deliberately exchanged while both DevTools windows stay open. */
export function withPortSwapHarness(testCase: (harness: PortSwapHarness) => Promise<void>): Promise<void> {
    return withHarnessLifecycle(true, () => runPortSwapHarness(testCase))
}

async function withServerHarness(testName: string, testCase: TestCase, startServer: StartServer): Promise<void> {
    return withHarnessLifecycle(testName !== 'setup', () =>
        runLockedHarness(resolveTestRoot(), testName, testCase, startServer)
    )
}

async function withHarnessLifecycle(closeProjects: boolean, run: () => Promise<void>): Promise<void> {
    // One fixed lock prevents standalone and two-project cases from mutating trusted fixtures concurrently.
    const lockPath = path.join(tmpdir(), 'vite-plugin-taro-hmr-stress.lock')
    const lock = await acquireHarnessLock(lockPath)
    // Memoize cleanup because a signal can arrive while normal finalization is already running.
    let cleanupPromise: Promise<void> | undefined
    const cleanup = (): Promise<void> => {
        cleanupPromise ??= (async () => {
            const errors: unknown[] = []
            if (closeProjects) {
                for (const project of [...openedProjectPaths].reverse()) {
                    try {
                        await closeProject(project)
                    } catch (error) {
                        errors.push(error)
                    }
                }
            }
            try {
                await processes.close()
            } catch (error) {
                errors.push(error)
            }
            errors.push(...(await Promise.all(logCompletions)).filter((error) => error !== undefined))
            try {
                await lock.close()
                await unlink(lockPath)
            } catch (error) {
                errors.push(error)
            }
            if (errors.length > 0) {
                throw new AggregateError(errors, 'Failed to clean up HMR DevTools harness')
            }
        })()
        return cleanupPromise
    }
    const interrupt = (): void => {
        void cleanup().then(
            () => process.exit(130),
            (error: unknown) => {
                console.error(error)
                process.exit(1)
            }
        )
    }
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    try {
        await run()
    } finally {
        try {
            await cleanup()
        } finally {
            process.removeListener('SIGINT', interrupt)
            process.removeListener('SIGTERM', interrupt)
        }
    }
}

async function acquireHarnessLock(lockPath: string): Promise<FileHandle> {
    try {
        const lock = await open(lockPath, 'wx')
        await lock.writeFile(String(process.pid))
        return lock
    } catch (error) {
        if (!hasErrorCode(error, 'EEXIST')) {
            throw error
        }
        const ownerPid = Number(await readFile(lockPath, 'utf8'))
        if (Number.isSafeInteger(ownerPid) && ownerPid > 0 && isProcessAlive(ownerPid)) {
            throw new Error(`HMR DevTools suite already owns the fixed temporary fixture in process ${ownerPid}`)
        }
        // A killed test cannot execute finally; reclaim only a lock whose recorded owner no longer exists.
        await unlink(lockPath)
        const lock = await open(lockPath, 'wx')
        await lock.writeFile(String(process.pid))
        return lock
    }
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        if (hasErrorCode(error, 'ESRCH')) {
            return false
        }
        throw error
    }
}

function hasErrorCode(error: unknown, code: string): boolean {
    return error instanceof Error && 'code' in error && error.code === code
}

async function runLockedHarness(
    root: string,
    testName: string,
    testCase: TestCase,
    startServer: StartServer
): Promise<void> {
    await buildPlugin()
    await prepareFixture(root)
    await writeFile(path.join(root, 'vite.log'), '')
    // Own the current process across restarts. Failed starts clean up their own child before rejecting.
    let server = await startServer(root)
    const restartServer = async () => {
        await stopServer(server)
        server = await startServer(root)
    }
    try {
        const outDir = path.join(root, 'dist/wx')
        await validateProjectConfig(path.join(outDir, 'project.config.json'))
        await openProject(outDir)

        console.log(`[hmr-devtools] running ${testName} in ${root}`)
        await testCase(createHarness(root, outDir, restartServer))
        console.log(`[hmr-devtools] ${testName} passed`)
    } catch (error) {
        // Report setup failures too, before a separate cleanup failure can obscure the original cause.
        console.error(`[hmr-devtools] ${testName} failed`, error)
        console.error(`[hmr-devtools] Vite log before cleanup:\n${await readFile(path.join(root, 'vite.log'), 'utf8')}`)
        throw error
    } finally {
        // Stop Vite before outer cleanup closes this project window and releases the fixture lock.
        await stopServer(server)
    }
}

async function runPortSwapHarness(testCase: (harness: PortSwapHarness) => Promise<void>): Promise<void> {
    await buildPlugin()
    const roots = resolvePortSwapRoots()
    await Promise.all([prepareFixture(roots.a), prepareFixture(roots.b)])
    await Promise.all([writeFile(path.join(roots.a, 'vite.log'), ''), writeFile(path.join(roots.b, 'vite.log'), '')])
    const basePort = await findAvailablePortPair(readPortSwapBase())
    // These handles advance to the replacement processes so finalization always stops the currently active pair.
    let serverA: ServerProcess | undefined
    let serverB: ServerProcess | undefined
    try {
        serverA = await startDevelopmentServer(roots.a, basePort)
        serverB = await startDevelopmentServer(roots.b, basePort)
        const outDirs = { a: path.join(roots.a, 'dist/wx'), b: path.join(roots.b, 'dist/wx') }
        await Promise.all(
            Object.values(outDirs).map((outDir) => validateProjectConfig(path.join(outDir, 'project.config.json')))
        )
        await openProject(outDirs.a)
        await openProject(outDirs.b)

        const restartInReverseOrder = async (): Promise<void> => {
            const firstPort = await readHmrPort(outDirs.a)
            await stopServers([serverA, serverB])
            // B claims A's former port first; A then follows Vite's normal non-strict increment to B's former port.
            serverB = await startDevelopmentServer(roots.b, firstPort)
            serverA = await startDevelopmentServer(roots.a, firstPort)
        }
        console.log(`[hmr-port-swap] running in ${path.dirname(roots.a)}`)
        await testCase({
            projects: {
                a: createProjectHarness(roots.a, outDirs.a),
                b: createProjectHarness(roots.b, outDirs.b)
            },
            restartInReverseOrder: restartInReverseOrder
        })
        console.log('[hmr-port-swap] passed')
    } catch (error) {
        console.error('[hmr-port-swap] failed', error)
        for (const root of [roots.a, roots.b]) {
            console.error(
                `[hmr-port-swap] ${path.basename(root)} Vite log:\n${await readFile(path.join(root, 'vite.log'), 'utf8')}`
            )
        }
        throw error
    } finally {
        await stopServers([serverA, serverB])
    }
}

async function stopServers(servers: readonly (ServerProcess | undefined)[]): Promise<void> {
    const results = await Promise.allSettled(
        servers.map((server) => (server === undefined ? Promise.resolve() : stopServer(server)))
    )
    const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
    if (errors.length > 0) {
        throw new AggregateError(errors, 'Failed to stop Vite port-swap servers')
    }
}

async function readHmrPort(outDir: string): Promise<number> {
    const source = await readFile(path.join(outDir, 'hmr/info.js'), 'utf8')
    const serialized = source.match(/Object\.freeze\((.*)\);/)?.[1]
    const value: unknown = serialized ? JSON.parse(serialized) : undefined
    if (!isRecord(value) || typeof value.endpoint !== 'string') {
        throw new Error(`Invalid HMR info: ${source}`)
    }
    const port = Number(new URL(value.endpoint).port)
    if (!Number.isSafeInteger(port) || port <= 0) {
        throw new Error(`Invalid HMR endpoint port: ${value.endpoint}`)
    }
    return port
}

function readPortSwapBase(): number {
    const port = Number(process.env.VPT_HMR_PORT_SWAP_BASE ?? 53_200)
    if (!Number.isSafeInteger(port) || port < 1_024 || port >= 65_535) {
        throw new Error('VPT_HMR_PORT_SWAP_BASE must leave two valid non-privileged ports')
    }
    return port
}

async function findAvailablePortPair(start: number): Promise<number> {
    for (let offset = 0; offset < 100; offset += 2) {
        const candidate = start + offset
        if (candidate >= 65_535) {
            break
        }
        const available = await Promise.all([canListen(candidate), canListen(candidate + 1)])
        if (available.every(Boolean)) {
            return candidate
        }
    }
    throw new Error(`No adjacent ports are available from ${start}`)
}

async function canListen(port: number): Promise<boolean> {
    const server = createServer()
    return new Promise<boolean>((resolve, reject) => {
        server.once('error', (error) => {
            if ('code' in error && error.code === 'EADDRINUSE') {
                resolve(false)
                return
            }
            reject(error)
        })
        server.listen(port, () => {
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve(true)
            })
        })
    })
}

async function openProject(outDir: string): Promise<void> {
    // Register before opening so cleanup can close a partially initialized window without touching unrelated projects.
    openedProjectPaths.add(outDir)
    // Rebuilding the fixture invalidates an earlier automator attachment, even when its window is still open.
    console.log(`[hmr-devtools] opening ${outDir}`)
    await runToolWithTimeout('open_project_window', outDir, {}, 30_000)
    console.log('[hmr-devtools] waiting for automator attachment')
    await waitFor(
        async () => {
            const result = await runTool('automation_runtime_info', outDir, { action: 'currentPage' })
            return isRecord(result) && isRecord(result.currentPage)
        },
        20_000,
        100
    )
}

function createHarness(root: string, outDir: string, restartServer: () => Promise<void>): DevToolsHarness {
    return { ...createProjectHarness(root, outDir), restartServer: restartServer }
}

function createProjectHarness(root: string, outDir: string): DevToolsProjectHarness {
    return {
        inputElement: async (selector, value) => {
            const result = await runTool('automation_element_action', outDir, {
                selector: selector,
                action: 'input',
                value: value
            })
            if (!isRecord(result) || result.success !== true) {
                throw new Error(`Expected successful input result for ${selector}`)
            }
        },
        markerPath: path.join(root, 'src/components/hmr-marker.ts'),
        navigate: async (action, url) => {
            const parameters: Record<string, string> = { action: action }
            if (url !== undefined) {
                parameters.url = url
            }
            await runTool('automation_navigate', outDir, parameters)
        },
        outDir: outDir,
        readConsoleErrors: async () => {
            const result = await runTool('get_simulator_console', outDir, {
                command: "grep -i -E 'error|fail|warn|exception'"
            })
            if (typeof result !== 'string') {
                throw new Error('Expected console text')
            }
            return result
                .split('\n')
                .filter((line) => {
                    if (line.length === 0) {
                        return false
                    }
                    const entry: unknown = JSON.parse(line)
                    return Array.isArray(entry) && (entry[0] === '[error]' || entry[0] === '[warn]')
                })
                .join('\n')
        },
        readCurrentPage: async () => {
            const result = await runTool('automation_runtime_info', outDir, { action: 'currentPage' })
            if (!isRecord(result) || !isRecord(result.currentPage) || typeof result.currentPage.path !== 'string') {
                throw new Error('Expected current DevTools page')
            }
            return { path: result.currentPage.path }
        },
        readElement: async (selector, action) => {
            const result = await runTool('automation_element_action', outDir, {
                selector: selector,
                action: action
            })
            if (typeof result !== 'string') {
                throw new Error(`Expected element result for ${selector}:${action}`)
            }
            return result
        },
        readPageStack: async () => {
            const result = await runTool('automation_runtime_info', outDir, { action: 'pageStack' })
            if (!isRecord(result) || !Array.isArray(result.pageStack)) {
                throw new Error('Expected DevTools page stack')
            }
            return result.pageStack
        },
        root: root,
        serverLogPath: path.join(root, 'vite.log')
    }
}

function resolveTestRoot(): string {
    // The fixed path preserves DevTools trust. Source-pressure profiles are intentionally bounded, so portability and a quick
    // one-command run are more valuable than provisioning a platform-specific RAM disk for a few dozen temporary writes.
    // Match Vite's canonical cwd, including macOS's /var -> /private/var alias, when addressing the native runtime.
    return path.join(realpathSync(tmpdir()), 'vite-plugin-taro-hmr-stress-v1')
}

function resolvePortSwapRoots(): Readonly<Record<'a' | 'b', string>> {
    const root = path.join(realpathSync(tmpdir()), 'vite-plugin-taro-hmr-port-swap-v1')
    return { a: path.join(root, 'a'), b: path.join(root, 'b') }
}

async function buildPlugin(): Promise<void> {
    if (process.env.VPT_HMR_BUILD_PLUGIN !== '1') {
        return
    }
    const result = await runCommand(
        'pnpm',
        ['build:plugin'],
        repositoryRoot,
        process.env,
        remainingTimeout(commandTimeoutMilliseconds)
    )
    assertSuccessfulCommand('pnpm', result)
}

async function prepareFixture(root: string): Promise<void> {
    await mkdir(root, { recursive: true })
    // Reset every writable source byte, but retain the fixed directory and last complete output so an already-authorized
    // DevTools window never loses its project identity between quick cases.
    await rm(path.join(root, 'src'), { recursive: true, force: true })
    await Promise.all([
        cp(path.join(fixtureRoot, 'src'), path.join(root, 'src'), { recursive: true }),
        cp(path.join(fixtureRoot, 'package.json'), path.join(root, 'package.json')),
        cp(path.join(fixtureRoot, 'tsconfig.json'), path.join(root, 'tsconfig.json')),
        cp(path.join(fixtureRoot, 'vite.config.ts'), path.join(root, 'vite.config.ts'))
    ])
    const nodeModules = path.join(root, 'node_modules')
    if (!existsSync(nodeModules)) {
        await symlink(
            path.join(fixtureRoot, 'node_modules'),
            nodeModules,
            process.platform === 'win32' ? 'junction' : 'dir'
        )
    }
}

async function startDevelopmentServer(root: string, port: number | undefined): Promise<ServerProcess> {
    const viteExecutable = path.join(root, 'node_modules/vite/bin/vite.js')
    const appId = process.env.VITE_VPT_WECHAT_APP_ID ?? (await readFixtureAppId()) ?? 'touristappid'
    const serverLogPath = path.join(root, 'vite.log')
    const logOffset = (await readFile(serverLogPath, 'utf8')).length
    const log = createWriteStream(serverLogPath, { flags: 'a' })
    const portArguments = port === undefined ? [] : ['--port', String(port)]
    const server = processes.start(process.execPath, [viteExecutable, ...portArguments], {
        cwd: root,
        env: {
            ...process.env,
            NODE_ENV: 'development',
            VITE_VPT_TARGET: 'wx',
            VITE_VPT_WECHAT_APP_ID: appId
        }
    })
    server.stdout.pipe(log, { end: false })
    server.stderr.pipe(log, { end: false })
    const logClosed = finished(log).catch((error: unknown) => error)
    logCompletions.push(logClosed)
    // Both output pipes share one destination; close it only after both pipes have closed.
    server.once('close', () => log.end())
    server.once('error', () => log.end())
    try {
        // Preserve both process logs without accepting the previous process's readiness banner.
        await waitFor(
            async () => (await readFile(serverLogPath, 'utf8')).slice(logOffset).includes('Mini Program project'),
            20_000,
            100
        )
        return server
    } catch (error) {
        await stopServer(server)
        await logClosed
        throw error
    }
}

async function startBuildWatcher(root: string): Promise<ServerProcess> {
    const viteExecutable = path.join(root, 'node_modules/vite/bin/vite.js')
    const appId = process.env.VITE_VPT_WECHAT_APP_ID ?? (await readFixtureAppId()) ?? 'touristappid'
    const serverLogPath = path.join(root, 'vite.log')
    const watchMarkerPath = path.join(root, 'dist/wx/hmr/watch.js')
    const previousMarker = await readExistingFile(watchMarkerPath)
    const log = createWriteStream(serverLogPath, { flags: 'a' })
    const server = processes.start(process.execPath, [viteExecutable, 'build', '--watch'], {
        cwd: root,
        env: {
            ...process.env,
            NODE_ENV: 'production',
            VITE_VPT_TARGET: 'wx',
            VITE_VPT_WECHAT_APP_ID: appId
        }
    })
    server.stdout.pipe(log, { end: false })
    server.stderr.pipe(log, { end: false })
    const logClosed = finished(log).catch((error: unknown) => error)
    logCompletions.push(logClosed)
    server.once('close', () => log.end())
    server.once('error', () => log.end())
    try {
        // The random completion marker is written after every complete watch output and cannot match the prior process.
        await waitFor(
            async () => {
                const marker = await readExistingFile(watchMarkerPath)
                return marker !== undefined && marker !== previousMarker
            },
            30_000,
            20
        )
        return server
    } catch (error) {
        await stopServer(server)
        await logClosed
        throw error
    }
}

async function readExistingFile(fileName: string): Promise<string | undefined> {
    try {
        return await readFile(fileName, 'utf8')
    } catch (error) {
        if (hasErrorCode(error, 'ENOENT')) {
            return undefined
        }
        throw error
    }
}

async function readFixtureAppId(): Promise<string | undefined> {
    const envPath = path.join(fixtureRoot, '.env.local')
    if (!existsSync(envPath)) {
        return undefined
    }
    const line = (await readFile(envPath, 'utf8'))
        .split(/\r?\n/)
        .find((candidate) => candidate.startsWith('VITE_VPT_WECHAT_APP_ID='))
    return line?.slice(line.indexOf('=') + 1).trim()
}

async function validateProjectConfig(configPath: string): Promise<void> {
    const config: unknown = JSON.parse(await readFile(configPath, 'utf8'))
    if (!isRecord(config) || config.compileType !== 'miniprogram' || typeof config.appid !== 'string') {
        throw new Error(`Invalid generated Mini Program config: ${configPath}`)
    }
}

async function closeProject(outDir: string): Promise<void> {
    // Cleanup gets its own budget, even when the test deadline has already elapsed.
    const output = await runCommand(
        'wechatide',
        ['-c', devToolsClient, 'close_project_window', '--project', outDir],
        repositoryRoot,
        process.env,
        commandTimeoutMilliseconds
    )
    const result = decodeDevToolsResponse('close_project_window', output)
    if (!isRecord(result) || result.success !== true || result.canceled === true) {
        throw new Error(`wechatide close_project_window failed: ${output.stdout}`)
    }
}

async function runTool(tool: string, project: string, parameters: ToolParameters): Promise<unknown> {
    return runToolWithTimeout(tool, project, parameters, commandTimeoutMilliseconds)
}

async function runToolWithTimeout(
    tool: string,
    project: string,
    parameters: ToolParameters,
    timeoutMilliseconds: number
): Promise<unknown> {
    const parameterArguments = Object.entries(parameters).flatMap(([name, value]) => [`--${name}`, value])
    const output = await runCommand(
        'wechatide',
        ['-c', devToolsClient, '-t', tool, '--project', project, ...parameterArguments],
        repositoryRoot,
        process.env,
        remainingTimeout(timeoutMilliseconds)
    )
    return decodeDevToolsResponse(tool, output)
}

/** The CLI exits with 1 for structured business errors too; decode them before classifying a shell failure. */
export function decodeDevToolsResponse(tool: string, command: CommandResult): unknown {
    const jsonStart = command.stdout.indexOf('{')
    if (jsonStart < 0) {
        assertSuccessfulCommand('wechatide', command)
        throw new Error(`wechatide returned no JSON: ${command.stdout}`)
    }
    const response: unknown = JSON.parse(command.stdout.slice(jsonStart))
    if (!isRecord(response)) {
        throw new Error(`wechatide returned invalid JSON: ${command.stdout}`)
    }
    if (response.ok !== true) {
        throw new DevToolsToolError(tool, response)
    }
    assertSuccessfulCommand('wechatide', command)
    return response.result
}

function assertSuccessfulCommand(command: string, result: CommandResult): void {
    if (result.exitCode !== 0) {
        throw new Error(
            `${command} exited with ${result.exitCode}:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
        )
    }
}

async function runCommand(
    command: string,
    arguments_: readonly string[],
    cwd: string,
    environment: NodeJS.ProcessEnv,
    timeoutMilliseconds: number
): Promise<CommandResult> {
    // pnpm and wechatide are command shims on Windows; Vite itself runs directly under Node.
    const executable = process.platform === 'win32' ? 'cmd.exe' : command
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', command, ...arguments_] : arguments_
    const child = processes.start(executable, args, { cwd: cwd, env: environment })
    // These buffers are command-local mutable journals; each child owns them until its one exit result is assembled.
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
    })
    // Assigned by the synchronous Promise executor; finalization owns cancellation.
    let timeout: ReturnType<typeof setTimeout> | undefined
    const completion = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', resolve)
        timeout = setTimeout(() => {
            reject(new Error(`${command} ${arguments_.join(' ')} timed out`))
        }, timeoutMilliseconds)
    })
    const exitCode = await (async () => {
        try {
            return await completion
        } finally {
            clearTimeout(timeout)
            await processes.stop(child)
        }
    })()
    return { exitCode: exitCode, stdout: stdout, stderr: stderr }
}

async function stopServer(server: ServerProcess): Promise<void> {
    await processes.stop(server)
    if (server.signalCode === 'SIGKILL') {
        throw new Error('Vite did not drain the WX host within two seconds')
    }
}

export async function waitFor(
    predicate: () => boolean | Promise<boolean>,
    timeoutMilliseconds: number,
    intervalMilliseconds: number
): Promise<void> {
    const startedAt = Date.now()
    const effectiveTimeout = remainingTimeout(timeoutMilliseconds)
    const observe = async (): Promise<boolean> => {
        try {
            return await predicate()
        } catch (error) {
            if (
                !(error instanceof DevToolsToolError) ||
                !error.retryableObservation ||
                Date.now() - startedAt > effectiveTimeout
            ) {
                throw error
            }
            return false
        }
    }
    while (!(await observe())) {
        if (Date.now() - startedAt > effectiveTimeout) {
            throw new Error(`Timed out after ${effectiveTimeout}ms`)
        }
        await delay(intervalMilliseconds)
    }
}

function remainingTimeout(requestedMilliseconds: number): number {
    return Math.max(1, Math.min(requestedMilliseconds, testDeadline - Date.now()))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}
