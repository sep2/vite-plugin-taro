import type { Rolldown } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import type { GeneratedSubpackage } from '../placement/placer.ts'
import { createJsonAssets } from './json.ts'
import { createTemplateAssets } from './templates.ts'

/** Creates every native companion file derived from the final Rolldown bundle. */
export function createOutputFiles({
    bundle,
    options,
    subpackages
}: {
    bundle: Rolldown.OutputBundle
    options: VitePluginTaroOptions
    subpackages: readonly GeneratedSubpackage[]
}): Rolldown.EmittedFile[] {
    return [...createJsonAssets({ options, subpackages }), ...createTemplateAssets(bundle, options)]
}
