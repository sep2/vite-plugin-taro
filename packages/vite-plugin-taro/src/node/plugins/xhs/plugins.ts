import type { PluginOption } from 'vite'
import type { VptOptions } from '../../../options.ts'
import { resolveTaroRuntime, resolveVptRuntime } from '../../utils/packages.ts'
import type { MiniContract } from '../mini/mini-contract.ts'
import { createMiniTargetPlugins } from '../mini/plugins.ts'
import { isMiniWatchBuild } from '../mini/watch/is-mini-watch-build.ts'
import { createXhsSkeleton } from './create-xhs-skeleton.ts'

/** Creates Xiaohongshu's template compiler with object-form native Page initialization. */
export function createXhsMiniPlugins(options: VptOptions): PluginOption[] {
    return createMiniTargetPlugins(
        createXhsMiniContract({
            ...options,
            // XHS Page data is a native JSON object; React mounts through the shared onLoad barrier.
            pages: options.pages.map((page) => ({ ...page, prerender: false }))
        })
    )
}

/** Binds XHS templates, CSS, native APIs, and development transports to the shared compiler. */
export function createXhsMiniContract(options: VptOptions): MiniContract {
    const projectConfigFilename = 'project.config.json'
    const projectPrivateConfigFilename = 'project.private.config.json'

    return {
        options,
        define: {},
        taro: {
            env: 'xhs',
            hostPath: resolveVptRuntime('mini/template/template-host'),
            componentsReactPath: resolveTaroRuntime('plugin-platform-xhs/components-react'),
            targetRuntimePath: resolveVptRuntime('xhs/taro-runtime')
        },
        runtime: {
            devtoolsHmrRuntime: resolveVptRuntime('xhs/dev/devtools-runtime'),
            interpreterHmrRuntime: resolveVptRuntime('xhs/dev/interpreter-runtime')
        },
        styles: {
            appFileName: 'app.css',
            globalFileName: 'assets/global.css'
        },
        output: {
            projectConfigFilename,
            projectPrivateConfigFilename,
            generateProjectSkeleton: createXhsSkeleton
        },
        // Shared and private settings use XHS's native compileHotReload spelling.
        override: [projectConfigFilename, projectPrivateConfigFilename].map((name) => ({
            apply: isMiniWatchBuild,
            name,
            content: { setting: { compileHotReload: false } }
        }))
    }
}
