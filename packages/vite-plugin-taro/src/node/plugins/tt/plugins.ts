import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../utils/packages.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'
import { createTtSkeleton } from './create-tt-skeleton.ts'

/** Adapts the shared Mini Program pipeline to TikTok. */
export function createTtMiniPlugins(options: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(createTtMiniContract(options))
}

/** Binds TT's runtime, native templates, styles, and socket transport to the shared compiler. */
export function createTtMiniContract(options: VptOptions): MiniContract {
    return {
        options,
        taro: {
            env: 'tt',
            componentsReactPath: resolveTaroRuntime('plugin-platform-tt/components-react'),
            targetRuntimePath: resolveVptRuntime('tt/taro-runtime')
        },
        runtime: {
            devtoolsHmrRuntime: resolveVptRuntime('tt/dev/devtools-runtime'),
            interpreterHmrRuntime: resolveVptRuntime('tt/dev/interpreter-runtime')
        },
        styles: {
            appFileName: 'app.ttss',
            globalFileName: 'assets/global.ttss'
        },
        output: {
            projectConfigFilename: 'project.config.json',
            projectPrivateConfigFilename: 'project.private.config.json',
            generateProjectSkeleton: createTtSkeleton
        },
        watch: {
            override: {
                // Top-level compileHotReload and shared/private compileHotReLoad use distinct spellings.
                // Leave autoCompile untouched so watch output still triggers automatic full recompilation.
                // https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/dev-tools/developer-instrument/compilation/hot-reload
                // https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/dev-tools/developer-instrument/development-assistance/private-config
                'project.config.json': { compileHotReload: false, setting: { compileHotReLoad: false } },
                'project.private.config.json': { setting: { compileHotReLoad: false } }
            }
        }
    }
}
