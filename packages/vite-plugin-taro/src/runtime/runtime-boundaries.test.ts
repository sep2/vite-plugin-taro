import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeRoot = path.join(packageRoot, 'src/runtime')
const nodeRoot = path.join(packageRoot, 'src/node')

test('runtime modules do not import Node or Vite implementation code', async () => {
    for await (const relativeFile of fs.glob('**/*.ts', { cwd: runtimeRoot })) {
        if (relativeFile.endsWith('.test.ts')) continue
        const file = path.join(runtimeRoot, relativeFile)
        const source = await fs.readFile(file, 'utf8')
        for (const match of source.matchAll(/\b(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)) {
            const specifier = match[1]
            if (!specifier) continue
            assert.ok(!specifier.startsWith('node:'), `${relativeFile} imports ${specifier}`)
            assert.notEqual(specifier, 'vite', `${relativeFile} imports Vite`)
            if (!specifier.startsWith('.')) continue
            const resolved = path.resolve(path.dirname(file), specifier)
            assert.ok(
                !resolved.startsWith(`${nodeRoot}${path.sep}`),
                `${relativeFile} imports Node implementation code`
            )
        }
    }
})
