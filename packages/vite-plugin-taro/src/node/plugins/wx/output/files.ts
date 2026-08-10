import type { Rolldown } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createNativeComponentOutput } from '../native/create-native-component-output.ts'
import type { GeneratedSubpackage } from '../placement/placer.ts'
import { createJsonAssets } from './json.ts'
import { createTemplateAssets } from './templates.ts'

/** Creates every compiler-owned WX file derived from the final Rolldown bundle. */
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
    const nativeOutput = await createNativeComponentOutput({ bundle, getModuleInfo })

    return [
        {
            type: 'asset',
            fileName: 'app.wxss',
            source: '@import "./assets/global.wxss";\n'
        },
        ...createJsonAssets({ options, subpackages, nativeComponents: nativeOutput.registrations }),
        ...createTemplateAssets(bundle, options, nativeOutput.registrations),
        ...nativeOutput.files
    ]
}
