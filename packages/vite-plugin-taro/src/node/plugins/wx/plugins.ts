import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../utils/packages.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'
import { createWxSkeleton } from './create-wx-skeleton.ts'

/** Adapts the shared Mini Program pipeline to the WX public target. */
export function createWxMiniPlugins(vptOptions: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(createWxMiniContract(vptOptions))
}

/** Binds the shared Mini Program core to WeChat runtime and output conventions. */
export function createWxMiniContract(vptOptions: VptOptions): MiniContract {
    return {
        options: vptOptions,
        taro: {
            env: 'weapp',
            componentsReactPath: resolveTaroRuntime('plugin-platform-weapp/components-react'),
            targetRuntimePath: resolveTaroRuntime('plugin-platform-weapp/runtime')
        },
        runtime: {
            devtoolsHmrRuntime: resolveVptRuntime('wx/dev/devtools-runtime'),
            interpreterHmrRuntime: resolveVptRuntime('wx/dev/interpreter-runtime')
        },
        styles: {
            appFileName: 'app.wxss',
            globalFileName: 'assets/global.wxss'
        },
        output: {
            projectConfigFilename: 'project.config.json',
            projectPrivateConfigFilename: 'project.private.config.json',
            generateProjectSkeleton: createWxSkeleton
        },
        watch: {
            override: {
                // Private settings take precedence over the shared project config in WeChat DevTools.
                // https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html
                'project.config.json': { setting: { compileHotReLoad: false } },
                'project.private.config.json': { setting: { compileHotReLoad: false } }
            }
        }
    }
}
