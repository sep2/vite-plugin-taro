import type { Rolldown } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { materializeTransport } from '../transport/materialize-transport.ts'
import { createJsonAssets } from './create-json-assets.ts'
import { createTemplateAssets } from './create-template-assets.ts'

/** Creates native files from the final bundle. */
export async function generateBundle(
    bundle: Rolldown.OutputBundle,
    options: VitePluginTaroOptions
): Promise<Rolldown.EmittedFile[]> {
    await materializeTransport(bundle)

    return [...createJsonAssets(options), ...createTemplateAssets(bundle, options)]
}
