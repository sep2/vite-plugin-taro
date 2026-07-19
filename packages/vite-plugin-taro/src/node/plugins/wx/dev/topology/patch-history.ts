import { type Observable, scan, shareReplay } from 'rxjs'
import type { Bootstrap, PatchHistory, RetainedPatch, SafePatch } from './types.ts'

/**
 * Retains safe DevEngine patches as one ordered prefix for the current physical build.
 *
 * ```text
 * safePatches$ → append immutable versioned patch → history$ (replayed current prefix)
 *
 * source edit ──> DevEngine patch ──> history only
 *                                      └── no update.js write
 * ```
 *
 * The history stream is the server's HMR memory. It is intentionally separate from physical publication: a later
 * runtime poll selects and materializes a range from this prefix.
 */
export function createPatchHistory$(
    bootstrap: Bootstrap,
    safePatches$: Observable<SafePatch>
): Observable<PatchHistory> {
    const initialHistory: PatchHistory = { buildId: bootstrap.buildId, patches: [] }
    return safePatches$.pipe(
        scan(
            (history, patch): PatchHistory => ({
                buildId: history.buildId,
                patches: [...history.patches, versionPatch(history.patches.length + 1, patch)]
            }),
            initialHistory
        ),
        shareReplay({ bufferSize: 1, refCount: false })
    )
}

/** Creates one immutable retained patch record at the next contiguous version. */
function versionPatch(version: number, patch: SafePatch): RetainedPatch {
    return { patch, version }
}
