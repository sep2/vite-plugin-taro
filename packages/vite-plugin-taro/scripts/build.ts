#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'rolldown'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(packageRoot, 'dist')
const packageRequire = createRequire(path.join(packageRoot, 'package.json'))
const tscPath = path.join(path.dirname(packageRequire.resolve('typescript/package.json')), 'bin/tsc')
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    peerDependencies: Record<string, string>
}
/** Production and peer packages remain physical; implementation-only dev dependencies are bundled automatically. */
const externalPackages: ReadonlySet<string> = new Set([
    ...Object.keys(packageJson.dependencies),
    ...Object.keys(packageJson.peerDependencies)
])
const nodeBuiltins: ReadonlySet<string> = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

await main()

async function main(): Promise<void> {
    rmSync(distRoot, { recursive: true, force: true })
    compileTypeScript('tsconfig.declarations.json')
    compileTypeScript('tsconfig.runtime.json')

    await build({
        input: path.join(packageRoot, 'src/index.ts'),
        platform: 'node',
        external: isExternal,
        output: {
            file: path.join(distRoot, 'index.js'),
            format: 'esm',
            codeSplitting: false
        }
    })
}

function compileTypeScript(project: string): void {
    execFileSync(process.execPath, [tscPath, '--project', path.join(packageRoot, project)], {
        cwd: packageRoot,
        stdio: 'inherit'
    })
}

function isExternal(id: string): boolean {
    const packageName = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0]!
    return nodeBuiltins.has(id) || externalPackages.has(packageName)
}
