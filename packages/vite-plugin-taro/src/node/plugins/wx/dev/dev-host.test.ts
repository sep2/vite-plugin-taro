import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { DevOptions } from 'rolldown/experimental'
import { createLogger, createServer } from 'vite'
import type { VptOptions } from '../../../../options.ts'
import { runtimeSubscribeEvent } from '../../../../runtime/wx/dev/wx-hmr-protocol.ts'
import type { WxStylePlugin } from '../styles/plugins.ts'
import { hmrInfoFileName } from './hmr-files.ts'
import { hmrEndpointPath } from './hmr-protocol.ts'
import { createDevtoolsHmrMode } from './modes/devtools/devtools-hmr-mode.ts'
import type { BundledDev } from './wx-dev-options.ts'

type DevHooks = Readonly<{
    onHmrUpdates: (result: unknown) => void
    onOutput: (result: unknown) => void
}>

type CreateWxDevHost = typeof import('./dev-host.ts')['createWxDevHost']

type SyntheticDev = (_input: unknown, _output: unknown, devOptions: DevOptions) => unknown

const devHostHarnessKey = '__vptDevHostTestHarness__'

const options: VptOptions = {
    target: 'wx',
    app: 'src/app.tsx',
    pages: [],
    appJson: {},
    projectConfigJson: {}
}

async function importDevHost(dev: SyntheticDev): Promise<CreateWxDevHost> {
    const devHostUrl = `${new URL('./dev-host.ts', import.meta.url).href}?synthetic-dev-host-test=${Date.now()}`
    const mockSource = `const harness = globalThis[${JSON.stringify(devHostHarnessKey)}]; export const dev = harness.dev`
    const mockUrl = `data:text/javascript,${encodeURIComponent(mockSource)}`
    // This process-global slot exists only while the redirected module captures its immutable synthetic engine.
    Reflect.set(globalThis, devHostHarnessKey, { dev })
    const hooks = registerHooks({
        resolve(specifier, context, nextResolve) {
            if (specifier === 'rolldown/experimental' && context.parentURL === devHostUrl) {
                return { shortCircuit: true, url: mockUrl }
            }
            return nextResolve(specifier, context)
        }
    })
    try {
        const devHost = await import(devHostUrl)
        return devHost.createWxDevHost
    } finally {
        hooks.deregister()
        Reflect.deleteProperty(globalThis, devHostHarnessKey)
    }
}

function isBundledDev(value: unknown): value is BundledDev {
    return (
        value !== null &&
        typeof value === 'object' &&
        'getRolldownOptions' in value &&
        typeof value.getRolldownOptions === 'function' &&
        'listen' in value &&
        typeof value.listen === 'function' &&
        'triggerBundleRegenerationIfStale' in value &&
        typeof value.triggerBundleRegenerationIfStale === 'function'
    )
}

function requireBundledDev(value: unknown): BundledDev {
    if (!isBundledDev(value)) {
        throw new Error('Expected bundled development adapter')
    }
    return value
}

async function waitForFile(fileName: string): Promise<string> {
    for (let attempt = 0; attempt < 200; attempt++) {
        try {
            return await readFile(fileName, 'utf8')
        } catch (error) {
            if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
        }
        await delay(10)
    }
    throw new Error(`Timed out waiting for ${fileName}`)
}

async function waitForFileChange(fileName: string, previousSource: string): Promise<string> {
    for (let attempt = 0; attempt < 200; attempt++) {
        const source = await readFile(fileName, 'utf8')
        if (source !== previousSource) return source
        await delay(10)
    }
    throw new Error(`Timed out waiting for changed ${fileName}`)
}

