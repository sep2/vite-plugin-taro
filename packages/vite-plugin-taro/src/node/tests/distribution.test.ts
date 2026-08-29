import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { h5AppPath } from '../plugins/h5/constant.ts'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const distRoot = path.join(packageRoot, 'dist')
const compilerSizeLimit = 2_200_000

test('uses source in the workspace and publishes a size-bounded compiler plus client modules', async () => {
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
        devDependencies: Record<string, string>
        files: string[]
        main: string
        publishConfig: { main: string }
    }
    const compiler = await readFile(path.join(distRoot, 'index.js'), 'utf8')
    const componentFacade = await readFile(path.join(distRoot, 'runtime/client/taro/component.js'), 'utf8')
    const compilerModules = await readdir(path.join(distRoot, 'node'), { recursive: true })

    assert.equal(packageJson.main, './src/index.ts')
    assert.equal(packageJson.publishConfig.main, './dist/index.js')
    assert.ok(!packageJson.files.includes('src'))
    assert.match(h5AppPath, /\/src\/runtime\/h5\/app\.ts$/)
    assert.equal(packageJson.dependencies['@tailwindcss/vite'], '4.3.3')
    assert.equal(packageJson.devDependencies['@tailwindcss-mangle/engine'], '0.2.0')
    assert.equal(packageJson.devDependencies['@weapp-core/escape'], '8.0.0')
    assert.equal(packageJson.devDependencies['@weapp-tailwindcss/postcss'], '3.2.11')
    assert.equal(packageJson.devDependencies['weapp-tailwindcss'], undefined)
    assert.equal(packageJson.dependencies['weapp-tailwindcss'], undefined)
    assert.doesNotMatch(compiler, /from\s*['"]weapp-tailwindcss/)
    assert.match(compiler, /@tailwindcss\/vite/)
    assert.ok(Buffer.byteLength(compiler) < compilerSizeLimit)
    assert.match(componentFacade, /from '@tarojs\/components'/)
    assert.equal(
        compilerModules.some((file) => file.endsWith('.js')),
        false
    )
})
