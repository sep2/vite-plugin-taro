import type { ResolvedPage } from '../../page/resolve-page.ts'
import { miniPageCapsuleId, miniPageShellId } from '../module/module.ts'

/** The shell and configuration capsule emitted for one public page route. */
export function createMiniPageEntry(page: ResolvedPage) {
    const query = `?route=${encodeURIComponent(page.route)}`
    return {
        page,
        capsuleId: miniPageCapsuleId + query,
        capsuleName: `${page.route}-capsule`,
        shellId: miniPageShellId + query,
        shellName: `${page.route}.js`
    }
}

export type MiniPageEntry = ReturnType<typeof createMiniPageEntry>