test('reduces synthetic engine update variants and unknown host failures without changing host internals', {
    skip: process.platform === 'win32' ? 'Node module interception terminates the Windows test worker' : false
}, async (context) => {
    // These mutable cells expose the callbacks and current synthetic engine state owned by the redirected DevEngine substitute.
    let hooks: DevHooks | undefined
    let triggerFullBuild: (() => void) | undefined
    const deliveredFiles: string[] = []
    const dev = (_input: unknown, _output: unknown, devOptions: DevOptions) => {
        // Filesystem debounce normalizes duplicate native notifications before they become compiler generations.
        assert.equal(devOptions.watch?.useDebounce, true)
        const onHmrUpdates = devOptions.onHmrUpdates
        const onOutput = devOptions.onOutput
        if (!onHmrUpdates || !onOutput) {
            throw new Error('Expected WX development callbacks')
        }
        hooks = {
            onHmrUpdates(result) {
                Reflect.apply(onHmrUpdates, undefined, [result])
            },
            onOutput(result) {
                Reflect.apply(onOutput, undefined, [result])
            }
        }
        triggerFullBuild = () => Reflect.apply(onOutput, undefined, [{}])
        return {
            async run() {
                Reflect.apply(onOutput, undefined, [{}])
            },
            async ensureCurrentBuildFinish() {},
            async registerClient() {},
            async removeClient() {},
            async notifyPayloadDelivered(fileName: string) {
                deliveredFiles.push(fileName)
            },
            triggerFullBuild() {
                triggerFullBuild?.()
            },
            async close() {}
        }
    }
    const createWxDevHost = await importDevHost(dev)
    const root = await mkdtemp(path.join(tmpdir(), 'vpt-dev-host-unit-'))
    const outDir = path.join(root, 'dist')
    const appPath = path.join(root, 'src/app.tsx')
    await mkdir(path.dirname(appPath), { recursive: true })
    await writeFile(appPath, 'export default function App() { return null }\n')
    // These mutable journals capture host diagnostics and permit one injected unknown style failure.
    const errors: string[] = []
    const infos: string[] = []
    let styleFailure: unknown
    const logger = createLogger('silent')
    logger.error = (message) => {
        errors.push(message)
    }
    logger.info = (message) => {
        infos.push(message)
    }
    const styles: WxStylePlugin = {
        name: 'test:synthetic-wx-styles',
        async finalizeUpdate(artifacts, writeWxss) {
            if (styleFailure !== undefined) {
                const failure = styleFailure
                styleFailure = undefined
                throw failure
            }
            await writeWxss('.synthetic {}\n')
            return artifacts
        }
    }
    const server = await createServer({
        root,
        configFile: false,
        customLogger: logger,
        experimental: { bundledDev: true },
        build: {
            outDir,
            rolldownOptions: { input: appPath }
        },
        server: {
            ws: { path: hmrEndpointPath }
        }
    })
    type TestSocketClient = Readonly<{ send: (event: string, data: unknown) => void }>
    type TestSocketListener = (data: unknown, client: TestSocketClient) => void

    // This mutable map captures the host's transport listeners without replacing the Vite server itself.
    const socketListeners = new Map<string, TestSocketListener>()
    context.mock.method(server.ws, 'on', (event: string, listener: (...args: unknown[]) => unknown) => {
        if (typeof event === 'string') {
            socketListeners.set(event, (data, client) => {
                Reflect.apply(listener, undefined, [data, client])
            })
        }
    })
    const hmrMode = {
        ...createDevtoolsHmrMode(),
        replay: () => ({ kind: 'event' as const, event: 'test:response', data: 'response' })
    }
    const httpServer = server.httpServer
    assert.ok(httpServer)
    const originalAddress = httpServer.address

    try {
        const host = await createWxDevHost({
            server: server,
            options: options,
            styles: styles,
            hmrMode: hmrMode
        })
        const listener = socketListeners.get(runtimeSubscribeEvent)
        assert.ok(listener)
        // This mutable list captures the response dispatched to one synthetic socket client.
        const socketResponses: Array<Readonly<{ event: string; data: unknown }>> = []
        listener(
            { buildId: 'build' },
            {
                send(event, data) {
                    socketResponses.push({ event: event, data: data })
                }
            }
        )
        assert.deepEqual(socketResponses, [{ event: 'test:response', data: 'response' }])
        const bundledDev = requireBundledDev(server.environments.client.bundledDev)

        // Initial output has an HTTP object without a bound address, so no build identity is exposed yet.
        await bundledDev.listen()
        assert.ok(hooks)

        Reflect.set(server, 'httpServer', null)
        hooks.onOutput({})
        await delay(30)
        Reflect.set(server, 'httpServer', httpServer)
        httpServer.address = () => 'named-pipe'
        hooks.onOutput({})
        await delay(30)
        assert.equal(await readFile(path.join(outDir, hmrInfoFileName), 'utf8').catch(() => undefined), undefined)

        // Temporarily replace the resolved socket contract to exercise endpoint rejection before restoring this server instance.
        const originalSocketOptions = server.config.server.ws
        Reflect.set(server.config.server, 'ws', false)
        httpServer.address = () => ({ address: '127.0.0.1', family: 'IPv4', port: 43123 })
        hooks.onOutput({})
        await delay(30)
        assert.match(errors.join('\n'), /wx HMR output failed/)
        Reflect.set(server.config.server, 'ws', originalSocketOptions)

        // The first address call supplies a port; the second deliberately disappears before endpoint host resolution.
        let addressCalls = 0
        httpServer.address = () => {
            addressCalls++
            return addressCalls === 1 ? { address: '127.0.0.1', family: 'IPv4', port: 43123 } : null
        }
        hooks.onOutput({})
        const firstInfo = await waitForFile(path.join(outDir, hmrInfoFileName))
        const firstBuildId = /"buildId":"([^"]+)"/.exec(firstInfo)?.[1]
        assert.ok(firstBuildId)
        assert.match(firstInfo, /ws:\/\/127\.0\.0\.1:43123/)

        addressCalls = 0
        httpServer.address = () => {
            addressCalls++
            return addressCalls === 1 ? { address: '127.0.0.1', family: 'IPv4', port: 43123 } : 'named-pipe'
        }
        hooks.onOutput({})
        const stringAddressInfo = await waitForFileChange(path.join(outDir, hmrInfoFileName), firstInfo)
        const activeBuildId = /"buildId":"([^"]+)"/.exec(stringAddressInfo)?.[1]
        assert.ok(activeBuildId)

        hooks.onHmrUpdates({
            changedFiles: [],
            updates: [
                {
                    clientId: 'stale-build',
                    update: {
                        type: 'Patch',
                        code: 'stalePatch()',
                        filename: 'stale.js',
                        changedIds: ['stale'],
                        seq: 1
                    }
                },
                {
                    clientId: activeBuildId,
                    update: { type: 'Noop' }
                }
            ]
        })
        await delay(30)

        // A current non-patch update dominates the batch and requests a complete build without a reason suffix.
        httpServer.address = () => ({ address: '::1', family: 'IPv6', port: 43124 })
        const originalHttps = server.config.server.https
        Reflect.set(server.config.server, 'https', true)
        hooks.onHmrUpdates({
            changedFiles: [],
            updates: [
                {
                    clientId: activeBuildId,
                    update: { type: 'FullReload' }
                }
            ]
        })
        await delay(30)
        assert.match(infos.join('\n'), /wx full rebuild required(?:\n|$)/)

        const nextInfo = await waitForFileChange(path.join(outDir, hmrInfoFileName), stringAddressInfo)
        const nextBuildId = /"buildId":"([^"]+)"/.exec(nextInfo)?.[1]
        assert.ok(nextBuildId)
        assert.notEqual(nextBuildId, activeBuildId)
        assert.match(nextInfo, /wss:\/\/\[::1\]:43124/)
        Reflect.set(server.config.server, 'https', originalHttps)
        styleFailure = Object.freeze({ kind: 'unknown-style-failure' })
        hooks.onHmrUpdates({
            changedFiles: [],
            updates: [
                {
                    clientId: nextBuildId,
                    update: {
                        type: 'Patch',
                        code: 'freshPatch()',
                        filename: 'fresh.js',
                        changedIds: ['fresh'],
                        seq: 1
                    }
                }
            ]
        })
        await delay(30)

        assert.match(errors.join('\n'), /wx HMR publish failed with unknown error/)
        assert.deepEqual(deliveredFiles, [])
        await host.close()
    } finally {
        httpServer.address = originalAddress
        await server.close()
        await rm(root, { force: true, recursive: true })
    }
})
