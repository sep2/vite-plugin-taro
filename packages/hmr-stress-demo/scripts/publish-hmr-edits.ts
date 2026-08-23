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
    const outletPositionPattern = /export const appOutletFirst = (?:true|false)/
    const generations = Array.from({ length: profile.updateCount }, (_, index) => index + 1)

    console.log(
        `[hmr-stress] publishing ${profile.updateCount} temporary edits every ${profile.intervalMilliseconds}ms`
    )
    try {
        for (const generation of generations) {
            const marker = `stress-${String(generation).padStart(3, '0')}`
            await fs.writeFile(
                markerPath,
                replaceMarker(originalSource, markerPattern, outletPositionPattern, marker, generation % 2 === 0)
            )
            await delay(profile.intervalMilliseconds)
        }
    } finally {
        // Give Rolldown a distinct restoration generation after the burst drains. Restoring immediately can merge with the
        // final stress write at the filesystem layer and leave the running simulator on a value no longer present on disk.
        await fs.writeFile(
            markerPath,
            replaceMarker(originalSource, markerPattern, outletPositionPattern, 'stress-restoring', false)
        )
        await delay(profile.restorationDelayMilliseconds)
        await fs.writeFile(markerPath, originalSource)
    }

    // One bounded wait lets DevTools apply the baseline before assertions and avoids spawning a CLI process for every poll.
    await delay(profile.applicationDelayMilliseconds)
    console.log('[hmr-stress] restored disposable fixture baseline on disk')
}

function replaceMarker(
    source: string,
    markerPattern: RegExp,
    outletPositionPattern: RegExp,
    marker: string,
    appOutletFirst: boolean
): string {
    if (!markerPattern.test(source) || !outletPositionPattern.test(source)) {
        throw new Error('Unable to replace the disposable HMR marker')
    }
    return source
        .replace(markerPattern, `export const hmrMarker = '${marker}'`)
        .replace(outletPositionPattern, `export const appOutletFirst = ${appOutletFirst}`)
}
