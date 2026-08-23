#!/usr/bin/env node

import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

interface CommandResult {
    status: number | null
    stdout: string
    stderr: string
    error: Error | undefined
}

interface PackageIdentity {
    creatorVersion: string
    pluginVersion: string
    pluginTarball: string
}

interface ProjectPaths {
    root: string
    output: string
    source: string
    counterSource: string
    backup: string
    viteLog: string
}

const skillDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const repositoryRoot = resolve(skillDirectory, '../../..')
const temporaryRoot = '/tmp/vpt-published-packages-test'
const projectPaths: ProjectPaths = {
    root: temporaryRoot,
    output: resolve(temporaryRoot, 'dist/wx'),
    source: resolve(temporaryRoot, 'src/pages/home/index.tsx'),
    counterSource: resolve(temporaryRoot, 'src/components/counter/counter.tsx'),
    backup: resolve(temporaryRoot, '.hmr-test-index.tsx.backup'),
    viteLog: '/tmp/vpt-published-packages-test-vite.log'
}
const appIdSource = resolve(repositoryRoot, 'packages/loan-genius/.env.local')
const miniProgramSkill = resolve(repositoryRoot, '.agents/skills/miniprogram-dev-skill')
const originalText = 'Build naturally. Ship everywhere.'
const updatedText = 'Published HMR keeps React state.'
const probeId = 'published-hmr-probe'
const nativeCounterId = 'published-native-counter'
const pollIntervalMs = 3_000
const transitionDeadlineMs = 120_000
const commandTimeoutMs = 29_000

function stage(message: string): void {
    console.log(`\n[published-packages] ${message}`)
}

function execute(command: string, args: readonly string[], cwd: string, timeoutMs: number | undefined): CommandResult {
    const result = spawnSync(command, args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        timeout: timeoutMs
    })

    return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error
    }
}

function formatCommand(command: string, args: readonly string[]): string {
    return [command, ...args].join(' ')
}

function requireCommand(command: string, args: readonly string[], cwd: string, timeoutMs: number | undefined): string {
    const result = execute(command, args, cwd, timeoutMs)
    if (result.error !== undefined || result.status !== 0) {
        process.stdout.write(result.stdout)
        process.stderr.write(result.stderr)
        throw result.error ?? new Error(`Command failed: ${formatCommand(command, args)}`)
    }
    return result.stdout
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new Error(`${label} must be an object`)
    }
    return value
}

