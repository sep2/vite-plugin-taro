import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const distRoot = path.join(packageRoot, 'dist')

test('bundles only the compiler and leaves client modules for the final app linker', async () => {
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
        files: string[]
    }
    const compiler = await readFile(path.join(distRoot, 'index.js'), 'utf8')
    const componentFacade = await readFile(path.join(distRoot, 'runtime/client/taro/component.js'), 'utf8')
    const compilerModules = await readdir(path.join(distRoot, 'node'), { recursive: true })
    const distributionFiles = await readdir(distRoot)

    assert.ok(!packageJson.files.includes('src'))
    assert.equal(packageJson.dependencies['weapp-tailwindcss'], undefined)
    assert.doesNotMatch(compiler, /from ['"]weapp-tailwindcss/)
    assert.match(compiler, /data:text\/css,%2F\*!%20weapp-tailwindcss%20generator-placeholder/)
    assert.ok(!distributionFiles.includes('generator-placeholder.css'))
    assert.match(componentFacade, /from '@tarojs\/components'/)
    assert.equal(
        compilerModules.some((file) => file.endsWith('.js')),
        false
    )
})
