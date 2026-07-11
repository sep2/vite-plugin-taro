import path from 'node:path'
import type { WxOutputFile } from './development-output.ts'

/** Collects stable IDs from a full bundle so Rolldown can target them in later patches. */
export function collectWxBundleModuleIds(output: WxOutputFile[], root: string): string[] {
    const ids = new Set<string>()
    for (const item of output) {
        if (item.type !== 'chunk') continue
        for (const id of Object.keys(item.modules ?? {})) ids.add(toStableModuleId(id, root))
    }
    return [...ids]
}

/** Finds initializer IDs introduced by a patch before the DevEngine knows about them. */
export function collectWxPatchModuleIds(code: string): string[] {
    const ids = new Set<string>()
    for (const match of code.matchAll(/create(?:Esm|Cjs)Initializer\("([^"]+)"/g)) ids.add(match[1])
    return [...ids]
}

function toStableModuleId(id: string, root: string): string {
    const normalizedId = id.replace(/\\/g, '/')
    if (normalizedId.startsWith('\0') || !path.posix.isAbsolute(normalizedId)) return normalizedId
    return path.posix.relative(root.replace(/\\/g, '/'), normalizedId)
}
