import type { Rolldown } from 'vite'
import type { VitePluginTaroOptions } from '../../../../options.ts'
import { createTransport } from '../transport/create-transport.ts'
import { createJsonAssets } from './create-json-assets.ts'
import { createTemplateAssets } from './create-template-assets.ts'

/** Creates native files from the final bundle. */
export function generateBundle(bundle: Rolldown.OutputBundle, options: VitePluginTaroOptions): Rolldown.EmittedFile[] {
    return [createTransport(bundle), ...createJsonAssets(options), ...createTemplateAssets(bundle, options)]
}
