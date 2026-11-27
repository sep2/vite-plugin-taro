import type { VptPageOption } from '../../../options.ts'

/** Public route paired with the original page declaration. */
export type ResolvedPage = Readonly<{ route: string; option: VptPageOption }>

export function resolvePage(option: VptPageOption): ResolvedPage {
    return { route: option.subpackage ? `${option.subpackage}/${option.path}` : option.path, option }
}
