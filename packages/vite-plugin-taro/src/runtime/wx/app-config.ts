const appMethods = ['onLaunch', 'onShow', 'onHide', 'onError', 'onUnhandledRejection', 'onPageNotFound'] as const

/** A native App method forwarded to the App module. */
type AppMethod = (typeof appMethods)[number]

/** One native App invocation queued before activation. */
interface AppInvocation {
    method: AppMethod
    receiver: object
    args: unknown[]
}

/** An asynchronously loaded App module. */
interface AppModule {
    default: unknown
}

/** The synchronous configuration passed to the native App constructor. */
type AppShellConfig = { config: Record<string, unknown> } & Record<
    AppMethod,
    (this: object, ...args: unknown[]) => unknown
>

/** Creates a synchronous App shell configuration backed by the App module. */
export function createAppShellConfig(
    loadAppModule: () => Promise<AppModule>,
    config: Record<string, unknown>
): AppShellConfig {
    const journal: AppInvocation[] = []
    let app: Record<string, unknown> | undefined
    let failed = false

    void Promise.resolve()
        .then(loadAppModule)
        .then((module) => {
            if (!module.default || typeof module.default !== 'object') {
                throw new Error('Expected an App configuration from the App module')
            }

            const activatedApp = module.default as Record<string, unknown>
            for (let index = 0; index < journal.length; index++) {
                const invocation = journal[index]
                callApp(activatedApp, invocation.method, invocation.receiver, invocation.args)
            }
            journal.length = 0
            app = activatedApp
        })
        .catch((error: unknown) => {
            app = undefined
            failed = true
            journal.length = 0
            console.error('Failed to activate App module', error)
        })

    const callbacks = {} as Omit<AppShellConfig, 'config'>
    for (const method of appMethods) {
        callbacks[method] = function (this: object, ...args: unknown[]) {
            if (failed) {
                return
            }
            if (!app) {
                journal.push({
                    method,
                    receiver: this,
                    args
                })
                return
            }
            return callApp(app, method, this, args)
        }
    }

    return {
        config,
        ...callbacks
    }
}

/** Calls one App method when the active configuration provides it. */
function callApp(app: Record<string, unknown>, method: AppMethod, receiver: object, args: unknown[]): unknown {
    const callback = app[method]
    if (typeof callback === 'function') {
        return callback.apply(receiver, args)
    }
}
