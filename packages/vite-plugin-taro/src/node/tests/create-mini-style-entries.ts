import { resolveMiniPage } from '../plugins/mini/resolve/resolve-mini-page.ts'
import type { projectMiniStyles } from '../plugins/mini/styles/project-mini-styles.ts'

/** Supplies native entry metadata around test-owned capsule sources without loading production shells. */
export function createMiniStyleEntries(
    appId: string,
    pageIds: readonly string[],
    styleExtension: string
): Parameters<typeof projectMiniStyles>[0] {
    return {
        appEntry: {
            capsuleId: appId,
            capsuleName: 'app-capsule',
            shellId: `${appId}?shell`,
            shellName: 'app.js'
        },
        pageEntries: pageIds.map((capsuleId, index) => ({
            ...resolveMiniPage({ path: `pages/page-${index}/index` }, styleExtension),
            capsuleId,
            shellId: `${capsuleId}?shell`
        }))
    }
}
