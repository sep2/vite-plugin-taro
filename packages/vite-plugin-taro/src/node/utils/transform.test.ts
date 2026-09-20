import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SourceMap } from 'node:module'
import test from 'node:test'
import { isReferenceIdentifier, walk } from 'oxc-walker'
import { parseSync } from 'rolldown/utils'
import { replaceTemplate } from './transform.ts'

test('requires each compiler-owned template slot exactly once', () => {
    assert.throws(
        () => replaceTemplate('export const value = 1', 'fixture.ts', { __VALUE__: '2' }, false),
        /Expected one placeholder __VALUE__, found 0/
    )
    assert.throws(
        () => replaceTemplate('const a = __VALUE__; const b = __VALUE__', 'fixture.ts', { __VALUE__: '2' }, false),
        /Expected one placeholder __VALUE__, found 2/
    )
})

test('edits only template slots and leaves TypeScript lowering to Vite', () => {
    const code = '// retained comment\nexport const value: object = __VALUE__\n'
    const result = replaceTemplate(code, 'fixture.ts', { __VALUE__: '{answer:42}' }, false)
    assert.equal(result.code, '// retained comment\nexport const value: object = {answer:42}\n')
    assert.equal(result.map, null)
    const mapped = replaceTemplate(code, 'fixture.ts', { __VALUE__: '({answer:42})' }, true)
    assert.deepEqual(mapped.map?.sources, ['fixture.ts'])
    assert.deepEqual(mapped.map?.sourcesContent, [code])
    assert.ok(mapped.map?.mappings)
})

test('maps replaced expressions and untouched code back to their original template positions', () => {
    const code = '// retained comment\nconst first: object = __FIRST__; const second = __SECOND__;\n'
    const filename = '/runtime/page.ts?route=home'
    const result = replaceTemplate(code, filename, { __FIRST__: '{longer: true}', __SECOND__: '42' }, true)
    assert.ok(result.map)
    const map = new SourceMap({
        file: filename,
        version: 3,
        sources: [filename],
        sourcesContent: [code],
        names: [],
        mappings: result.map.mappings,
        sourceRoot: ''
    })
    const originalLine = code.split('\n')[1]
    const generatedLine = result.code.split('\n')[1]
    for (const [generated, original] of [
        ['{longer:', '__FIRST__'],
        ['const second', 'const second'],
        ['42', '__SECOND__']
    ]) {
        const entry = map.findEntry(1, generatedLine.indexOf(generated))
        assert.ok('originalLine' in entry)
        assert.equal(entry.originalSource, filename)
        assert.equal(entry.originalLine, 1)
        assert.equal(entry.originalColumn, originalLine.indexOf(original))
    }
})

test('does not rescan replacement values for other reserved slots', () => {
    const result = replaceTemplate(
        'const config = __CONFIG__; const path = __PATH__;',
        'fixture.ts',
        { __CONFIG__: JSON.stringify({ text: '__PATH__ __CONFIG__' }), __PATH__: '"home"' },
        false
    )
    const resultValue: unknown = Function(`${result.code}; return [config, path]`)()
    assert.deepEqual(resultValue, [{ text: '__PATH__ __CONFIG__' }, 'home'])
})

for (const [file, placeholders] of [
    ['mini/capsule/app', ['__VPT_APP_CONFIG__']],
    ['mini/capsule/page', ['__VPT_PAGE_PATH__', '__VPT_PAGE_CONFIG__']],
    ['h5/app', ['__VPT_H5_APP_CONFIG__', '__VPT_H5_ROUTES__']]
] as const) {
    test(`${file} owns each reserved slot as one expression identifier`, () => {
        const code = readFileSync(new URL(`../../runtime/${file}.ts`, import.meta.url), 'utf8')
        const parsed = parseSync(`${file}.ts`, code)
        assert.deepEqual(parsed.errors, [])
        // This test-local journal verifies the shipped template contract once, instead of reparsing it in every consumer build.
        const positions = new Map<string, number[]>()
        walk(parsed.program, {
            enter(node, parent) {
                if (node.type === 'Identifier' && isReferenceIdentifier(node, parent)) {
                    const offsets = positions.get(node.name) ?? []
                    offsets.push(node.start)
                    positions.set(node.name, offsets)
                }
            }
        })
        for (const placeholder of placeholders) {
            assert.deepEqual(positions.get(placeholder), [code.indexOf(placeholder)])
            assert.equal(code.indexOf(placeholder), code.lastIndexOf(placeholder))
        }
    })
}
