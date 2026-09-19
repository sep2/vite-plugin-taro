import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { packageRequire, resolveRuntimeFile } from '../../utils/packages.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'
import { createTtSkeleton } from './create-tt-skeleton.ts'

/** Adapts the shared Mini Program pipeline to TikTok. */
export function createTtMiniPlugins(options: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(createTtMiniContract(options))
}

/** Binds TT's runtime, native templates, styles, and socket transport to the shared compiler. */
export function createTtMiniContract(options: VptOptions): MiniContract {
    const componentsReactPath = packageRequire.resolve('vite-plugin-taro-runtime/plugin-platform-tt/components-react')

    return {
        options,
        taro: {
            env: 'tt',
            componentsReactPath,
            targetRuntimePath: resolveRuntimeFile('tt/taro-runtime')
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
                devtoolsHmrRuntime: resolveRuntimeFile('tt/dev/devtools-runtime'),
                interpreterHmrRuntime: resolveRuntimeFile('tt/dev/interpreter-runtime')
            }
        },
        styles: {
            appFileName: 'app.ttss',
            globalFileName: 'assets/global.ttss'
        },
        output: {
            generateProjectSkeleton(input) {
                return createTtSkeleton({ ...input, options, componentsModulePath: componentsReactPath })
            }
        }
    }
}
