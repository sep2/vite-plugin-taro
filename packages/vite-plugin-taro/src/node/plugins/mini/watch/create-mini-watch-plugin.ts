import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { VptJsonObject, VptTarget } from '../../../../options.ts'
import { cleanOutputFiles } from '../../../utils/clean-output-files.ts'
import { isMiniClientEnvironment } from '../dev/plugins.ts'
import type { MiniContract } from '../mini-contract.ts'
import { recursiveMerge } from '../skeleton/recursive-merge.ts'
import { createJsonAsset } from '../skeleton/skeleton-utils.ts'

// Keep native field names and file ownership explicit. Alipay's IDE preferences do not own developOptions.
const projectConfigOverrides: Readonly<Record<VptTarget, Readonly<Record<string, VptJsonObject>>>> = {
    wx: {
        // Project settings and private-config precedence:
        // https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html
        'project.config.json': { setting: { compileHotReLoad: false } },
        'project.private.config.json': { setting: { compileHotReLoad: false } }
    },
    zfb: {
        // Format 2 migrates enableHMR to developOptions.hotReload:
        // https://opendoc.alipay.com/mini/09j22u
        'mini.project.json': { developOptions: { hotReload: false } }
    },
    tt: {
        // TT documents the top-level toggle as compileHotReload, but shared/private setting uses compileHotReLoad.
        // https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/dev-tools/developer-instrument/compilation/hot-reload
        // https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/dev-tools/developer-instrument/development-assistance/private-config
        // Leave autoCompile untouched: watch output still needs automatic full recompilation.
        'project.config.json': { compileHotReload: false, setting: { compileHotReLoad: false } },
        'project.private.config.json': { setting: { compileHotReLoad: false } }
    },
    h5: {}
}

/** Preserves watched directories and forces full reloads for Mini Program watch output without changing serve HMR. */
export function createMiniWatchPlugin(contract: {
    options: Pick<MiniContract['options'], 'target'>
    output: Pick<MiniContract['output'], 'projectConfigFilename' | 'projectPrivateConfigFilename'>
}): Plugin {
    // Rolldown also closes an unsuccessful result when its watcher shuts down, without passing an error.
    // Track that lifecycle boundary so shutdown cannot publish a false completion marker.
    let closed = false

    return {
        name: 'vpt:mini-watch',
        enforce: 'post',
        // One-shot production, serve HMR and generate-only consumers keep their existing output policies.
        apply: (config, { command }) => {
            return (
                command === 'build' &&
                Boolean(config.build?.watch) &&
                config.build?.write !== false &&
                !config.build?.watch?.skipWrite
            )
        },
        applyToEnvironment: isMiniClientEnvironment,
        config() {
            // Vite already keeps the output root, but recursively removes its children. WeChat DevTools can keep stale
            // child buffers after unlinkDir/addDir: unlike individual unlink/change events, those events do not clear
            // its cached file contents. Preserve EVERY directory, not just dist/wx; unlink files once at startup.
            return { build: { emptyOutDir: false } }
        },
        configResolved({ root, build }) {
            // Retain DevTools project identity and local preferences while removing obsolete output. Later builds overwrite
            // files in place; obsolete files generated during this session remain until restart.
            cleanOutputFiles(path.resolve(root, build.outDir), [
                contract.output.projectConfigFilename,
                contract.output.projectPrivateConfigFilename
            ])
        },
        buildStart() {
            closed = false
        },
        closeWatcher() {
            closed = true
        },
        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                // Run after skeleton emission and change only output, so serve and one-shot builds retain user settings.
                // Override supported private preferences too, since they take precedence over shared settings in DevTools.
                for (const [fileName, overrides] of Object.entries(projectConfigOverrides[contract.options.target])) {
                    const asset = bundle[fileName]

                    if (asset?.type === 'asset') {
                        const config: VptJsonObject = JSON.parse(String(asset.source))
                        // Merge into a fresh record and mutate only this generation's asset, never caller configuration.
                        Object.assign(
                            asset,
                            createJsonAsset(
                                fileName,
                                recursiveMerge({}, config, overrides),
                                this.environment.config.isProduction
                            )
                        )
                    }
                }
            }
        },
        closeBundle: {
            order: 'post',
            sequential: true,
            handler(error) {
                // Vite 8 closes the watch result in its BUNDLE_END handler, after all output/writeBundle hooks finish.
                // buildEnd is too early: it precedes chunk rendering and disk writes. Failed closes must not signal success.
                if (error || closed) {
                    return
                }

                const { root, build } = this.environment.config
                const directory = path.resolve(root, build.outDir, 'hmr')

                mkdirSync(directory, { recursive: true })
                // DevTools distinguishes contentChange from a plain mtime change. Fresh random bytes provide a final
                // file event even after a no-edit restart, without counters, App rewrites or stable-name overrides.
                // This unreferenced comment-only file is a reload cue, not a dependency or a multi-file atomicity barrier.
                writeFileSync(path.join(directory, 'watch.js'), `// ${randomUUID()}\n`)
            }
        }
    }
}
