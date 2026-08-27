import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, type FileHandle, mkdir, open, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

export type LoanHmrFixture = Readonly<{
    outDir: string
    read: (relativePath: string) => Promise<string>
    repositoryRoot: string
    root: string
    publishMarker: (markerFile: string, value: string) => Promise<void>
    write: (relativePath: string, source: string) => Promise<void>
    writeMarkerSource: (markerFile: string, value: string) => Promise<void>
}>

export type LoanHmrServer = Readonly<{
    logFile: FileHandle
    process: ChildProcess
}>

type SourceReplacement = readonly [oldText: string, newText: string]
type FixtureTest = (fixture: LoanHmrFixture) => Promise<void>

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.dirname(scriptsRoot)
const repositoryRoot = path.resolve(packageRoot, '../..')
const fixtureRoot = path.join(tmpdir(), 'vite-plugin-taro-loan-genius-hmr-v1')
const fixtureLockPath = path.join(tmpdir(), 'vite-plugin-taro-loan-genius-hmr.lock')

/** Runs one suite against the fixed trusted DevTools project without allowing concurrent source mutation. */
export async function withLoanHmrFixture(test: FixtureTest): Promise<void> {
    const lock = await acquireFixtureLock()
    try {
        const fixture = await prepareFixture()
        await test(fixture)
    } finally {
        await lock.close()
        await unlink(fixtureLockPath)
    }
}

