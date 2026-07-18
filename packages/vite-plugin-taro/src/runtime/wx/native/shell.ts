/** One native callback invocation queued before capsule activation. */
interface QueuedInvocation<Method extends string> {
    method: Method
    receiver: object
    args: unknown[]
}

/** The namespace returned after SystemJS executes an App, Page, or Component capsule. */
interface CapsuleNamespace {
    default: unknown
}

/** Inputs for a synchronous native shell backed by an asynchronously activated capsule. */
interface NativeShellOptions<Method extends string, Properties extends object> {
    shellName: 'App' | 'Page' | 'Component'
    loadCapsule: () => Promise<CapsuleNamespace>
    methods: readonly Method[]
    properties: Properties
}

/** A synchronous native shell backed by an asynchronously activated capsule. */
export type NativeShell<Method extends string, Properties extends object> = Properties &
    Record<Method, (this: object, ...args: unknown[]) => unknown>

/** Creates a synchronous native shell and replays callbacks after its capsule supplies the real configuration. */
export function createNativeShell<Method extends string, Properties extends object>({
    shellName,
    loadCapsule,
    methods,
    properties
}: NativeShellOptions<Method, Properties>): NativeShell<Method, Properties> {
    const journal: QueuedInvocation<Method>[] = []
    let activeConfig: Record<string, unknown> | undefined
    let failed = false

    // Every shell activates independently; prerequisites shared by several shells must be explicit capsule dependencies.
    void Promise.resolve()
        .then(loadCapsule)
        .then((capsule) => {
            if (!capsule.default || typeof capsule.default !== 'object') {
                throw new Error(`Expected a ${shellName} configuration`)
            }

            const nextConfig = capsule.default as Record<string, unknown>
            for (let index = 0; index < journal.length; index++) {
                const invocation = journal[index]
                callConfigMethod(nextConfig, invocation.method, invocation.receiver, invocation.args)
            }
            journal.length = 0
            activeConfig = nextConfig
        })
        .catch((error: unknown) => {
            activeConfig = undefined
            failed = true
            journal.length = 0
            console.error(`Failed to activate ${shellName} capsule`, error)
        })

    const callbacks = {} as Record<Method, (this: object, ...args: unknown[]) => unknown>
    for (const method of methods) {
        callbacks[method] = function (this: object, ...args: unknown[]) {
            if (failed) {
                return
            }
            if (!activeConfig) {
                journal.push({
                    method,
                    receiver: this,
                    args
                })
                return
            }
            return callConfigMethod(activeConfig, method, this, args)
        }
    }

    return {
        ...properties,
        ...callbacks
    }
}

/** Calls one shell method when the activated capsule configuration provides it. */
function callConfigMethod<Method extends string>(
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
