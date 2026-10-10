import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../utils/packages.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'
import { isMiniWatchBuild } from '../mini/watch/is-mini-watch-build.ts'
import { createZfbSkeleton } from './create-zfb-skeleton.ts'

/** Adapts the shared Mini Program pipeline to the zfb public target. */
export function createZfbMiniPlugins(vptOptions: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(createZfbMiniContract(vptOptions))
}

/** Binds the shared Mini Program core to Alipay runtime and output conventions. */
export function createZfbMiniContract(vptOptions: VptOptions): MiniContract {
    const projectConfigFilename = 'mini.project.json'

    return {
        options: vptOptions,
        define: {},
        taro: {
            env: 'alipay',
            hostPath: resolveVptRuntime('mini/taro/template-host'),
            componentsReactPath: resolveTaroRuntime('plugin-platform-alipay/components-react'),
            targetRuntimePath: resolveTaroRuntime('plugin-platform-alipay/runtime')
        },
        runtime: {
            devtoolsHmrRuntime: resolveVptRuntime('zfb/dev/devtools-runtime'),
            interpreterHmrRuntime: resolveVptRuntime('zfb/dev/interpreter-runtime')
        },
        styles: {
            appFileName: 'app.acss',
            globalFileName: 'assets/global.acss'
        },
        output: {
            projectConfigFilename,
            projectPrivateConfigFilename: '.mini-ide/project-ide.json',
            generateProjectSkeleton: createZfbSkeleton
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
