import type { Rolldown } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createNativeComponentOutputFiles } from '../native/create-native-component-output-files.ts'
import type { GeneratedSubpackage } from '../placement/placer.ts'
import { createJsonAssets } from './json.ts'
import { createTemplateAssets } from './templates.ts'

/** Creates every native companion file derived from the final Rolldown bundle. */
export async function createOutputFiles({
    bundle,
    options,
    subpackages,
    getModuleInfo
}: {
    bundle: Rolldown.OutputBundle
    options: VitePluginTaroOptions
    subpackages: readonly GeneratedSubpackage[]
    getModuleInfo: (moduleId: string) => { meta: Rolldown.CustomPluginOptions } | null
}): Promise<Rolldown.EmittedFile[]> {
    return [
        ...createJsonAssets({ options, subpackages }),
        ...createTemplateAssets(bundle, options),
        ...(await createNativeComponentOutputFiles({ bundle, getModuleInfo }))
    ]
}
