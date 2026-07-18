import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativeShell } from './native-shell.ts'

const appMethods = ['onLaunch', 'onShow', 'onHide', 'onError'] as const

test('queues native callbacks until the module activates', async () => {
    let resolveAppModule: (module: { default: object }) => void = () => undefined
    const appModule = new Promise<{ default: object }>((resolve) => {
        resolveAppModule = resolve
    })
    const calls: string[] = []
    const receivers: object[] = []
    const receiver = {}
    const appConfig = {}
    let appModuleRequested = false

    const shellConfig = createNativeShell({
        moduleName: 'App',
        loadModule: () => {
            appModuleRequested = true
            return appModule
        },
        methods: appMethods,
        properties: {
            config: appConfig
        }
    })
    assert.equal(appModuleRequested, false)

    shellConfig.onShow.call(receiver, 'first')
    shellConfig.onLaunch.call(receiver, 'second')

    resolveAppModule({
        default: {
            onShow(this: object, value: unknown) {
                calls.push(`show:${String(value)}`)
                receivers.push(this)
                shellConfig.onHide.call(receiver, 'nested')
            },
            onLaunch(this: object, value: unknown) {
                calls.push(`launch:${String(value)}`)
                receivers.push(this)
            },
            onHide(this: object, value: unknown) {
                calls.push(`hide:${String(value)}`)
                receivers.push(this)
            },
            onError(this: object, value: unknown) {
                calls.push(`error:${String(value)}`)
                receivers.push(this)
            }
        }
    })
    await new Promise<void>((resolve) => {
        setImmediate(resolve)
    })

    assert.equal(appModuleRequested, true)
    assert.strictEqual(shellConfig.config, appConfig)
    assert.deepEqual(calls, ['show:first', 'launch:second', 'hide:nested'])
    assert.deepEqual(receivers, [receiver, receiver, receiver])

    shellConfig.onError.call(receiver, 'active')
    assert.deepEqual(calls, ['show:first', 'launch:second', 'hide:nested', 'error:active'])
})
