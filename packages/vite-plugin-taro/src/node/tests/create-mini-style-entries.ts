import type { createResolver } from '../plugins/mini/resolve/resolver.ts'

/** Supplies native entry metadata around test-owned capsule sources without loading production shells. */
export function createMiniStyleEntries(
    appId: string,
    pageIds: readonly string[]
): ReturnType<typeof createResolver>['entries'] {
    return {
        appEntries: {
            capsuleId: appId,
            capsuleName: 'app-capsule',
            shellId: `${appId}?shell`,
            shellName: 'app.js'
        },
        pageEntries: pageIds.map((capsuleId, index) => ({
            capsuleId,
            capsuleName: `pages/page-${index}/index-capsule`,
            shellId: `${capsuleId}?shell`,
            shellName: `pages/page-${index}/index.js`
        }))
    }
}
