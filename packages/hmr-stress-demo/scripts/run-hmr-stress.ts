import fs from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const markerPath = fileURLToPath(new URL('../src/components/hmr-marker.ts', import.meta.url))
const markerPattern = /export const hmrMarker = '[^']*'/

function readPositiveInteger(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback)
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`)
    }
    return value
}

function replaceMarker(source: string, marker: string): string {
    const changed = source.replace(markerPattern, `export const hmrMarker = '${marker}'`)
    if (changed === source) {
        throw new Error(`Unable to replace HMR marker in ${markerPath}`)
    }
    return changed
}

const updateCount = readPositiveInteger('VPT_HMR_STRESS_UPDATES', 30)
const intervalMs = readPositiveInteger('VPT_HMR_STRESS_INTERVAL_MS', 180)
const settleMs = readPositiveInteger('VPT_HMR_STRESS_SETTLE_MS', 1500)
const originalSource = await fs.readFile(markerPath, 'utf8')
const generations = Array.from({ length: updateCount }, (_, index) => index + 1)

console.log(`[hmr-stress] publishing ${updateCount} edits every ${intervalMs}ms`)

try {
    for (const generation of generations) {
        const marker = `stress-${String(generation).padStart(3, '0')}`
        await fs.writeFile(markerPath, replaceMarker(originalSource, marker))
        console.log(`[hmr-stress] wrote ${marker}`)
        await delay(intervalMs)
    }
} finally {
    // Give the engine a distinct restoration generation after the edit backlog drains. Writing
    // the original immediately after the last stress value can be coalesced into that in-flight
    // file event, leaving the simulator on the final stress marker even though disk is baseline.
    await fs.writeFile(markerPath, replaceMarker(originalSource, 'stress-restoring'))
    console.log('[hmr-stress] wrote stress-restoring')
    await delay(settleMs)
    await fs.writeFile(markerPath, originalSource)
    console.log('[hmr-stress] restored baseline source')
}

await delay(settleMs)
console.log('[hmr-stress] complete')
