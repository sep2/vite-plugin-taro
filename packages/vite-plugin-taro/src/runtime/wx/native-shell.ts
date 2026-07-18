/** One native invocation queued before module activation. */
interface NativeInvocation<Method extends string> {
    method: Method
    receiver: object
    args: unknown[]
}

/** An asynchronously loaded native configuration module. */
interface NativeModule {
    default: unknown
}

/** Inputs for a synchronous native shell backed by an asynchronous module. */
interface NativeShellOptions<Method extends string, Properties extends object> {
    moduleName: 'App' | 'Page' | 'Component'
    loadModule: () => Promise<NativeModule>
    methods: readonly Method[]
    properties: Properties
}

/** A synchronous native shell backed by an asynchronous module. */
export type NativeShell<Method extends string, Properties extends object> = Properties &
    Record<Method, (this: object, ...args: unknown[]) => unknown>

/** Creates a synchronous native shell backed by an asynchronous module. */
export function createNativeShell<Method extends string, Properties extends object>({
    moduleName,
    loadModule,
    methods,
    properties
}: NativeShellOptions<Method, Properties>): NativeShell<Method, Properties> {
    const journal: NativeInvocation<Method>[] = []
    let activatedConfig: Record<string, unknown> | undefined
    let failed = false

    void Promise.resolve()
        .then(loadModule)
        .then((module) => {
            if (!module.default || typeof module.default !== 'object') {
                throw new Error(`Expected a ${moduleName} configuration from the ${moduleName} module`)
            }

            const nextConfig = module.default as Record<string, unknown>
            for (let index = 0; index < journal.length; index++) {
                const invocation = journal[index]
                callNativeConfig(nextConfig, invocation.method, invocation.receiver, invocation.args)
            }
            journal.length = 0
            activatedConfig = nextConfig
        })
        .catch((error: unknown) => {
            activatedConfig = undefined
            failed = true
            journal.length = 0
            console.error(`Failed to activate ${moduleName} module`, error)
        })

    const callbacks = {} as Record<Method, (this: object, ...args: unknown[]) => unknown>
    for (const method of methods) {
        callbacks[method] = function (this: object, ...args: unknown[]) {
            if (failed) {
                return
            }
            if (!activatedConfig) {
                journal.push({
                    method,
                    receiver: this,
                    args
                })
                return
            }
            return callNativeConfig(activatedConfig, method, this, args)
        }
    }

    return {
        ...properties,
        ...callbacks
    }
}

/** Calls one native method when the activated configuration provides it. */
function callNativeConfig<Method extends string>(
    config: Record<string, unknown>,
    method: Method,
    receiver: object,
    args: unknown[]
): unknown {
    const callback = config[method]
    if (typeof callback === 'function') {
        return callback.apply(receiver, args)
    }
}
