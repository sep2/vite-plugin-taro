import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createMemoryTestProject } from '../tests/create-memory-test-project.ts'
import { cleanOutputFiles } from './clean-output-files.ts'

test('creates output and unlinks files except caller-owned paths while retaining directories', (context) => {
    const root = createMemoryTestProject(context)
    const directory = path.join(root, 'dist')
    const nested = path.join(directory, 'obsolete/nested')
    const projectConfig = path.join(directory, 'project.config.json')
    const linkedSource = path.join(root, 'native-component.js')

    cleanOutputFiles(directory, ['project.config.json'])
    assert.deepEqual(readdirSync(directory), [])

    mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(nested, 'old.js'), 'obsolete')
    writeFileSync(path.join(directory, 'app.wxss'), 'obsolete style')
    writeFileSync(projectConfig, '{"appid":"fixture"}')
    writeFileSync(linkedSource, 'native source')
    const link = path.join(directory, 'linked-component')
    symlinkSync('../native-component.js', link, 'file')
    assert.ok(lstatSync(link).isSymbolicLink())

    for (const generation of [1, 2]) {
        cleanOutputFiles(directory, ['project.config.json'])
        assert.deepEqual(readdirSync(directory).sort(), ['obsolete', 'project.config.json'], `generation ${generation}`)
        assert.deepEqual(readdirSync(nested), [])
        assert.equal(readFileSync(projectConfig, 'utf8'), '{"appid":"fixture"}')
        assert.equal(existsSync(link), false)
        assert.equal(readFileSync(linkedSource, 'utf8'), 'native source')
    }
})
