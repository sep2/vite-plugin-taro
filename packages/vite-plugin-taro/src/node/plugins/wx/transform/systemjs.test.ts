import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { patchSystemJs, systemJsPath } from './systemjs.ts'

const upstreamSource = readFileSync(systemJsPath, 'utf8')

test('exposes only the SystemJS internals required by the runtime patch', () => {
    const patched = patchSystemJs({
        code: upstreamSource,
        id: systemJsPath,
        sourcemap: true
    })

    assert.ok(patched.map)
    assert.match(patched.code, /Object\.defineProperty\(envGlobal\.System, ['"]__vptInternals['"]/)
    assert.match(patched.code, /registry: envGlobal\.System\[REGISTRY\]/)
    assert.match(patched.code, /\bpostOrderExec\s*[,}]/)
    assert.doesNotMatch(patched.code, /importSync/)
})

test('rejects an unrecognized SystemJS installation structure', () => {
    const changedSource = upstreamSource.replace(
        'envGlobal.System = new SystemJS();',
        'envGlobal.Other = new SystemJS();'
    )

    assert.throws(
        () => patchSystemJs({ code: changedSource, id: systemJsPath, sourcemap: false }),
        /Expected one SystemJS installation point, found 0/
    )
})
