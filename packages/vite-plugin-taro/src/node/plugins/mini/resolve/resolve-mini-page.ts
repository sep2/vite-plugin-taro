import type { VptPageOption } from '../../../../options.ts'
import { type ResolvedPage, resolvePage } from '../../page/resolve-page.ts'
import { miniPageCapsuleId, miniPageShellId } from '../module/module.ts'

export interface MiniResolvedPage extends ResolvedPage {
    readonly capsuleId: string
    readonly capsuleName: string
    readonly shellId: string
    readonly shellName: string
}

/** Resolves the public route and both native build entries for one page declaration. */
export function resolveMiniPage(option: VptPageOption): MiniResolvedPage {
    const { route } = resolvePage(option)
    const query = `?route=${encodeURIComponent(route)}`

    return {
        route,
        option,
        capsuleId: miniPageCapsuleId + query,
        capsuleName: `${route}-capsule`,
        shellId: miniPageShellId + query,
        shellName: `${route}.js`
    }
}
