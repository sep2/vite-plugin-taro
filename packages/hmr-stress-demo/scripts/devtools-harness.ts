import { type ChildProcessByStdio, spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { cp, type FileHandle, mkdir, open, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

export type DevToolsHarness = Readonly<{
    element: (selector: string, action: string, value: string | undefined) => Promise<string>
    markerPath: string
    navigate: (action: string, url: string | undefined) => Promise<void>
    outDir: string
    readConsoleErrors: () => Promise<string>
    readRuntime: (action: string) => Promise<unknown>
    root: string
    serverLogPath: string
}>

type ToolParameters = Readonly<Record<string, string>>
type TestCase = (harness: DevToolsHarness) => Promise<void>
type ServerProcess = ChildProcessByStdio<null, Readable, Readable>

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.dirname(scriptsRoot)
const repositoryRoot = path.resolve(fixtureRoot, '../..')
const commandTimeoutMilliseconds = 12_000
const testDeadline = Date.now() + (process.env.VPT_HMR_SETUP === '1' ? 60_000 : 30_000)
// Keep both this client name and the RAM-disk project path fixed. WeChat DevTools persists trust by identity/path; random temp
// directories or per-run clients would force a new authorization prompt and make standalone cases slower and interactive.
const devToolsClient = process.env.VPT_HMR_DEVTOOLS_CLIENT ?? 'Pi'

/** Runs cases against one fixed temporary project, cleaning it completely before every invocation. */
export async function withDevToolsHarness(testName: string, testCase: TestCase): Promise<void> {
    // One fixed lock prevents concurrent standalone cases from deleting or mutating the same disposable project.
    const lockPath = '/tmp/vite-plugin-taro-hmr-stress.lock'
    const lock = await acquireHarnessLock(lockPath)
    try {
        await runLockedHarness(resolveTestRoot(), testName, testCase)
    } finally {
        await lock.close()
        await unlink(lockPath)
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
            throw new Error(`HMR DevTools suite already owns the fixed RAM fixture in process ${ownerPid}`)
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

async function runLockedHarness(root: string, testName: string, testCase: TestCase): Promise<void> {
    let server: ServerProcess | undefined
    try {
        await buildPlugin()
        await prepareFixture(root)
        server = await startServer(root)
        const outDir = path.join(root, 'dist/wx')
        await validateProjectConfig(path.join(outDir, 'project.config.json'))
        await openProject(outDir)
        // Measured DevTools app-service reloads complete within five seconds after Vite publishes the new app.wxss build marker.
        await delay(5_000)

        console.log(`[hmr-devtools] running ${testName} in ${root}`)
        try {
            await testCase(createHarness(root, outDir))
        } catch (error) {
            console.error(
                `[hmr-devtools] Vite log before cleanup:\n${await readFile(path.join(root, 'vite.log'), 'utf8')}`
            )
            throw error
        }
        console.log(`[hmr-devtools] ${testName} passed`)
    } finally {
        // Stop Vite but keep the fixed output and DevTools window warm. The next run clears the complete fixture.
        if (server) {
            await stopServer(server)
        }
    }
}

async function openProject(outDir: string): Promise<void> {
    try {
        await runTool('automation_runtime_info', outDir, { action: 'currentPage' })
        return
    } catch (error) {
        if (process.env.VPT_HMR_SETUP !== '1') {
            throw new Error('Fixed DevTools runtime is not warm; run pnpm setup:hmr-stress-demo:devtools once', {
                cause: error
            })
        }
    }

    // Setup alone pays the cold-window cost. Every actual case reuses this fixed trusted runtime and remains below 30 seconds.
    try {
        await runToolWithTimeout('close_project_window', outDir, {}, 2_000)
    } catch {
        // No window is the expected first setup state.
    }
    await runTool('open_project_window', outDir, {})
    await delay(10_000)
    try {
        await runTool('automation_runtime_info', outDir, { action: 'currentPage' })
    } catch {
        // On a clean dist, DevTools can finish compiling just after the automator's first internal response deadline. One second
        // attachment attempt stays inside the setup-only 60-second budget; actual warm test cases still fail on their first call.
        await runTool('automation_runtime_info', outDir, { action: 'currentPage' })
    }
}

function createHarness(root: string, outDir: string): DevToolsHarness {
    return {
        element: async (selector, action, value) => {
            const parameters: Record<string, string> = { selector: selector, action: action }
            if (value !== undefined) {
                parameters.value = value
            }
            const result = await runTool('automation_element_action', outDir, parameters)
            if (typeof result !== 'string') {
                throw new Error(`Expected element result for ${selector}`)
            }
            return result
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
            const result = await runTool('get_app_console_content', outDir, {
                command: "grep -i -E 'error|fail|warn|exception'"
            })
            if (typeof result !== 'string') {
                throw new Error('Expected console text')
            }
            return result
        },
        readRuntime: (action) => runTool('automation_runtime_info', outDir, { action: action }),
        root: root,
        serverLogPath: path.join(root, 'vite.log')
    }
}

function resolveTestRoot(): string {
    // The fixed path preserves DevTools trust. Source-pressure profiles are intentionally bounded, so portability and a quick
    // one-command run are more valuable than provisioning a platform-specific RAM disk for a few dozen temporary writes.
    return '/tmp/vite-plugin-taro-hmr-stress-v1'
}

async function buildPlugin(): Promise<void> {
    if (process.env.VPT_HMR_BUILD_PLUGIN !== '1') {
        return
    }
    await runCommand('pnpm', ['build:plugin'], repositoryRoot, process.env, commandTimeoutMilliseconds)
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
        await symlink(path.join(fixtureRoot, 'node_modules'), nodeModules, 'dir')
    }
}

async function startServer(root: string): Promise<ServerProcess> {
    const viteExecutable = path.join(root, 'node_modules/.bin/vite')
    const appId = process.env.VITE_PLUGIN_TARO_WECHAT_APP_ID ?? (await readFixtureAppId()) ?? 'touristappid'
    const serverLogPath = path.join(root, 'vite.log')
    await writeFile(serverLogPath, '')
    const log = createWriteStream(serverLogPath)
    const server = spawn(viteExecutable, [], {
        cwd: root,
        env: { ...process.env, NODE_ENV: 'development', VITE_PLUGIN_TARO_WECHAT_APP_ID: appId },
        stdio: ['ignore', 'pipe', 'pipe']
    })
    server.stdout.pipe(log)
    server.stderr.pipe(log)
    try {
        await waitFor(async () => (await readFile(serverLogPath, 'utf8')).includes('WeChat DevTools'), 20_000, 100)
        return server
    } catch (error) {
        await stopServer(server)
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
        .find((candidate) => candidate.startsWith('VITE_PLUGIN_TARO_WECHAT_APP_ID='))
    return line?.slice(line.indexOf('=') + 1).trim()
}

async function validateProjectConfig(configPath: string): Promise<void> {
    const config: unknown = JSON.parse(await readFile(configPath, 'utf8'))
    if (!isRecord(config) || config.compileType !== 'miniprogram' || typeof config.appid !== 'string') {
        throw new Error(`Invalid generated Mini Program config: ${configPath}`)
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
        timeoutMilliseconds
    )
    const response = parseToolResponse(output)
    if (response.ok !== true) {
        throw new Error(`wechatide ${tool} failed: ${output}`)
    }
    return response.result
}

function parseToolResponse(output: string): Record<string, unknown> {
    const jsonStart = output.indexOf('{')
    if (jsonStart < 0) {
        throw new Error(`wechatide returned no JSON: ${output}`)
    }
    const response: unknown = JSON.parse(output.slice(jsonStart))
    if (!isRecord(response)) {
        throw new Error(`wechatide returned invalid JSON: ${output}`)
    }
    return response
}

async function runCommand(
    command: string,
    arguments_: readonly string[],
    cwd: string,
    environment: NodeJS.ProcessEnv,
    timeoutMilliseconds: number
): Promise<string> {
    const child = spawn(command, arguments_, { cwd: cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
    // These buffers are command-local mutable journals; each child owns them until its one exit result is assembled.
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
    })
    const timeout = setTimeout(() => child.kill('SIGKILL'), remainingTimeout(timeoutMilliseconds))
    const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', resolve)
    })
    clearTimeout(timeout)
    if (exitCode !== 0) {
        throw new Error(`${command} exited with ${exitCode}:\nstdout:\n${stdout}\nstderr:\n${stderr}`)
    }
    return stdout
}

async function stopServer(server: ServerProcess): Promise<void> {
    if (server.exitCode !== null || server.signalCode !== null) {
        return
    }
    server.kill('SIGTERM')
    await Promise.race([
        new Promise<void>((resolve) => server.once('exit', () => resolve())),
        delay(500).then(() => {
            server.kill('SIGKILL')
        })
    ])
}

export async function waitFor(
    predicate: () => boolean | Promise<boolean>,
    timeoutMilliseconds: number,
    intervalMilliseconds: number
): Promise<void> {
    const startedAt = Date.now()
    const effectiveTimeout = remainingTimeout(timeoutMilliseconds)
    while (!(await predicate())) {
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