async function acquireFixtureLock(): Promise<FileHandle> {
    try {
        const lock = await open(fixtureLockPath, 'wx')
        await lock.writeFile(String(process.pid))
        return lock
    } catch (error) {
        if (!hasErrorCode(error, 'EEXIST')) {
            throw error
        }
        const ownerPid = Number(await readFile(fixtureLockPath, 'utf8'))
        if (Number.isSafeInteger(ownerPid) && ownerPid > 0 && isProcessAlive(ownerPid)) {
            throw new Error(`Loan Genius HMR suite is already running in process ${ownerPid}`)
        }
        await unlink(fixtureLockPath)
        const lock = await open(fixtureLockPath, 'wx')
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

async function prepareFixture(): Promise<LoanHmrFixture> {
    await mkdir(fixtureRoot, { recursive: true })
    await Promise.all(
        ['src', 'public', 'node_modules'].map((entry) =>
            rm(path.join(fixtureRoot, entry), { recursive: true, force: true })
        )
    )
    await Promise.all([
        cp(path.join(packageRoot, 'src'), path.join(fixtureRoot, 'src'), { recursive: true }),
        cp(path.join(packageRoot, 'public'), path.join(fixtureRoot, 'public'), { recursive: true }),
        ...['package.json', 'tsconfig.json', 'vite.config.ts'].map((file) =>
            cp(path.join(packageRoot, file), path.join(fixtureRoot, file))
        )
    ])
    if (existsSync(path.join(packageRoot, '.env.local'))) {
        await cp(path.join(packageRoot, '.env.local'), path.join(fixtureRoot, '.env.local'))
    }
    await symlink(
        path.join(packageRoot, 'node_modules'),
        path.join(fixtureRoot, 'node_modules'),
        process.platform === 'win32' ? 'junction' : 'dir'
    )

    const fixture = createFixture()
    await configureAutomatableRenderer(fixture)
    await instrumentSources(fixture)
    return fixture
}

function createFixture(): LoanHmrFixture {
    const write = (relativePath: string, source: string) => writeFile(path.join(fixtureRoot, relativePath), source)
    return {
        outDir: path.join(fixtureRoot, 'dist/wx'),
        read: async (relativePath) =>
            (await readFile(path.join(fixtureRoot, relativePath), 'utf8')).replaceAll('\r\n', '\n'),
        repositoryRoot: repositoryRoot,
        root: fixtureRoot,
        publishMarker: async (markerFile, value) => {
            await writeMarker(write, markerFile, value)
            // Rolldown's quiet window must close before DevTools is polled for the newly published Page shell.
            await delay(700)
        },
        write: write,
        writeMarkerSource: (markerFile, value) => writeMarker(write, markerFile, value)
    }
}

async function configureAutomatableRenderer(fixture: LoanHmrFixture): Promise<void> {
    await replaceFixtureSource(fixture, 'vite.config.ts', [
        [
            "                    renderer: 'skyline',\n                    componentFramework: 'glass-easel',\n                    rendererOptions: {\n                        skyline: {\n                            defaultDisplayBlock: true,\n                            defaultContentBox: true\n                        }\n                    },\n",
            ''
        ]
    ])
}

async function instrumentSources(fixture: LoanHmrFixture): Promise<void> {
    const markerFiles = [
        'src/pages/calculator/hmr-marker.ts',
        'src/pages/calculator/monthly-payments/hmr-marker.ts',
        'src/pages/calculator/history/hmr-marker.ts'
    ]
    await Promise.all(markerFiles.map((file) => fixture.writeMarkerSource(file, 'baseline')))
    await Promise.all([
        replaceFixtureSource(fixture, 'src/pages/calculator/index.tsx', [
            [
                "import { equalInterestCalc } from './helper'",
                "import { hmrMarker } from './hmr-marker'\nimport { equalInterestCalc } from './helper'"
            ],
            [
                '<View className="relative flex flex-col flex-1 bg-white h-screen w-full overflow-hidden">',
                '<View id="loan-calculator-page" className="relative flex flex-col flex-1 bg-white h-screen w-full overflow-hidden">'
            ],
            [
                '            <NavigationBar backgroundColor={backgroundColor} color={navigationBarColor}>',
                '            <Text id="loan-direct-page-probe">direct-page-baseline</Text>\n            <Text id="loan-hmr-marker">{hmrMarker}</Text>\n            <NavigationBar backgroundColor={backgroundColor} color={navigationBarColor}>'
            ],
            [
                '                <Button\n                    className="flex p-2',
                '                <Button\n                    id="loan-submit"\n                    className="flex p-2'
            ]
        ]),
        replaceFixtureSource(fixture, 'src/pages/calculator/line-wrap.tsx', [
            [
                '<View onClick={showExplain(loan.explain)}>',
                // biome-ignore lint/suspicious/noTemplateCurlyInString: This is literal TSX injected into the fixture.
                '<View id={`loan-explain-${loan.key}`} onClick={showExplain(loan.explain)}>'
            ],
            [
                '<View key={loan.name} className="relative flex flex-row items-center justify-between py-5.5">',
                // biome-ignore lint/suspicious/noTemplateCurlyInString: This is literal TSX injected into the fixture.
                '<View id={`loan-field-${loan.key}`} key={loan.name} className="relative flex flex-row items-center justify-between py-5.5">'
            ],
            [
                '<View className="flex-1">\n                                    <Pciker',
                // biome-ignore lint/suspicious/noTemplateCurlyInString: This is literal TSX injected into the fixture.
                '<View id={`loan-picker-${loan.key}`} className="flex-1">\n                                    <Pciker'
            ],
            [
                '                                <Input\n                                    // Taro',
                // biome-ignore lint/suspicious/noTemplateCurlyInString: This is literal TSX injected into the fixture.
                '                                <Input\n                                    id={`loan-input-${loan.key}`}\n                                    // Taro'
            ],
            [
                '<View className="flex flex-col p-1.25 pt-0">',
                '<View id="loan-explain-dialog" className="flex flex-col p-1.25 pt-0">'
            ]
        ]),
        replaceFixtureSource(fixture, 'src/pages/calculator/compute-header/index.tsx', [
            ['<View>\n            <LinearGradient', '<View id="loan-result-header">\n            <LinearGradient'],
            [
                '<View className="flex flex-row items-center" onClick={goHistory}>',
                '<View id="loan-open-history" className="flex flex-row items-center" onClick={goHistory}>'
            ],
            [
                '<View className="mt-2.5 flex flex-row items-center" onClick={goMonthlyPayments}>',
                '<View id="loan-open-monthly" className="mt-2.5 flex flex-row items-center" onClick={goMonthlyPayments}>'
            ]
        ]),
        replaceFixtureSource(fixture, 'src/components/picker/index.tsx', [
            ['<View onClick={showModal}>', '<View id="loan-picker-root" onClick={showModal}>'],
            [
                '<Text className="font-bold text-[#1fb081]" onClick={onConfirm}>',
                '<Text id="loan-picker-confirm" className="font-bold text-[#1fb081]" onClick={onConfirm}>'
            ]
        ]),
        replaceFixtureSource(fixture, 'src/components/modal/index.tsx', [
            [
                '<View className="relative w-4/5 overflow-hidden rounded-md bg-white" onClick={stopPropagation}>',
                '<View id="loan-modal-panel" className="relative w-4/5 overflow-hidden rounded-md bg-white" onClick={stopPropagation}>'
            ]
        ]),
        replaceFixtureSource(fixture, 'src/pages/calculator/monthly-payments/index.tsx', [
            [
                "import { CHECK_RIDIO, CHECK_RIDIO_Y, MONTY_DATA, MONTY_TITLE } from '../constants'",
                "import { hmrMarker } from './hmr-marker'\nimport { CHECK_RIDIO, CHECK_RIDIO_Y, MONTY_DATA, MONTY_TITLE } from '../constants'"
            ],
            [
                '            <NavigationBar>\n                <Text>对比月供</Text>',
                '            <Text id="loan-hmr-marker">{hmrMarker}</Text>\n            <NavigationBar>\n                <Text>对比月供</Text>'
            ],
            [
                '<View className="mt-7.5 flex flex-row items-center" onClick={selectFirst(item)}>',
                // biome-ignore lint/suspicious/noTemplateCurlyInString: This is literal TSX injected into the fixture.
                '<View id={`loan-payment-${item.type}`} className="mt-7.5 flex flex-row items-center" onClick={selectFirst(item)}>'
            ]
        ]),
        replaceFixtureSource(fixture, 'src/pages/calculator/history/index.tsx', [
            [
                "import { getStorageData } from '@utils'",
                "import { getStorageData } from '@utils'\nimport { hmrMarker } from './hmr-marker'"
            ],
            [
                '            <NavigationBar>\n                <Text>计算历史</Text>',
                '            <Text id="loan-hmr-marker">{hmrMarker}</Text>\n            <NavigationBar>\n                <Text>计算历史</Text>'
            ]
        ])
    ])
}

async function replaceFixtureSource(
    fixture: LoanHmrFixture,
    relativePath: string,
    replacements: readonly SourceReplacement[]
): Promise<void> {
    const original = await fixture.read(relativePath)
    const transformed = replacements.reduce(
        (source, [oldText, newText]) => replaceOnce(source, oldText, newText),
        original
    )
    await fixture.write(relativePath, transformed)
}

function writeMarker(write: LoanHmrFixture['write'], markerFile: string, value: string): Promise<void> {
    return write(markerFile, `export const hmrMarker = '${value}'\n`)
}

export function replaceOnce(source: string, oldText: string, newText: string): string {
    const first = source.indexOf(oldText)
    if (first < 0 || source.indexOf(oldText, first + oldText.length) >= 0) {
        throw new Error(`Expected one occurrence of ${JSON.stringify(oldText)}`)
    }
    return `${source.slice(0, first)}${newText}${source.slice(first + oldText.length)}`
}

export async function startLoanHmrServer(fixture: LoanHmrFixture): Promise<LoanHmrServer> {
    const logPath = path.join(fixture.root, 'vite.log')
    const logFile = await open(logPath, 'w')
    const server = spawn(process.execPath, [path.join(fixture.root, 'node_modules/vite/bin/vite.js')], {
        cwd: fixture.root,
        env: { ...process.env, NODE_ENV: 'development', VITE_VPT_TARGET: 'wx' },
        stdio: ['ignore', logFile.fd, logFile.fd]
    })
    const handle = { logFile: logFile, process: server }
    try {
        await waitFor(async () => (await readFile(logPath, 'utf8')).includes('WeChat DevTools'), 20_000)
        return handle
    } catch (error) {
        await stopLoanHmrServer(handle)
        throw error
    }
}

export async function stopLoanHmrServer(server: LoanHmrServer): Promise<void> {
    if (server.process.exitCode === null && server.process.signalCode === null) {
        const exited = new Promise<void>((resolve) => server.process.once('exit', () => resolve()))
        server.process.kill('SIGTERM')
        const graceful = await Promise.race([exited.then(() => true), delay(3_000).then(() => false)])
        if (!graceful) {
            server.process.kill('SIGKILL')
            await exited
            throw new Error('Loan Genius Vite server did not drain within three seconds')
        }
    }
    await server.logFile.close()
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMilliseconds: number): Promise<void> {
    const startedAt = Date.now()
    while (!(await predicate())) {
        if (Date.now() - startedAt > timeoutMilliseconds) {
            throw new Error(`Timed out after ${timeoutMilliseconds}ms`)
        }
        await delay(100)
    }
}
