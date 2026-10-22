#!/usr/bin/env node

import type { ChildProcess } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { findNativeCounter } from './find-native-counter.ts'
import type { PublishedFixture, PublishedRenderer } from './published-package-fixture.ts'
import {
    assertPublishedRenderer,
    getPublishedRenderers,
    nativeCounterProbeId,
    parseNativeCounterProperty,
    preparePublishedFixture
} from './published-package-fixture.ts'
import { removeDirectory } from './remove-directory.ts'
import { rendererEnvironmentSource } from './renderer-environment-source.ts'

interface CommandResult {
    status: number | null
    stdout: string
    stderr: string
    error: Error | undefined
}

interface CommandInvocation {
    executable: string
    args: readonly string[]
}

type ReleaseTag = 'beta' | 'latest'

interface PublishedRelease {
    releaseTag: ReleaseTag
    creatorVersion: string
    pluginVersion: string
    runtimeVersion: string
    publishedAt: number
}

interface PackageIdentity extends PublishedRelease {
    pluginTarball: string
    runtimeTarball: string
}

interface ProjectPaths {
    root: string
    output: string
    source: string
    backup: string
    config: string
    counter: string
    nativeCounter: string
}

const renderers = getPublishedRenderers(process.argv.slice(2))
const skillDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const repositoryRoot = resolve(skillDirectory, '../../..')
const temporaryDirectory = resolve(repositoryRoot, 'packages/vite-plugin-taro/tmp')
const temporaryRoot = resolve(temporaryDirectory, 'vpt-published-packages-test')
const projectPaths: ProjectPaths = {
    root: temporaryRoot,
    output: resolve(temporaryRoot, 'dist/wx'),
    source: resolve(temporaryRoot, 'src/pages/home/index.tsx'),
    backup: resolve(temporaryRoot, '.hmr-test-index.tsx.backup'),
    config: resolve(temporaryRoot, 'vite.config.ts'),
    counter: resolve(temporaryRoot, 'src/components/counter/counter.tsx'),
    nativeCounter: resolve(temporaryRoot, 'src/components/counter/native-counter.tsx')
}
const miniProgramSkill = resolve(repositoryRoot, '.agents/skills/miniprogram-dev-skill')
const originalText = 'Build naturally. Ship everywhere.'
const updatedText = 'Published HMR keeps React state.'
const probeId = 'published-hmr-probe'
const pollIntervalMs = 500
const transitionDeadlineMs = 120_000
const commandTimeoutMs = 29_000
const devServerReadyMarker = 'Mini Program project'
const consoleDiagnosticsCommand = "grep -i -E 'error|fail|warn|exception'"

function stage(message: string): void {
    console.log(`\n[published-packages] ${message}`)
}

function createCommandInvocation(command: string, args: readonly string[]): CommandInvocation {
    return process.platform === 'win32'
        ? { executable: 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] }
        : { executable: command, args: args }
}

