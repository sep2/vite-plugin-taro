import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { cleanOutputFiles } from '../../../utils/clean-output-files.ts'
import { isMiniClientEnvironment } from '../dev/plugins.ts'
import type { MiniContract } from '../mini-contract.ts'
import { isMiniWatchBuild } from './is-mini-watch-build.ts'

/** Preserves watched directories and forces full reloads for Mini Program watch output without changing serve HMR. */
export function createMiniWatchPlugin(contract: {
    output: Pick<MiniContract['output'], 'projectConfigFilename' | 'projectPrivateConfigFilename'>
}): Plugin {
    // Rolldown also closes an unsuccessful result when its watcher shuts down, without passing an error.
    // Track that lifecycle boundary so shutdown cannot publish a false completion marker.
    let closed = false

    return {
        name: 'vpt:mini-watch',
        enforce: 'post',
        // One-shot production, serve HMR and generate-only consumers keep their existing output policies.
        apply({ build }, { command }) {
            return isMiniWatchBuild({ build, command })
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
