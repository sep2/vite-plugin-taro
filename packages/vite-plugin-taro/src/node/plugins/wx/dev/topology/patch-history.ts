import { type Observable, scan, shareReplay, startWith } from 'rxjs'
import type { PatchHistory, RetainedPatch, SafePatch } from './types.ts'

/**
 * Retains safe DevEngine patches as one ordered prefix for an active build epoch.
 *
 * ```text
 * safe patches → append immutable versioned patch → replayed history
 *                                                └── never writes update.js
 * ```
 *
 * Build identity is owned by the enclosing epoch scope, not repeated in every history value. The initial empty prefix is
 * replayed immediately so a version-zero runtime poll can wait for the next patch without special handling.
 */
export function createPatchHistory$(safePatches$: Observable<SafePatch>): Observable<PatchHistory> {
    const initialHistory: PatchHistory = { patches: [] }
    return safePatches$.pipe(
        scan(
            (history, patch): PatchHistory => ({
                patches: [...history.patches, versionPatch(history.patches.length + 1, patch)]
            }),
            initialHistory
        ),
        startWith(initialHistory),
        shareReplay({ bufferSize: 1, refCount: true })
    )
}

/** Creates one immutable retained patch record at the next contiguous version. */
function versionPatch(version: number, patch: SafePatch): RetainedPatch {
    return { patch, version }
}