function execute(command: string, args: readonly string[], cwd: string, timeoutMs: number | undefined): CommandResult {
    const invocation = createCommandInvocation(command, args)
    const result = spawnSync(invocation.executable, invocation.args, {
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

function readPublishedVersion(packageName: string, releaseTag: ReleaseTag): string {
    return requireCommand(
        'npm',
        ['view', `${packageName}@${releaseTag}`, 'version', '--prefer-online'],
        repositoryRoot,
        undefined
    ).trim()
}

function readPublishedAt(packageName: string, version: string): number {
    const timestamp = requireCommand(
        'npm',
        ['view', packageName, `time[${version}]`, '--prefer-online'],
        repositoryRoot,
        undefined
    ).trim()
    const publishedAt = Date.parse(timestamp)
    if (Number.isNaN(publishedAt)) {
        throw new Error(`npm returned an invalid publication time for ${packageName}@${version}: ${timestamp}`)
    }
    return publishedAt
}

function readPublishedRelease(releaseTag: ReleaseTag): PublishedRelease {
    const creatorVersion = readPublishedVersion('create-vite-taro', releaseTag)
    const pluginVersion = readPublishedVersion('vite-plugin-taro', releaseTag)
    const runtimeVersion = readPublishedVersion('vite-plugin-taro-runtime', releaseTag)
    if (creatorVersion !== pluginVersion || pluginVersion !== runtimeVersion) {
        throw new Error(
            `npm ${releaseTag} tags are inconsistent: create-vite-taro@${creatorVersion}, vite-plugin-taro@${pluginVersion}, vite-plugin-taro-runtime@${runtimeVersion}. Wait for publication to complete before rerunning.`
        )
    }

    const publishedAt = Math.max(
        readPublishedAt('create-vite-taro', creatorVersion),
        readPublishedAt('vite-plugin-taro', pluginVersion),
        readPublishedAt('vite-plugin-taro-runtime', runtimeVersion)
    )
    return {
        releaseTag: releaseTag,
        creatorVersion: creatorVersion,
        pluginVersion: pluginVersion,
        runtimeVersion: runtimeVersion,
        publishedAt: publishedAt
    }
}

function readPublishedTarball(packageName: string, version: string): string {
    const tarball = requireCommand(
        'npm',
        ['view', `${packageName}@${version}`, 'dist.tarball', '--prefer-online'],
        repositoryRoot,
        undefined
    ).trim()
    if (!tarball.startsWith('https://')) {
        throw new Error(`Published ${packageName} tarball is not an HTTPS registry artifact: ${tarball}`)
    }
    return tarball
}

function readPublishedPackageIdentity(): PackageIdentity {
    const stableRelease = readPublishedRelease('latest')
    const betaRelease = readPublishedRelease('beta')
    const selectedRelease = betaRelease.publishedAt > stableRelease.publishedAt ? betaRelease : stableRelease
    return {
        ...selectedRelease,
        pluginTarball: readPublishedTarball('vite-plugin-taro', selectedRelease.pluginVersion),
        runtimeTarball: readPublishedTarball('vite-plugin-taro-runtime', selectedRelease.runtimeVersion)
    }
}

function createFreshProject(identity: PackageIdentity): void {
    mkdirSync(temporaryDirectory, { recursive: true })
    removeDirectory(projectPaths.root)
    requireCommand(
        'npm',
        ['create', '--yes', `vite-taro@${identity.creatorVersion}`, 'vpt-published-packages-test'],
        temporaryDirectory,
        undefined
    )
    const installOutput = requireCommand('npm', ['install'], projectPaths.root, undefined)
    process.stdout.write(installOutput)
}

function readJsonFile(path: string): Record<string, unknown> {
    return requireRecord(parseJson(readFileSync(path, 'utf8'), path), path)
}

function validateInstalledPackages(identity: PackageIdentity): void {
    const lock = readJsonFile(resolve(projectPaths.root, 'package-lock.json'))
    const packages = requireRecord(lock.packages, 'package-lock packages')
    for (const [name, version, tarball] of [
        ['vite-plugin-taro', identity.pluginVersion, identity.pluginTarball],
        ['vite-plugin-taro-runtime', identity.runtimeVersion, identity.runtimeTarball]
    ]) {
        const installed = requireRecord(packages[`node_modules/${name}`], `installed ${name}`)
        const installedVersion = requireString(installed.version, `installed ${name} version`)
        const resolved = requireString(installed.resolved, `installed ${name} resolution`)
        if (installedVersion !== version || resolved !== tarball) {
            throw new Error(
                `Expected registry artifact ${name}@${version} from ${tarball}, received ${installedVersion} from ${resolved}`
            )
        }
    }
}

function readAppId(): string {
    const appId = requireString(process.env.VITE_VPT_WECHAT_APP_ID, 'VITE_VPT_WECHAT_APP_ID').trim()
    if (appId.length === 0 || appId === 'touristappid') {
        throw new Error('The test AppID is invalid')
    }
    return appId
}

function readPublishedFixture(): PublishedFixture {
    return {
        config: readFileSync(projectPaths.config, 'utf8'),
        page: readFileSync(projectPaths.source, 'utf8'),
        counter: readFileSync(projectPaths.counter, 'utf8'),
        nativeCounter: readFileSync(projectPaths.nativeCounter, 'utf8')
    }
}

function configureDisposableProject(sources: PublishedFixture, renderer: PublishedRenderer): void {
    const fixture = preparePublishedFixture(sources, renderer, { id: probeId, text: originalText })
    writeFileSync(resolve(projectPaths.root, '.env.local'), `VITE_VPT_WECHAT_APP_ID=${readAppId()}\n`)
    writeFileSync(projectPaths.config, fixture.config)
    writeFileSync(projectPaths.source, fixture.page)
    writeFileSync(projectPaths.counter, fixture.counter)
    writeFileSync(projectPaths.nativeCounter, fixture.nativeCounter)
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
    const skill = readFileSync(resolve(miniProgramSkill, 'SKILL.md'), 'utf8')
    const match = /^version:\s*(\S+)$/m.exec(skill)
    if (match === null) {
        throw new Error('Unable to read miniprogram-dev-skill version')
    }
    return match[1]
}

function validateDevToolsStatus(): void {
    const result = requireRecord(
        callWechatide('check_wechatide_status', ['--skill-version', readSkillVersion()], true),
        'DevTools status'
    )
    const loginUser = requireRecord(result.loginUser, 'DevTools status login user')
    requireString(loginUser.openid, 'DevTools status openid')
    if (result.loginExpired !== false) {
        throw new Error('WeChat DevTools login is expired')
    }
    if (result.versionRelation !== 'equal' && result.versionRelation !== 'agent_ahead') {
        throw new Error('Synchronize the WeChat DevTools skill before running the published-package checks')
    }
    if (result.tokenRequired !== false) {
        throw new Error(
            'WeChat DevTools requires a CLI access token; configure CLI authorization before running this check'
        )
    }
}

function viteLogPath(renderer: PublishedRenderer): string {
    return resolve(temporaryDirectory, `vpt-published-packages-test-${renderer}-vite.log`)
}

function startDevServer(renderer: PublishedRenderer): ChildProcess {
    removeDirectory(projectPaths.output)
    rmSync(viteLogPath(renderer), { force: true })
    mkdirSync(resolve(projectPaths.output, '..'), { recursive: true })
    const logDescriptor = openSync(viteLogPath(renderer), 'w')
    const invocation = createCommandInvocation('npm', ['run', 'dev:wx'])
    const child = spawn(invocation.executable, invocation.args, {
        cwd: projectPaths.root,
        detached: process.platform !== 'win32',
        stdio: ['ignore', logDescriptor, logDescriptor]
    })
    closeSync(logDescriptor)
    return child
}

function devServerReady(child: ChildProcess, renderer: PublishedRenderer): boolean {
    if (child.exitCode !== null) {
        throw new Error(`Published dev server exited with code ${child.exitCode}`)
    }
    return (
        existsSync(viteLogPath(renderer)) && readFileSync(viteLogPath(renderer), 'utf8').includes(devServerReadyMarker)
    )
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
    if (child.pid === undefined || child.exitCode !== null) {
        return
    }
    if (process.platform === 'win32') {
        requireCommand('taskkill', ['/pid', String(child.pid), '/t', '/f'], repositoryRoot, commandTimeoutMs)
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
    if (!isRecord(result) || !isRecord(result.currentPage)) {
        return undefined
    }
    return typeof result.currentPage.route === 'string' ? result.currentPage.route : undefined
}

function validateActiveRenderer(renderer: PublishedRenderer): void {
    const response = requireRecord(
        callWechatide(
            'automation_evaluate',
            ['--project', projectPaths.output, '--fn-source', rendererEnvironmentSource],
            true
        ),
        'renderer evaluation'
    )
    const environment = requireRecord(
        requireRecord(response.result, 'renderer evaluation response').result,
        'renderer environment'
    )
    assertPublishedRenderer(renderer, environment)
    console.log(`Active ${renderer} renderer: ${JSON.stringify(environment)}`)
}

function readNativeCounter(renderer: PublishedRenderer) {
    if (renderer === 'dom') {
        const selector = `#${nativeCounterProbeId}`
        const value = callWechatide(
            'automation_element_action',
            ['--project', projectPaths.output, '--selector', selector, '--action', 'property', '--name', 'count'],
            true
        )
        return { selector, count: parseNativeCounterProperty(value) }
    }
    const result = callWechatide(
        'automation_page_action',
        ['--project', projectPaths.output, '--action', 'getData'],
        false
    )
    if (!isRecord(result) || !isRecord(result.data) || !isRecord(result.data.page)) {
        return undefined
    }
    return findNativeCounter(result.data.page)
}

function readCounterCount(renderer: PublishedRenderer): number | undefined {
    return readNativeCounter(renderer)?.count
}

function readProbeText(): string | undefined {
    const result = callWechatide(
        'automation_element_action',
        ['--project', projectPaths.output, '--selector', `#${probeId}`, '--action', 'text'],
        false
    )
    return typeof result === 'string' ? result : undefined
}

function triggerIncrement(selector: string): void {
    callWechatide(
        'automation_element_action',
        ['--project', projectPaths.output, '--selector', selector, '--action', 'trigger', '--type', 'increment'],
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

function readConsoleDiagnostics(): readonly string[] {
    const content = callWechatide(
        'get_simulator_console',
        ['--project', projectPaths.output, '--command', consoleDiagnosticsCommand],
        true
    )
    if (typeof content !== 'string') {
        throw new Error('DevTools console diagnostics must be text')
    }

    // DevTools repeats identical records across rebuilds, so HMR compares distinct diagnostic signatures.
    const lines = content.split('\n').filter((line) => line.length > 0 && line !== '--')
    return [...new Set(lines)].sort()
}

function collectHmrDiagnostics(rootHashes: Map<string, string>, renderer: PublishedRenderer): void {
    stage('HMR diagnostics')
    const network = callWechatide(
        'get_simulator_network',
        ['--project', projectPaths.output, '--command', "grep -n '__vpt_hmr__'"],
        false
    )
    const consoleContent = callWechatide(
        'get_simulator_console',
        ['--project', projectPaths.output, '--command', consoleDiagnosticsCommand],
        false
    )
    console.log(`Network HMR reports: ${JSON.stringify(network)}`)
    console.log(`Console diagnostics: ${JSON.stringify(consoleContent)}`)
    console.log(
        `App roots unchanged: ${JSON.stringify([...rootHashes].every(([file, hash]) => readRootHashes().get(file) === hash))}`
    )
    console.log(`Vite log tail:\n${tail(readFileSync(viteLogPath(renderer), 'utf8'), 40)}`)
}

async function waitForProbeText(expectedText: string): Promise<void> {
    await pollUntil(`visible text "${expectedText}"`, transitionDeadlineMs, pollIntervalMs, readProbeText, (text) =>
        text.includes(expectedText)
    )
}

async function verifyTextAndState(
    expectedText: string,
    expectedCount: number,
    rootHashes: Map<string, string>,
    renderer: PublishedRenderer
): Promise<void> {
    try {
        await waitForProbeText(expectedText)
        const count = await pollUntil(
            `native counter value ${expectedCount}`,
            transitionDeadlineMs,
            pollIntervalMs,
            () => readCounterCount(renderer),
            (value) => value === expectedCount
        )
        if (count !== expectedCount) {
            throw new Error(`Expected native counter ${expectedCount}, received ${count}`)
        }
        assertRootHashes(rootHashes)
    } catch (error) {
        collectHmrDiagnostics(rootHashes, renderer)
        throw error
    }
}

async function proveHmr(renderer: PublishedRenderer): Promise<void> {
    const initialText = await pollUntil(
        'initial visible probe text',
        transitionDeadlineMs,
        pollIntervalMs,
        readProbeText,
        (text) => text.includes(originalText)
    )
    validateActiveRenderer(renderer)
    const initialCounter = await pollUntil(
        'initial native counter state',
        transitionDeadlineMs,
        pollIntervalMs,
        () => readNativeCounter(renderer),
        (counter) => counter.count === 0
    )
    const initialCount = initialCounter.count
    console.log(`Initial state: text=${JSON.stringify(initialText)}, count=${initialCount}`)

    triggerIncrement(initialCounter.selector)
    const retainedCount = await pollUntil(
        'incremented native counter state',
        transitionDeadlineMs,
        pollIntervalMs,
        () => readCounterCount(renderer),
        (count) => count === initialCount + 1
    )
    const baselineConsoleDiagnostics = readConsoleDiagnostics()
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
        await verifyTextAndState(updatedText, retainedCount, rootHashes, renderer)
        console.log(`After edit: text=${JSON.stringify(updatedText)}, count=${retainedCount}`)

        restoreSource()
        await pollUntil(
            'restoration HMR patch',
            60_000,
            500,
            () => patchContains(originalText),
            (ready) => ready
        )
        await verifyTextAndState(originalText, retainedCount, rootHashes, renderer)
        console.log(`After restoration: text=${JSON.stringify(originalText)}, count=${retainedCount}`)
    } finally {
        restoreSource()
        rmSync(projectPaths.backup, { force: true })
    }

    const newConsoleDiagnostics = readConsoleDiagnostics().filter(
        (diagnostic) => !baselineConsoleDiagnostics.includes(diagnostic)
    )
    if (newConsoleDiagnostics.length > 0) {
        throw new Error(`HMR introduced DevTools console diagnostics: ${JSON.stringify(newConsoleDiagnostics)}`)
    }
}

async function runDevToolsValidation(renderer: PublishedRenderer): Promise<void> {
    const devServer = startDevServer(renderer)
    try {
        await pollUntil(
            'published WX dev server',
            90_000,
            500,
            () => devServerReady(devServer, renderer),
            (ready) => ready
        )
        validateDevelopmentOutput()
        try {
            callWechatide('open_project_window', ['--project', projectPaths.output], true)
            await pollUntil(
                'home page route',
                90_000,
                pollIntervalMs,
                currentRoute,
                (route) => route === '/pages/home/index'
            )
            await proveHmr(renderer)
        } finally {
            restoreSource()
            callWechatide('close_project_window', ['--project', projectPaths.output], true)
        }
    } finally {
        await stopDevServer(devServer)
    }
}

async function main(): Promise<void> {
    stage('Resolving the newest npm release from the latest and beta channels')
    const identity = readPublishedPackageIdentity()
    console.log(`npm dist-tag: ${identity.releaseTag}`)
    console.log(`create-vite-taro@${identity.creatorVersion}`)
    console.log(`vite-plugin-taro@${identity.pluginVersion}`)
    console.log(`vite-plugin-taro-runtime@${identity.runtimeVersion}`)
    console.log(`release completed at ${new Date(identity.publishedAt).toISOString()}`)
    readAppId()

    stage('Checking WeChat DevTools')
    validateDevToolsStatus()

    stage('Creating and installing a fresh disposable project')
    createFreshProject(identity)
    validateInstalledPackages(identity)
    const fixture = readPublishedFixture()

    for (const renderer of renderers) {
        stage(`Configuring WX ${renderer} renderer`)
        configureDisposableProject(fixture, renderer)
        stage(`Running ${renderer} typecheck and production WX build`)
        validateStaticBuild()
        stage(`Validating ${renderer} published-package HMR`)
        await runDevToolsValidation(renderer)
    }

    stage('PASS')
    console.log(
        `Published ${identity.releaseTag} ${identity.pluginVersion} packages passed for ${renderers.join(' and ')} rendering.`
    )
    console.log(`Disposable project retained at ${projectPaths.root}`)
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    console.error(`\n[published-packages] FAIL\n${message}`)
    process.exit(1)
})
