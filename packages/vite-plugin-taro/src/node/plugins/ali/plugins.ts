import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../utils/packages.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'
import { isMiniWatchBuild } from '../mini/watch/is-mini-watch-build.ts'
import { createAliCustomTabBarPlugin } from './create-ali-custom-tab-bar-plugin.ts'
import { createAliSkeleton } from './create-ali-skeleton.ts'
import { createTbHmrPlugin } from './create-tb-hmr-plugin.ts'

/** Shares the AXML compiler between Alipay and Taobao. */
export function createAliMiniPlugins(vptOptions: VptOptions): PluginOption[] {
    const contract = createAliMiniContract(vptOptions)

    return [
        createMiniTargetPlugins(contract),
        createAliCustomTabBarPlugin(contract),
        vptOptions.target === 'tb' && createTbHmrPlugin()
    ]
}

/** Shares the Alipay Taro runtime and selects each target’s development transport and output settings. */
export function createAliMiniContract(vptOptions: VptOptions): MiniContract {
    const projectConfigFilename = 'mini.project.json'

    const target = vptOptions.target

    return {
        options: vptOptions,
        define: {},
        taro: {
            env: 'alipay',
            hostPath: resolveVptRuntime('mini/template/template-host'),
            componentsReactPath: resolveTaroRuntime('plugin-platform-alipay/components-react'),
            targetRuntimePath: resolveTaroRuntime('plugin-platform-alipay/runtime')
        },
        runtime: {
            devtoolsHmrRuntime: resolveVptRuntime(`${target}/dev/devtools-runtime`),
            interpreterHmrRuntime: resolveVptRuntime(`${target}/dev/interpreter-runtime`)
        },
        styles: {
            appFileName: 'app.acss',
            globalFileName: 'assets/global.acss'
        },
        output: {
            projectConfigFilename,
            projectPrivateConfigFilename: '.mini-ide/project-ide.json',
            generateProjectSkeleton: createAliSkeleton
        },
        override: [
            // Format 2 migrates enableHMR to developOptions.hotReload; IDE preferences do not own this field.
            // https://opendoc.alipay.com/mini/09j22u
            {
                apply: isMiniWatchBuild,
                name: projectConfigFilename,
                content: { developOptions: { hotReload: false } }
            }
        ]
    }
}
