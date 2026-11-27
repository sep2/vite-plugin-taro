import assert from 'node:assert/strict'
import test from 'node:test'
import { disableRolldownLazyLoading } from './disable-rolldown-lazy-loading.ts'

const filename = 'experimental-runtime.mjs'
const lazyRequest = `import(\`/@vite/lazy?id=\${id}\`)`

test('edits only the browser lazy request on DevRuntime', () => {
    const otherClass = `class Other { loadLazyChunk(id) { return ${lazyRequest} } }`
    const otherMethod = `loadFeature(id) { return ${lazyRequest} }`
    const runtime = `var DevRuntime = class { ${otherMethod}; loadLazyChunk(id) { return ${lazyRequest} } };`
    const result = disableRolldownLazyLoading([otherClass, runtime].join('\n'), filename)
    assert.equal(
        result,
        `${otherClass}\nvar DevRuntime = class { ${otherMethod}; loadLazyChunk(id) { return Promise.reject(new Error('Mini Program development uses an eager module graph.')) } };`
    )
})

test('reports an incompatible upstream loader instead of rewriting a different method or request', () => {
    for (const source of [
        'var Other = class {};',
        'var DevRuntime = class {};',
        `var DevRuntime = class { static loadLazyChunk(id) { return ${lazyRequest} } };`,
        `var DevRuntime = class { [loadLazyChunk](id) { return ${lazyRequest} } };`,
        `var DevRuntime = class { get loadLazyChunk() { return ${lazyRequest} } };`,
        'var DevRuntime = class { loadLazyChunk() {} };',
        'var DevRuntime = class { loadLazyChunk() { return import("./other.js") } };',
        `var DevRuntime = class { loadLazyChunk(id) { return import(\`/other?id=\${id}\`) } };`,
        `var DevRuntime = class { loadLazyChunk(id) { trace(id); return ${lazyRequest} } };`
    ]) {
        assert.throws(() => disableRolldownLazyLoading(source, filename), /Expected DevRuntime\.loadLazyChunk/)
    }
})
