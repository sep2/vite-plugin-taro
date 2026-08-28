#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, type OutputChunk } from 'rolldown'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(packageRoot, 'dist')
const packageRequire = createRequire(path.join(packageRoot, 'package.json'))
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    name: string
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
    mkdirSync(distRoot, { recursive: true })
    emitTypeScript()

    const result = await build({
        input: path.join(packageRoot, 'src/index.ts'),
        platform: 'node',
        external: isExternal,
        output: {
            format: 'esm',
            codeSplitting: false
        },
        write: false
    })

    const compiler = result.output.find((output): output is OutputChunk => output.type === 'chunk' && output.isEntry)
    if (!compiler) throw new Error('Rolldown did not emit the VPT compiler entry')
    validateExternalImports(compiler)
    writeFileSync(path.join(distRoot, 'index.js'), compiler.code)
    removeJavaScriptFiles(path.join(distRoot, 'node'))
    rmSync(path.join(distRoot, 'options.js'))

    console.log(`Built ${packageJson.name} compiler as one JavaScript file`)
}

function emitTypeScript(): void {
    const tscPath = path.join(path.dirname(packageRequire.resolve('typescript/package.json')), 'bin/tsc')
    execFileSync(process.execPath, [tscPath, '--project', path.join(packageRoot, 'tsconfig.build.json')], {
        cwd: packageRoot,
        stdio: 'inherit'
    })
}

function isExternal(id: string): boolean {
    return nodeBuiltins.has(id) || externalPackages.has(getPackageName(id))
}

function getPackageName(id: string): string {
    if (!id.startsWith('@')) return id.split('/')[0]!
    return id.split('/').slice(0, 2).join('/')
}

function validateExternalImports(chunk: OutputChunk): void {
    const undeclaredImports = [...chunk.imports, ...chunk.dynamicImports].filter((id) => !isExternal(id))
    if (undeclaredImports.length > 0) {
        throw new Error(`Compiler retained undeclared imports: ${undeclaredImports.join(', ')}`)
    }
}

function removeJavaScriptFiles(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
            removeJavaScriptFiles(entryPath)
        } else if (entry.name.endsWith('.js')) {
            rmSync(entryPath)
        }
    }
}
