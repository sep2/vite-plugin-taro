import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Plugin } from 'vite'
import { createStableOutputOptions } from '../output/create-stable-output-options.ts'
import { writeDevelopmentFile } from './hmr-files.ts'
import { isMiniClientEnvironment } from './plugins.ts'

/** Publishes ordinary build/watch output to a live native project without installing the serve HMR protocol. */
export function createMiniWatchPlugin(): Plugin {
    // One client watch build owns this pending entry between generateBundle and writeBundle. Withholding the native shell
    // prevents Vite from first removing the previous completion stamp and triggering an App reload mid-publication.
    let appSource: string | undefined
    return {
        name: 'vpt:mini-watch',
        enforce: 'post',
        apply: (config, { command }) => command === 'build' && Boolean(config.build?.watch),
        applyToEnvironment: isMiniClientEnvironment,
        config() {
            // DevTools caches child files across directory recreation. A watched project must retain its directories,
            // including across watcher restarts; one-shot production builds keep Vite's normal cleanup behavior.
            return { build: { emptyOutDir: false } }
        },
        configResolved(config) {
            if (Array.isArray(config.build.rolldownOptions.output)) {
                throw new Error('Mini Program watch requires one configured Rolldown output.')
            }
        },
        buildStart() {
            appSource = undefined
        },
        outputOptions: {
            order: 'post',
            handler(options) {
                // Share the serve adapter's normalization, including callback patterns and native entry filenames.
                return { ...options, ...createStableOutputOptions(options) }
            }
        },
        generateBundle: {
            order: 'post',
            handler(_options, bundle, isWrite) {
                // A generate-only consumer still needs the complete bundle; ownership transfers only for physical writes.
                if (!isWrite) {
                    return
                }
                const entry = Object.entries(bundle).find(([, output]) => output.fileName === 'app.js')
                if (entry?.[1].type !== 'chunk') {
                    throw new Error('Mini Program watch output requires an app.js entry chunk.')
                }
                appSource = entry[1].code
                // Only the native App shell changes ownership. All dependencies, lazy chunks, companions, and assets remain
                // Rolldown-owned output. Removing an in-memory entry does not delete the previous physical App file.
                delete bundle[entry[0]]
            }
        },
        writeBundle: {
            order: 'post',
            sequential: true,
            async handler() {
                if (appSource === undefined) {
                    throw new Error('Mini Program watch has no completed App entry to publish.')
                }
                const config = this.environment.config
                const outDir = path.resolve(config.root, config.build.outDir)
                // Stable filenames leave the App entry byte-identical when only a lazy capsule changes. DevTools can then
                // retain an incomplete lazy-module registration even after every output is durable. Publish a distinct App
                // entry only after Vite and preceding write hooks finish. This is a native reload signal, not an App JSON
                // rewrite or a claim that the multi-file build is atomic. A fresh identity also covers no-edit restarts.
                // The shared atomic-file writer avoids exposing a truncated App entry and never replaces its directory.
                await writeDevelopmentFile(outDir, 'app.js', `${appSource}\n// vpt-build:${randomUUID()}\n`)
            }
        }
    }
}
