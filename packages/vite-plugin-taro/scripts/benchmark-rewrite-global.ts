import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { RolldownMagicString } from 'rolldown'
import { parseSync } from 'rolldown/utils'
import { rewriteGlobal } from '../src/node/plugins/mini/global/rewrite-global.ts'

const require = createRequire(import.meta.url)
const reconcilerRoot = dirname(require.resolve('react-reconciler/package.json'))
const fixtures = [
    ...[1000, 2000, 4000, 8000].map((count) => ({
        name: `sibling scopes (${count})`,
        // Many live module names plus repeated locals expose delete/reinsert rehashing, unlike deeply nested scopes.
        code: Array.from(
            { length: count },
            (_, index) => `function run${index}(local) { const next = local + 1; return next; }`
        ).join('\n')
    })),
    { name: 'free reads', code: 'Math.max(slot, 1);\n'.repeat(10000) },
    { name: 'free writes', code: 'slot += other;\n'.repeat(10000) },
    {
        name: 'React reconciler',
        code: readFileSync(join(reconcilerRoot, 'cjs/react-reconciler.development.js'), 'utf8')
    }
]

// Report warm medians without timing assertions: machine load must not make correctness tests flaky.
console.log('rewriteGlobal only; excludes parsing, editor creation, printing and source maps')
console.table(
    fixtures.map(({ name, code }) => ({
        fixture: name,
        'source KiB': (Buffer.byteLength(code) / 1024).toFixed(1),
        'median ms': measure(code).toFixed(2)
    }))
)

function measure(code: string): number {
    const parsed = parseSync('benchmark.js', code, { sourceType: 'module' })
    assert.deepEqual(parsed.errors, [])
    const sample = () => {
        // Each sample owns its mutable editor; the parsed AST is reused and must remain unchanged.
        const editor = new RolldownMagicString(code)
        const start = performance.now()
        rewriteGlobal(parsed.program, editor)
        return performance.now() - start
    }
    // Warm the implementation before collecting the samples used for the median.
    for (let iteration = 0; iteration < 5; iteration++) {
        sample()
    }
    return Array.from({ length: 15 }, sample).toSorted((left, right) => left - right)[7]
}