function requireString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${label} must be a non-empty string`)
    }
    return value
}

function parseJson(text: string, label: string): unknown {
    try {
        return JSON.parse(text)
    } catch (error) {
        throw new Error(`Invalid JSON from ${label}`, { cause: error })
    }
}

function parseWechatidePayload(stdout: string): Record<string, unknown> {
    const jsonStart = stdout.indexOf('{')
    if (jsonStart < 0) {
        throw new Error('wechatide returned no JSON payload')
    }
    return requireRecord(parseJson(stdout.slice(jsonStart), 'wechatide'), 'wechatide payload')
}

function callWechatide(tool: string, args: readonly string[], required: boolean): unknown {
    const commandArgs = ['-c', 'Pi', '-t', tool, ...args]
    const command = execute('wechatide', commandArgs, repositoryRoot, commandTimeoutMs)
    if (command.error !== undefined || command.status !== 0) {
        if (required) {
            process.stderr.write(command.stderr || command.stdout)
            throw command.error ?? new Error(`wechatide tool failed: ${tool}`)
        }
        return undefined
    }

    const payload = parseWechatidePayload(command.stdout)
    if (payload.ok !== true) {
        if (required) {
            throw new Error(`wechatide tool failed: ${tool}\n${JSON.stringify(payload)}`)
        }
        return undefined
    }
    return payload.result
}

async function pollUntil<T>(
    label: string,
    timeoutMs: number,
    intervalMs: number,
    observe: () => T | undefined,
    accept: (value: T) => boolean
): Promise<T> {
    const startedAt = Date.now()

    async function attempt(): Promise<T> {
        const value = observe()
        if (value !== undefined && accept(value)) {
            return value
        }
        if (Date.now() - startedAt >= timeoutMs) {
            throw new Error(`Timed out waiting for ${label} after ${timeoutMs / 1_000} seconds`)
        }
        await sleep(intervalMs)
        return attempt()
    }

    return attempt()
}

function readLatestPackageIdentity(): PackageIdentity {
    const creatorVersion = requireCommand(
        'npm',
        ['view', 'create-vite-taro@latest', 'version'],
        repositoryRoot,
        undefined
    ).trim()
    const pluginVersion = requireCommand(
        'npm',
        ['view', 'vite-plugin-taro@latest', 'version'],
        repositoryRoot,
        undefined
    ).trim()
    const pluginTarball = requireCommand(
        'npm',
        ['view', `vite-plugin-taro@${pluginVersion}`, 'dist.tarball'],
        repositoryRoot,
        undefined
    ).trim()

    if (!pluginTarball.startsWith('https://')) {
        throw new Error(`Published plugin tarball is not an HTTPS registry artifact: ${pluginTarball}`)
    }
    return { creatorVersion, pluginVersion, pluginTarball }
}

function createFreshProject(): void {
    rmSync(projectPaths.root, { recursive: true, force: true })
    requireCommand('npm', ['create', 'vite-taro@latest', 'vpt-published-packages-test'], '/tmp', undefined)
    const installOutput = requireCommand('npm', ['install'], projectPaths.root, undefined)
    process.stdout.write(installOutput)
}

function readJsonFile(path: string): Record<string, unknown> {
    return requireRecord(parseJson(readFileSync(path, 'utf8'), path), path)
}

function validateInstalledPlugin(identity: PackageIdentity): void {
    const lock = readJsonFile(resolve(projectPaths.root, 'package-lock.json'))
    const packages = requireRecord(lock.packages, 'package-lock packages')
    const plugin = requireRecord(packages['node_modules/vite-plugin-taro'], 'installed vite-plugin-taro')
    const installedVersion = requireString(plugin.version, 'installed vite-plugin-taro version')
    const resolved = requireString(plugin.resolved, 'installed vite-plugin-taro resolution')

    if (installedVersion !== identity.pluginVersion) {
        throw new Error(`Expected vite-plugin-taro ${identity.pluginVersion}, received ${installedVersion}`)
    }
    if (resolved !== identity.pluginTarball) {
        throw new Error(`Expected registry tarball ${identity.pluginTarball}, received ${resolved}`)
    }
}

function readAppId(): string {
    const env = readFileSync(appIdSource, 'utf8')
    const match = /^VITE_VPT_WECHAT_APP_ID=(.+)$/m.exec(env)
    if (match === null) {
        throw new Error(`VITE_VPT_WECHAT_APP_ID is missing from ${appIdSource}`)
    }
    const appId = match[1].trim()
    if (appId.length === 0 || appId === 'touristappid') {
        throw new Error('The fixed test AppID is invalid')
    }
    return appId
}

function installProbeId(source: string): string {
    const literalOccurrences = source.split(originalText).length - 1
    if (literalOccurrences !== 1) {
        throw new Error(`Expected one source occurrence of: ${originalText}`)
    }
    const literalIndex = source.indexOf(originalText)
    const openingTagIndex = source.lastIndexOf('<Text ', literalIndex)
    const openingTagEnd = source.indexOf('>', openingTagIndex)
    if (openingTagIndex < 0 || openingTagEnd < openingTagIndex) {
        throw new Error('Unable to locate the HMR probe Text element')
    }
    const openingTag = source.slice(openingTagIndex, openingTagEnd)
    if (openingTag.includes(' id=')) {
        throw new Error('The HMR probe Text element already has an id')
    }
    return `${source.slice(0, openingTagIndex)}<Text id="${probeId}"${source.slice(openingTagIndex + 5)}`
}

function configureDisposableProject(): void {
    writeFileSync(resolve(projectPaths.root, '.env.local'), `VITE_VPT_WECHAT_APP_ID=${readAppId()}\n`)

    const source = readFileSync(projectPaths.source, 'utf8')
    const counterOpening = '                    <Counter\n'
    if (source.split(counterOpening).length !== 2) {
        throw new Error('Expected one Counter element in the generated Home Page')
    }
    writeFileSync(
        projectPaths.source,
        installProbeId(
            source.replace(counterOpening, `${counterOpening}                        id="${nativeCounterId}"\n`)
        )
    )

    const counterSource = readFileSync(projectPaths.counterSource, 'utf8')
    const counterPropsOpening = 'export interface CounterProps {\n'
    if (counterSource.split(counterPropsOpening).length !== 2) {
        throw new Error('Expected one CounterProps interface in the generated counter')
    }
    writeFileSync(
        projectPaths.counterSource,
        counterSource.replace(counterPropsOpening, `${counterPropsOpening}    id: string\n`)
    )
}

function validateProjectConfig(): void {
    const config = readJsonFile(resolve(projectPaths.output, 'project.config.json'))
    const appId = requireString(config.appid, 'project.config.json appid')
    if (appId === 'touristappid' || config.compileType !== 'miniprogram') {
        throw new Error('Generated project.config.json is not a manageable Mini Program project')
    }
}

function validateStaticBuild(): void {
    requireCommand('npm', ['run', 'typecheck'], projectPaths.root, undefined)
    requireCommand('npm', ['run', 'build:wx'], projectPaths.root, undefined)
    validateProjectConfig()
}

function readSkillVersion(): string {
    const yaml = readFileSync(resolve(miniProgramSkill, 'skill.yaml'), 'utf8')
    const match = /^version:\s*(\S+)$/m.exec(yaml)
    if (match === null) {
        throw new Error('Unable to read miniprogram-dev-skill version')
    }
    return match[1]
}

function validateDevToolsStatus(): void {
    const result = requireRecord(
        callWechatide('check_devtools_status', ['--skill-version', readSkillVersion()], true),
        'DevTools status'
    )
    requireString(result.openid, 'DevTools status openid')
}

function startDevServer(): ChildProcess {
    rmSync(projectPaths.output, { recursive: true, force: true })
    rmSync(projectPaths.viteLog, { force: true })
    mkdirSync(resolve(projectPaths.output, '..'), { recursive: true })
    const logDescriptor = openSync(projectPaths.viteLog, 'w')
    const child = spawn('npm', ['run', 'dev:wx'], {
        cwd: projectPaths.root,
        detached: true,
        stdio: ['ignore', logDescriptor, logDescriptor]
    })
    closeSync(logDescriptor)
    return child
}

function devServerReady(child: ChildProcess): boolean {
    if (child.exitCode !== null) {
        throw new Error(`Published dev server exited with code ${child.exitCode}`)
    }
    return existsSync(projectPaths.viteLog) && readFileSync(projectPaths.viteLog, 'utf8').includes('WeChat DevTools')
}

function hasCode(value: unknown, code: string): boolean {
    return isRecord(value) && value.code === code
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
    try {
        process.kill(-pid, signal)
    } catch (error) {
        if (!hasCode(error, 'ESRCH')) {
            throw error
        }
    }
}

function processGroupExists(pid: number): boolean {
    try {
        process.kill(-pid, 0)
        return true
    } catch (error) {
        if (hasCode(error, 'ESRCH')) {
            return false
        }
        throw error
    }
}

async function stopDevServer(child: ChildProcess): Promise<void> {
    if (child.pid === undefined) {
        return
    }
    signalProcessGroup(child.pid, 'SIGTERM')
    await sleep(1_000)
    if (processGroupExists(child.pid)) {
        signalProcessGroup(child.pid, 'SIGKILL')
    }
}

function validateDevelopmentOutput(): void {
    const requiredFiles = ['app.json', 'app.js', 'pages/home/index.js', 'project.config.json']
    const missingFiles = requiredFiles.filter((file) => {
        const path = resolve(projectPaths.output, file)
        return !existsSync(path) || readFileSync(path).byteLength === 0
    })
    if (missingFiles.length > 0) {
        throw new Error(`Fresh WX development output is incomplete: ${missingFiles.join(', ')}`)
    }
    validateProjectConfig()
}

function currentRoute(): string | undefined {
    const result = callWechatide(
        'automation_runtime_info',
        ['--project', projectPaths.output, '--action', 'currentPage'],
        false
    )
    if (!isRecord(result)) {
        return undefined
    }
    return typeof result.route === 'string' ? result.route : undefined
}

function findCounterCount(value: unknown): number | undefined {
    if (!isRecord(value)) {
        return undefined
    }
    if (value.nn === 'native-counter' && typeof value.count === 'number') {
        return value.count
    }
    if (!Array.isArray(value.cn)) {
        return undefined
    }
    return value.cn.map(findCounterCount).find((count) => count !== undefined)
}

function readCounterCount(): number | undefined {
    const result = callWechatide(
        'automation_page_action',
        ['--project', projectPaths.output, '--action', 'getData'],
        false
    )
    if (!isRecord(result) || !isRecord(result.page)) {
        return undefined
    }
    return findCounterCount(result.page)
}

function readProbeText(): string | undefined {
    const result = callWechatide(
        'automation_element_action',
        ['--project', projectPaths.output, '--selector', `#${probeId}`, '--action', 'text'],
        false
    )
    return typeof result === 'string' ? result : undefined
}

