import fs from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

export type HmrEditProfile = Readonly<{
    applicationDelayMilliseconds: number
    intervalMilliseconds: number
    restorationDelayMilliseconds: number
    updateCount: number
}>

/** Publishes source generations only inside the disposable fixture owned by the DevTools harness. */
export async function publishHmrEdits(markerPath: string, profile: HmrEditProfile): Promise<void> {
    const originalSource = await fs.readFile(markerPath, 'utf8')
    const markerPattern = /export const hmrMarker = '[^']*'/
    const generations = Array.from({ length: profile.updateCount }, (_, index) => index + 1)

    console.log(
        `[hmr-stress] publishing ${profile.updateCount} temporary edits every ${profile.intervalMilliseconds}ms`
    )
    try {
        for (const generation of generations) {
            const marker = `stress-${String(generation).padStart(3, '0')}`
            await fs.writeFile(markerPath, replaceMarker(originalSource, markerPattern, marker))
            await delay(profile.intervalMilliseconds)
        }
    } finally {
        // Give Rolldown a distinct restoration generation after the burst drains. Restoring immediately can merge with the
        // final stress write at the filesystem layer and leave the running simulator on a value no longer present on disk.
        await fs.writeFile(markerPath, replaceMarker(originalSource, markerPattern, 'stress-restoring'))
        await delay(profile.restorationDelayMilliseconds)
        await fs.writeFile(markerPath, originalSource)
    }

    // One bounded wait lets DevTools apply the baseline before assertions and avoids spawning a CLI process for every poll.
    await delay(profile.applicationDelayMilliseconds)
    console.log('[hmr-stress] restored disposable fixture baseline on disk')
}

function replaceMarker(source: string, pattern: RegExp, marker: string): string {
    const changed = source.replace(pattern, `export const hmrMarker = '${marker}'`)
    if (changed === source) {
        throw new Error('Unable to replace the disposable HMR marker')
    }
    return changed
}
