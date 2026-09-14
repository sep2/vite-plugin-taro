import fs from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

export type HmrEditProfile = Readonly<{
    intervalMilliseconds: number
    updateCount: number
}>

/** Publishes source generations only inside the disposable fixture owned by the DevTools harness. */
export async function publishHmrEdits(
    markerPath: string,
    profile: HmrEditProfile,
    waitForMarker: (marker: string) => Promise<void>
): Promise<void> {
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
        try {
            await fs.writeFile(
                markerPath,
                replaceMarker(originalSource, markerPattern, outletPositionPattern, 'stress-restoring', false)
            )
            // Observe a non-baseline generation before restoring. Otherwise a baseline
            // assertion can pass against the untouched runtime before any patch applies.
            await waitForMarker('stress-restoring')
        } finally {
            await fs.writeFile(markerPath, originalSource)
        }
    }

    await waitForMarker('baseline')
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
