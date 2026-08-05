interface CapsuleNamespace {
    default: unknown
}

// TypeScript sees the source-level import() split point as a Promise; native rendering replaces it with importSync().
type CapsuleLoader = () => CapsuleNamespace | PromiseLike<CapsuleNamespace>

/** Loads and validates an eager native capsule without yielding before native lifecycle registration. */
export function loadCapsuleConfig(shellName: 'App' | 'Page' | 'Component', loadCapsule: CapsuleLoader): object {
    const capsule = loadCapsule()
    if (isThenable(capsule)) {
        throw new Error(`${shellName} capsule must load synchronously`)
    }
    if (!capsule.default || typeof capsule.default !== 'object' || Array.isArray(capsule.default)) {
        throw new Error(`Expected a ${shellName} configuration`)
    }
    return capsule.default
}

/** Recognizes native and custom thenables returned by misplaced eager capsules. */
function isThenable(value: CapsuleNamespace | PromiseLike<CapsuleNamespace>): value is PromiseLike<CapsuleNamespace> {
    return 'then' in value && typeof value.then === 'function'
}