function triggerIncrement(): void {
    callWechatide(
        'automation_element_action',
        [
            '--project',
            projectPaths.output,
            '--selector',
            `#${nativeCounterId}`,
            '--action',
            'trigger',
            '--type',
            'increment'
        ],
        true
    )
}

function replaceSourceText(from: string, to: string): void {
    const source = readFileSync(projectPaths.source, 'utf8')
    const occurrences = source.split(from).length - 1
    if (occurrences !== 1) {
        throw new Error(`Expected one source occurrence of: ${from}`)
    }
    writeFileSync(projectPaths.source, source.replace(from, to))
}

function patchContains(text: string): boolean {
    const patchPath = resolve(projectPaths.output, 'hmr/patches.js')
    return existsSync(patchPath) && readFileSync(patchPath, 'utf8').includes(text)
}

function hashFile(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function readRootHashes(): Map<string, string> {
    const files = ['app.js', 'app.wxss', 'hmr/info.js']
    return new Map(files.map((file) => [file, hashFile(resolve(projectPaths.output, file))]))
}

function assertRootHashes(expected: Map<string, string>): void {
    const current = readRootHashes()
    const changed = [...expected].filter(([file, hash]) => current.get(file) !== hash).map(([file]) => file)
    if (changed.length > 0) {
        throw new Error(`App-root files changed during HMR: ${changed.join(', ')}`)
    }
}

function restoreSource(): void {
    if (existsSync(projectPaths.backup)) {
        copyFileSync(projectPaths.backup, projectPaths.source)
    }
}

function tail(text: string, lineCount: number): string {
    return text.split('\n').slice(-lineCount).join('\n')
}

function collectHmrDiagnostics(rootHashes: Map<string, string>): void {
    stage('HMR diagnostics')
    const network = callWechatide(
        'get_app_network_content',
        ['--project', projectPaths.output, '--command', "grep -n '__vpt_hmr__'"],
        false
    )
    const consoleContent = callWechatide(
        'get_app_console_content',
        ['--project', projectPaths.output, '--command', "grep -i -E 'error|fail|warn|exception'"],
        false
    )
    console.log(`Network HMR reports: ${JSON.stringify(network)}`)
    console.log(`Console diagnostics: ${JSON.stringify(consoleContent)}`)
    console.log(
        `App roots unchanged: ${JSON.stringify([...rootHashes].every(([file, hash]) => readRootHashes().get(file) === hash))}`
    )
    console.log(`Vite log tail:\n${tail(readFileSync(projectPaths.viteLog, 'utf8'), 40)}`)
}

async function waitForProbeText(expectedText: string): Promise<void> {
    await sleep(5_000)
    await pollUntil(`visible text "${expectedText}"`, transitionDeadlineMs, pollIntervalMs, readProbeText, (text) =>
        text.includes(expectedText)
    )
}

async function verifyTextAndState(
    expectedText: string,
    expectedCount: number,
    rootHashes: Map<string, string>
): Promise<void> {
    try {
        await waitForProbeText(expectedText)
        const count = await pollUntil(
            `native counter value ${expectedCount}`,
            transitionDeadlineMs,
            pollIntervalMs,
            readCounterCount,
            (value) => value === expectedCount
        )
        if (count !== expectedCount) {
            throw new Error(`Expected native counter ${expectedCount}, received ${count}`)
        }
        assertRootHashes(rootHashes)
    } catch (error) {
        collectHmrDiagnostics(rootHashes)
        throw error
    }
}

async function proveHmr(): Promise<void> {
    const initialText = await pollUntil(
        'initial visible probe text',
        transitionDeadlineMs,
        pollIntervalMs,
        readProbeText,
        (text) => text.includes(originalText)
    )
    const initialCount = await pollUntil(
        'initial native counter state',
        transitionDeadlineMs,
        pollIntervalMs,
        readCounterCount,
        (count) => count === 0
    )
    console.log(`Initial state: text=${JSON.stringify(initialText)}, count=${initialCount}`)

    triggerIncrement()
    const retainedCount = await pollUntil(
        'incremented native counter state',
        transitionDeadlineMs,
        pollIntervalMs,
        readCounterCount,
        (count) => count === initialCount + 1
    )
    const rootHashes = readRootHashes()
    copyFileSync(projectPaths.source, projectPaths.backup)

    try {
        replaceSourceText(originalText, updatedText)
        await pollUntil(
            'published HMR patch',
            60_000,
            500,
            () => patchContains(updatedText),
            (ready) => ready
        )
        await verifyTextAndState(updatedText, retainedCount, rootHashes)
        console.log(`After edit: text=${JSON.stringify(updatedText)}, count=${retainedCount}`)

        restoreSource()
        await pollUntil(
            'restoration HMR patch',
            60_000,
            500,
            () => patchContains(originalText),
            (ready) => ready
        )
        await verifyTextAndState(originalText, retainedCount, rootHashes)
        console.log(`After restoration: text=${JSON.stringify(originalText)}, count=${retainedCount}`)
    } finally {
        restoreSource()
        rmSync(projectPaths.backup, { force: true })
    }

    const consoleContent = callWechatide(
        'get_app_console_content',
        ['--project', projectPaths.output, '--command', "grep -i -E 'error|fail|warn|exception'"],
        true
    )
    if (consoleContent !== '') {
        throw new Error(`Unexpected DevTools console diagnostics: ${JSON.stringify(consoleContent)}`)
    }
}

async function runDevToolsValidation(): Promise<void> {
    const devServer = startDevServer()
    try {
        await pollUntil(
            'published WX dev server',
            90_000,
            500,
            () => devServerReady(devServer),
            (ready) => ready
        )
        validateDevelopmentOutput()
        callWechatide('open_project_window', ['--project', projectPaths.output], true)
        try {
            await pollUntil(
                'home page route',
                90_000,
                pollIntervalMs,
                currentRoute,
                (route) => route === '/pages/home/index'
            )
            await proveHmr()
        } finally {
            restoreSource()
            callWechatide('close_project_window', ['--project', projectPaths.output], false)
        }
    } finally {
        await stopDevServer(devServer)
    }
}

async function main(): Promise<void> {
    stage('Resolving npm latest versions')
    const identity = readLatestPackageIdentity()
    console.log(`create-vite-taro@${identity.creatorVersion}`)
    console.log(`vite-plugin-taro@${identity.pluginVersion}`)

    stage('Creating and installing a fresh disposable project')
    createFreshProject()
    validateInstalledPlugin(identity)
    configureDisposableProject()

    stage('Running typecheck and production WX build')
    validateStaticBuild()

    stage('Checking WeChat DevTools')
    validateDevToolsStatus()

    stage('Validating published-package HMR')
    await runDevToolsValidation()

    stage('PASS')
    console.log(
        `Published create-vite-taro@${identity.creatorVersion} and vite-plugin-taro@${identity.pluginVersion} passed.`
    )
    console.log(`Disposable project retained at ${projectPaths.root}`)
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    console.error(`\n[published-packages] FAIL\n${message}`)
    process.exit(1)
})
