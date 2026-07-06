#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type PackageSpec = readonly [upstreamName: string, targetDir: string]
type LocalPackageJson = {
    text: string
    value: {
        name?: unknown
        version?: unknown
    }
}
type RunOptions = {
    cwd?: string
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const upstreamVersion = '4.2.0'

const packages: PackageSpec[] = [
    ['@tarojs/react', 'packages/taro-react'],
    ['@tarojs/plugin-framework-react', 'packages/taro-plugin-framework-react']
]

for (const [upstreamName, targetDir] of packages) {
    buildPackage(upstreamName, targetDir)
}

function buildPackage(upstreamName: string, targetDir: string): void {
    const absoluteTargetDir = path.resolve(repoRoot, targetDir)
    const localPackageJson = readLocalPackageJson(absoluteTargetDir)
    const localReadme = readLocalReadme(absoluteTargetDir)
    const patchFile = getPatchFile(upstreamName)
    const workingDir = mkdtempSync(path.join(tmpdir(), 'vite-plugin-taro-'))

    try {
        const packageDir = extractUpstreamPackage(upstreamName, workingDir)

        applyPatch(packageDir, patchFile)
        writeFileSync(path.join(packageDir, 'package.json'), localPackageJson.text)
        writeFileSync(path.join(packageDir, 'README.md'), localReadme)
        replaceGeneratedPackage(absoluteTargetDir, packageDir, workingDir)

        console.log(`Generated ${String(localPackageJson.value.name)}@${String(localPackageJson.value.version)}`)
    } finally {
        rmSync(workingDir, { recursive: true, force: true })
    }
}

function extractUpstreamPackage(upstreamName: string, workingDir: string): string {
    const tarballDir = path.join(workingDir, 'tarballs')
    const extractDir = path.join(workingDir, 'extract')
    mkdirSync(tarballDir, { recursive: true })
    mkdirSync(extractDir, { recursive: true })

    const specifier = `${upstreamName}@${upstreamVersion}`
    console.log(`Packing ${specifier}`)
    const tarballPath = npmPack(specifier, tarballDir)
    run('tar', ['-xzf', tarballPath, '-C', extractDir])

    return path.join(extractDir, 'package')
}

function replaceGeneratedPackage(targetDir: string, packageDir: string, workingDir: string): void {
    const targetNodeModules = path.join(targetDir, 'node_modules')
    const preservedNodeModules = path.join(workingDir, 'node_modules')

    if (existsSync(targetNodeModules)) {
        renameSync(targetNodeModules, preservedNodeModules)
    }

    rmSync(targetDir, { recursive: true, force: true })
    cpSync(packageDir, targetDir, { recursive: true })

    if (existsSync(preservedNodeModules)) {
        renameSync(preservedNodeModules, targetNodeModules)
    }
}

function readLocalPackageJson(targetDir: string): LocalPackageJson {
    const text = readLocalTextFile(path.join(targetDir, 'package.json'))
    const value: unknown = JSON.parse(text)

    if (!isLocalPackageJsonValue(value)) {
        throw new Error(`Invalid package.json in ${targetDir}`)
    }

    return { text, value }
}

function readLocalReadme(targetDir: string): string {
    return readLocalTextFile(path.join(targetDir, 'README.md'))
}

function readLocalTextFile(filePath: string): string {
    const text = readFileSync(filePath, 'utf8')
    return text.endsWith('\n') ? text : `${text}\n`
}

function getPatchFile(upstreamName: string): string {
    return path.resolve(repoRoot, `patches/${upstreamName.replace('/', '__')}@${upstreamVersion}-react19.patch`)
}

function applyPatch(packageDir: string, patchFile: string): void {
    if (!existsSync(patchFile)) throw new Error(`Missing patch file: ${patchFile}`)
    run('git', ['apply', '-p1', patchFile], { cwd: packageDir })
}

function npmPack(specifier: string, destination: string): string {
    const output = run(getNpmCommand(), ['pack', specifier, '--pack-destination', destination, '--silent'])
    const fileName = output.trim().split('\n').filter(Boolean).at(-1)

    if (!fileName) throw new Error(`npm pack did not return a tarball name for ${specifier}`)
    return path.resolve(destination, fileName)
}

function getNpmCommand(): string {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function run(command: string, args: string[], options: RunOptions = {}): string {
    return execFileSync(command, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
        ...options
    })
}

function isLocalPackageJsonValue(value: unknown): value is LocalPackageJson['value'] {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
