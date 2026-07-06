#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    await buildPackage(upstreamName, targetDir)
}

async function buildPackage(upstreamName: string, targetDir: string): Promise<void> {
    const absoluteTargetDir = path.resolve(repoRoot, targetDir)
    const localPackageJson = readLocalPackageJson(absoluteTargetDir)
    const localReadme = readLocalReadme(absoluteTargetDir)
    const patchFile = getPatchFile(upstreamName)
    const workingDir = mkdtempSync(path.join(tmpdir(), 'vite-plugin-taro-'))

    try {
        const packageDir = await extractUpstreamPackage(upstreamName, workingDir)

        applyPatch(packageDir, patchFile)
        writeFileSync(path.join(packageDir, 'package.json'), localPackageJson.text)
        writeFileSync(path.join(packageDir, 'README.md'), localReadme)
        replaceGeneratedPackage(absoluteTargetDir, packageDir)

        console.log(`Generated ${String(localPackageJson.value.name)}@${String(localPackageJson.value.version)}`)
    } finally {
        rmSync(workingDir, { recursive: true, force: true })
    }
}

async function extractUpstreamPackage(upstreamName: string, workingDir: string): Promise<string> {
    const tarballDir = path.join(workingDir, 'tarballs')
    const extractDir = path.join(workingDir, 'extract')
    mkdirSync(tarballDir, { recursive: true })
    mkdirSync(extractDir, { recursive: true })

    console.log(`Fetching ${upstreamName}@${upstreamVersion}`)
    const tarballPath = await fetchUpstreamTarball(upstreamName, tarballDir)
    run(getTarCommand(), ['-xzf', tarballPath, '-C', extractDir])

    return path.join(extractDir, 'package')
}

function replaceGeneratedPackage(targetDir: string, packageDir: string): void {
    if (existsSync(targetDir)) {
        for (const entryName of readdirSync(targetDir)) {
            if (entryName === 'node_modules') continue
            rmSync(path.join(targetDir, entryName), { recursive: true, force: true })
        }
    }

    mkdirSync(targetDir, { recursive: true })
    cpSync(packageDir, targetDir, { recursive: true, force: true })
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
    run(getGitCommand(), ['apply', '-p1', patchFile], { cwd: packageDir })
}

async function fetchUpstreamTarball(upstreamName: string, destination: string): Promise<string> {
    const packageFileName = upstreamName.split('/').at(-1)
    if (!packageFileName) throw new Error(`Invalid package name: ${upstreamName}`)

    const tarballFileName = `${packageFileName}-${upstreamVersion}.tgz`
    const tarballUrl = new URL(`${upstreamName}/-/${tarballFileName}`, getNpmRegistryUrl())
    const response = await fetch(tarballUrl)

    if (!response.ok) {
        throw new Error(`Failed to fetch ${tarballUrl}: ${response.status} ${response.statusText}`)
    }

    const tarballPath = path.join(destination, tarballFileName)
    writeFileSync(tarballPath, new Uint8Array(await response.arrayBuffer()))
    return tarballPath
}

function getNpmRegistryUrl(): string {
    const registry = process.env.npm_config_registry || 'https://registry.npmjs.org/'
    return registry.endsWith('/') ? registry : `${registry}/`
}

function getGitCommand(): string {
    return process.platform === 'win32' ? 'git.exe' : 'git'
}

function getTarCommand(): string {
    return process.platform === 'win32' ? 'tar.exe' : 'tar'
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
