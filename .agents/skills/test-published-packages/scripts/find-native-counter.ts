interface NativeCounter {
    selector: string
    count: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads the generated native host id without adding an id property to its component contract. */
export function findNativeCounter(value: unknown): NativeCounter | undefined {
    if (!isRecord(value)) {
        return undefined
    }
    if (value.nn === 'native-counter' && typeof value.sid === 'string' && typeof value.count === 'number') {
        // Taro's native template selects uid || sid; custom props must not emit a second id attribute.
        const id = typeof value.uid === 'string' && value.uid.length > 0 ? value.uid : value.sid
        return { selector: `#${id}`, count: value.count }
    }
    if (Array.isArray(value.cn)) {
        // Short-circuit depth-first traversal visits each node at most once and uses O(depth) stack space.
        for (const child of value.cn) {
            const counter = findNativeCounter(child)
            if (counter !== undefined) {
                return counter
            }
        }
    }
    return undefined
}
