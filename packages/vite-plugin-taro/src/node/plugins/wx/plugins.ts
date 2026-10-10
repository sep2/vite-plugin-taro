import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../utils/packages.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'
import { isMiniWatchBuild } from '../mini/watch/is-mini-watch-build.ts'
import { createWxSkeleton } from './create-wx-skeleton.ts'

/** Adapts the shared Mini Program pipeline to the WX public target. */
export function createWxMiniPlugins(vptOptions: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(createWxMiniContract(vptOptions))
}

/** Binds the shared Mini Program core to WeChat runtime and output conventions. */
export function createWxMiniContract(vptOptions: VptOptions): MiniContract {
    const projectConfigFilename = 'project.config.json'
    const projectPrivateConfigFilename = 'project.private.config.json'

    return {
        options: vptOptions,
        define: {},
        taro: {
            env: 'weapp',
            hostPath: resolveVptRuntime('mini/taro/template-host'),
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
            projectConfigFilename,
            projectPrivateConfigFilename,
            generateProjectSkeleton: createWxSkeleton
        },
        override: [
            // Private settings take precedence over the shared project config in WeChat DevTools.
            // https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html
            {
                apply: isMiniWatchBuild,
                name: projectConfigFilename,
                content: { setting: { compileHotReLoad: false } }
            },
            {
                apply: isMiniWatchBuild,
                name: projectPrivateConfigFilename,
                content: { setting: { compileHotReLoad: false } }
            }
        ]
    }
}
