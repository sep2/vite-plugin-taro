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
            componentsReactPath: packageRequire.resolve('@tarojs/plugin-platform-weapp/dist/components-react')
        },
        runtime: {
            globalObject: 'global',
            modules: {
                bootstrap: resolveRuntimeFile('wx/amphibious/bootstrap'),
                transport: resolveRuntimeFile('wx/amphibious/transport'),
                appShell: resolveRuntimeFile('wx/native/app'),
                appCapsule: resolveRuntimeFile('wx/capsule/app'),
                componentShell: resolveRuntimeFile('wx/native/component'),
                componentCapsule: resolveRuntimeFile('wx/capsule/component'),
                customWrapperShell: resolveRuntimeFile('wx/native/custom-wrapper'),
                pageShell: resolveRuntimeFile('wx/native/page'),
                pageCapsule: resolveRuntimeFile('wx/capsule/page'),
                devtoolsHmrRuntime: resolveRuntimeFile('wx/dev/modes/devtools/devtools-runtime'),
                interpreterHmrRuntime: resolveRuntimeFile('wx/dev/modes/interpreter/interpreter-runtime')
            }
        },
        styles: {
            appFileName: 'app.wxss',
            globalFileName: 'assets/global.wxss'
        },
        react: {},
        output: {
            subpackagePlanningBudget: 1_900_000
        }
    }
}
