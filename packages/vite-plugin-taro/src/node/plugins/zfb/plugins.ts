import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { packageRequire, resolveRuntimeFile } from '../../utils/packages.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'
import { createZfbSkeleton } from './create-zfb-skeleton.ts'

/** Adapts the shared Mini Program pipeline to the zfb public target. */
export function createZfbMiniPlugins(vptOptions: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(createZfbMiniContract(vptOptions))
}

/** Binds the shared Mini Program core to Alipay runtime and output conventions. */
export function createZfbMiniContract(vptOptions: VptOptions): MiniContract {
    return {
        options: vptOptions,
        taro: {
            env: 'alipay',
            componentsReactPath: packageRequire.resolve(
                'vite-plugin-taro-runtime/plugin-platform-alipay/components-react'
            ),
            targetRuntimePath: packageRequire.resolve('vite-plugin-taro-runtime/plugin-platform-alipay/runtime')
        },
        runtime: {
            devtoolsHmrRuntime: resolveRuntimeFile('zfb/dev/devtools-runtime'),
            interpreterHmrRuntime: resolveRuntimeFile('zfb/dev/interpreter-runtime')
        },
        styles: {
            appFileName: 'app.acss',
            globalFileName: 'assets/global.acss'
        },
        output: {
            projectConfigFilename: 'mini.project.json',
            projectPrivateConfigFilename: '.mini-ide/project-ide.json',
            generateProjectSkeleton: createZfbSkeleton
        }
    }
}
