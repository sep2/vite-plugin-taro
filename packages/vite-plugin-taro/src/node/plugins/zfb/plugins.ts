import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { packageRequire, resolveRuntimeFile } from '../../utils/packages.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'
import { createZfbSkeleton } from './create-zfb-skeleton.ts'
import { transformZfbOptions } from './transform-zfb-options.ts'

/** Adapts the shared Mini Program pipeline to the zfb public target. */
export function createZfbMiniPlugins(vptOptions: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(createZfbMiniContract(vptOptions))
}

/** Binds the shared Mini Program core to Alipay runtime and output conventions. */
export function createZfbMiniContract(vptOptions: VptOptions): MiniContract {
    const options = transformZfbOptions(vptOptions)
    const componentsReactPath = packageRequire.resolve('@tarojs/plugin-platform-alipay/dist/components-react.js')

    return {
        options: options,
        taro: {
            env: 'alipay',
            componentsReactPath: componentsReactPath,
            platformRuntimePath: packageRequire.resolve('@tarojs/plugin-platform-alipay/dist/runtime.js')
        },
        runtime: {
            modules: {
                bootstrap: resolveRuntimeFile('mini/amphibious/bootstrap'),
                transport: resolveRuntimeFile('mini/amphibious/transport'),
                appShell: resolveRuntimeFile('mini/native/app'),
                appCapsule: resolveRuntimeFile('mini/capsule/app'),
                componentShell: resolveRuntimeFile('mini/native/component'),
                componentCapsule: resolveRuntimeFile('mini/capsule/component'),
                customWrapperShell: resolveRuntimeFile('mini/native/custom-wrapper'),
                pageShell: resolveRuntimeFile('mini/native/page'),
                pageCapsule: resolveRuntimeFile('mini/capsule/page'),
                devtoolsHmrRuntime: resolveRuntimeFile('zfb/dev/devtools-runtime'),
                interpreterHmrRuntime: resolveRuntimeFile('zfb/dev/interpreter-runtime')
            }
        },
        styles: {
            appFileName: 'app.acss',
            globalFileName: 'assets/global.acss'
        },
        output: {
            generateProjectSkeleton(input) {
                return createZfbSkeleton({
                    ...input,
                    options: options,
                    componentsModulePath: componentsReactPath
                })
            }
        }
    }
}
