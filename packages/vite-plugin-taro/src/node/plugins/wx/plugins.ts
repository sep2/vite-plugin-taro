import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { packageRequire, resolveRuntimeFile } from '../../utils/packages.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'

/** Adapts the shared Mini Program pipeline to the WX public target. */
export function createWxMiniPlugins(vptOptions: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(createMiniContract(vptOptions))
}

/** Creates the shared Mini Program contract for a WX target invocation. */
export function createMiniContract(vptOptions: VptOptions): MiniContract {
    return {
        options: vptOptions,
        taro: {
            env: 'weapp',
            componentsReactPath: packageRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react'),
            platformRuntimePath: packageRequire.resolve('@tarojs/plugin-platform-weapp/dist/runtime.js')
        },
        runtime: {
            globalObject: 'global',
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
                devtoolsHmrRuntime: resolveRuntimeFile('wx/dev/devtools-runtime'),
                interpreterHmrRuntime: resolveRuntimeFile('wx/dev/interpreter-runtime')
            }
        },
        styles: {
            appFileName: 'app.wxss',
            globalFileName: 'assets/global.wxss'
        },
        output: {
            subpackagePlanningBudget: 1_900_000
        }
    }
}
