import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { isMiniClientEnvironment } from '../mini/dev/plugins.ts'

/** Adapts ordinary WeChat build/watch output; the serve HMR protocol and other targets are unchanged. */
export function createWxWatchPlugin(): Plugin {
    // Rolldown also closes an unsuccessful result when its watcher shuts down, without passing an error.
    // Track that lifecycle boundary so shutdown cannot publish a false completion marker.
    let closed = false

    return {
        name: 'vpt:wx-watch',
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

            mkdirSync(outDir, { recursive: true })
            // Keep normal content-hashed filenames, but remove obsolete chunks and native companions on every rebuild.
            // Unlink all files, including the previous hmr/watch.js; retaining directories does not mean retaining files.
            // This O(output entries) cleanup happens before compilation, so a failed build does NOT preserve good output.
            for (const entry of readdirSync(outDir, { recursive: true, withFileTypes: true })) {
                if (!entry.isDirectory()) {
                    unlinkSync(path.join(entry.parentPath, entry.name))
                }
            }
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
