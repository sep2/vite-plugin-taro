import type { projectMiniStyles } from '../plugins/mini/styles/project-mini-styles.ts'

import { resolvePage } from '../plugins/page/resolve-page.ts'

/** Supplies native entry metadata around test-owned capsule sources without loading production shells. */
export function createMiniStyleEntries(
    appId: string,
    pageIds: readonly string[]
): Parameters<typeof projectMiniStyles>[0] {
    return {
        appEntry: {
            capsuleId: appId,
            capsuleName: 'app-capsule',
            shellId: `${appId}?shell`,
            shellName: 'app.js'
        },
        pageEntries: pageIds.map((capsuleId, index) => ({
            page: resolvePage({ path: `pages/page-${index}/index` }),
            capsuleId,
            capsuleName: `pages/page-${index}/index-capsule`,
            shellId: `${capsuleId}?shell`,
            shellName: `pages/page-${index}/index.js`
        }))
    }
}
