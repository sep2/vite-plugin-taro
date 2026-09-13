import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transformWithOxcWalker } from './oxc-transform.ts'

for (const sourcemap of [false, true]) {
    test(`Oxc range edits preserve surrounding source (sourcemap=${sourcemap})`, () => {
        const filename = 'fixture.js'
        const code = '// Keep this comment.\nconst value = oldName;\n'
        const result = transformWithOxcWalker({
            code,
            filename,
            sourcemap,
            createVisitor(editor) {
                // The visitor mutates only the editor's replacement range; surrounding bytes stay unchanged.
                return (node) => {
                    if (node.type === 'Identifier' && node.name === 'oldName') {
                        editor.overwrite(node.start, node.end, 'newName')
                    }
                }
            }
        })

        assert.equal(result.code, '// Keep this comment.\nconst value = newName;\n')
        if (sourcemap) {
            assert.ok(result.map)
            assert.equal(Object.getPrototypeOf(result.map), Object.prototype)
            assert.equal(result.map.version, 3)
            assert.equal(result.map.file, filename)
            assert.deepEqual(result.map.sources, [filename])
            assert.deepEqual(result.map.sourcesContent, [code])
            assert.ok(result.map.mappings.length > 0)
            assert.ok(Array.isArray(result.map.names))
        } else {
            assert.equal(result.map, null)
        }
    })
}

test('Oxc leaves source unchanged when the visitor makes no edits', () => {
    const code = 'const value = 1;\n'
    const result = transformWithOxcWalker({
        code,
        filename: 'unchanged.js',
        sourcemap: false,
        createVisitor() {
            return () => {}
        }
    })
    assert.deepEqual(result, { code, map: null })
})

test('Oxc rejects syntax diagnostics before creating a visitor', () => {
    assert.throws(
        () =>
            transformWithOxcWalker({
                code: 'const value = ;',
                filename: 'invalid.js',
                sourcemap: false,
                createVisitor() {
                    assert.fail('Malformed input must not reach the visitor')
                }
            }),
        /Failed to parse invalid\.js with Oxc: .+/
    )
})
