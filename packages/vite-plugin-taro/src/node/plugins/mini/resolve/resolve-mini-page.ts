import type { VptPageOption } from '../../../../options.ts'
import { type ResolvedPage, resolvePage } from '../../page/resolve-page.ts'
import { miniPageCapsuleId, miniPageShellId, pageLoaderFileName } from '../module/module.ts'

export interface MiniResolvedPage extends ResolvedPage {
    readonly capsuleId: string
    readonly capsuleName: string
    readonly shellId: string
    readonly shellName: string
    readonly styleName: string
    readonly pageLoader: string | undefined
}

/** Resolves the public route, build entries and package-local loader from one page declaration. */
export function resolveMiniPage(option: VptPageOption, styleExtension: string): MiniResolvedPage {
    const { route } = resolvePage(option)
    const query = `?route=${encodeURIComponent(route)}`

    return {
        route,
        option,
        capsuleId: miniPageCapsuleId + query,
        capsuleName: `${route}-capsule`,
        shellId: miniPageShellId + query,
        shellName: `${route}.js`,
        styleName: route + styleExtension,
        pageLoader: option.subpackage ? pageLoaderFileName(option.subpackage) : undefined
    }
}
