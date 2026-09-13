import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { cleanOutputFiles } from '../../../utils/clean-output-files.ts'
import { isMiniClientEnvironment } from '../dev/plugins.ts'

/** Preserves watched directories and signals completed Mini Program watch output without changing serve HMR. */
export function createMiniWatchPlugin(): Plugin {
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
            // its cached file contents. Preserve EVERY directory, not just dist/wx; unlink the files explicitly below.
            return { build: { emptyOutDir: false } }
        },
        buildStart() {
            closed = false

            const { root, build } = this.environment.config
            const outDir = path.resolve(root, build.outDir)

            // Remove obsolete chunks, native companions and the prior marker without replacing watched directories.
            // Cleanup happens before compilation, so a failed build does NOT preserve good output.
            cleanOutputFiles(outDir)
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
