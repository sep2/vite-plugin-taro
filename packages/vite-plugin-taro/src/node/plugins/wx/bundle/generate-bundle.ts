import type { Rolldown } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import type { GeneratedSubpackage } from '../placer/placer.ts'
import { createJsonAssets } from './create-json-assets.ts'
import { createTemplateAssets } from './create-template-assets.ts'

/** Creates native files from the final bundle. */
export function generateBundle({
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
