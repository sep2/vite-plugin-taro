import type { createResolver } from '../plugins/mini/resolve/resolver.ts'

/** Supplies native entry metadata around test-owned capsule sources without loading production shells. */
export function createMiniStyleEntries(
    appId: string,
    pageIds: readonly string[]
): Pick<ReturnType<typeof createResolver>, 'appEntry' | 'pageEntries'> {
    return {
        appEntry: {
            capsuleId: appId,
            capsuleName: 'app-capsule',
            shellId: `${appId}?shell`,
            shellName: 'app.js'
        },
        pageEntries: pageIds.map((capsuleId, index) => ({
            page: { path: `pages/page-${index}/index` },
            capsuleId,
            capsuleName: `pages/page-${index}/index-capsule`,
            shellId: `${capsuleId}?shell`,
            shellName: `pages/page-${index}/index.js`
        }))
    }
}
