import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build, normalizePath } from 'vite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const casesFile = normalizePath(path.join(projectRoot, 'src/polyfill-cases.ts'))

for (const target of ['wx', 'zfb', 'tt']) {
    for (const minify of [false, true]) {
        test(`${target}: emitted checks retain bare API calls with minify ${minify}`, async () => {
            // The real Vite config reads the target and changes NODE_ENV; restore both after this isolated build.
            const previousEnv = process.env
            process.env = { ...previousEnv, NODE_ENV: 'production', VITE_VPT_TARGET: target }
            try {
                const result = await build({
                    root: projectRoot,
                    configFile: path.join(projectRoot, 'vite.config.ts'),
                    logLevel: 'silent',
                    build: { write: false, minify }
                })
                assert.ok(!Array.isArray(result) && 'output' in result)
                const checks = result.output.find(
                    (entry) => entry.type === 'chunk' && entry.moduleIds.some((id) => normalizePath(id) === casesFile)
                )
                assert.ok(checks?.type === 'chunk')

                // Match executed call syntax, not the human-readable API names in check descriptions.
                for (const call of [
                    /\bnew\s+URL\s*\(/,
                    /\bnew\s+URLSearchParams\s*\(/,
                    /\bnew\s+Map\s*\(/,
                    /\bnew\s+Date\s*\(/,
                    /(?<![\w$.])Object\.fromEntries\s*\(/,
                    /(?<![\w$.])Promise\.allSettled\s*\(/,
                    /(?<![\w$.])Promise\.any\s*\(/,
                    /(?<![\w$.])structuredClone\s*\(/,
                    /(?<![\w$.])queueMicrotask\s*\(/
                ]) {
                    assert.match(checks.code, call)
                }
            } finally {
                process.env = previousEnv
            }
        })
    }
}
