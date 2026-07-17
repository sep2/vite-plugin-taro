import type { Rolldown } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import type { CssPipeline } from '../../css/css-pipeline.ts'
import { createTransport } from '../transport/create-transport.ts'
import { createJsonAssets } from './create-json-assets.ts'
import { createTemplateAssets } from './create-template-assets.ts'

/** Creates native files from the final bundle. */
export async function generateBundle(
    bundle: Rolldown.OutputBundle,
    options: VitePluginTaroOptions,
    cssPipeline: CssPipeline
): Promise<Rolldown.EmittedFile[]> {
    return [
        createTransport(bundle),
        ...createJsonAssets(options),
        ...(await createTemplateAssets(bundle, options, cssPipeline))
    ]
}
