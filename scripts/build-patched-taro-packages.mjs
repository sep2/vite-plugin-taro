#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const upstreamVersion = '4.2.0'

const packageDefinitions = [
    {
        upstreamName: '@tarojs/react',
        targetDir: 'packages/taro-react',
        patchFile: 'patches/@tarojs__react@4.2.0-react19.patch',
        readme: `# vite-plugin-taro-react

React 19-compatible package generated from \`@tarojs/react@${upstreamVersion}\` plus vite-plugin-taro's React 19 patch.

This package is published so \`vite-plugin-taro\` can depend on it through an npm alias as \`@tarojs/react\`. It is not intended for direct application imports.

Upstream Taro is MIT licensed by O2Team. See \`LICENSE\`.
`
    },
    {
        upstreamName: '@tarojs/plugin-framework-react',
        targetDir: 'packages/taro-plugin-framework-react',
        patchFile: 'patches/@tarojs__plugin-framework-react@4.2.0-react19.patch',
        readme: `# vite-plugin-taro-plugin-framework-react

React 19-compatible package generated from \`@tarojs/plugin-framework-react@${upstreamVersion}\` plus vite-plugin-taro's React 19 patch.

This package is published so \`vite-plugin-taro\` can depend on it through an npm alias as \`@tarojs/plugin-framework-react\`. It is not intended for direct application imports.

Upstream Taro is MIT licensed by O2Team. See \`LICENSE\`.
`
    }
]

function run(command, args, options = {}) {
    return execFileSync(command, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
        ...options
    })
}

function npmPack(specifier, destination) {
    const output = run('npm', ['pack', specifier, '--pack-destination', destination, '--silent'])
    const fileName = output.trim().split('\n').filter(Boolean).at(-1)

    if (!fileName) {
        throw new Error(`npm pack did not return a tarball name for ${specifier}`)
    }

    return path.resolve(destination, fileName)
}

function applyPatch(packageDir, patchFile) {
    run('patch', ['-p1', '--input', path.resolve(repoRoot, patchFile)], { cwd: packageDir })
}

function extractTarball(tarballPath, destination) {
    run('tar', ['-xzf', tarballPath, '-C', destination])
}

function ensurePatchExists(patchFile) {
    const absolutePatchPath = path.resolve(repoRoot, patchFile)
    if (!existsSync(absolutePatchPath)) {
        throw new Error(`Missing patch file: ${patchFile}`)
    }
}

function readLocalPackageJson(targetDir) {
    const packageJsonPath = path.join(targetDir, 'package.json')
    if (!existsSync(packageJsonPath)) {
        throw new Error(`Missing local package metadata: ${packageJsonPath}`)
    }

    const text = readFileSync(packageJsonPath, 'utf8')
    return {
        text: text.endsWith('\n') ? text : `${text}\n`,
        value: JSON.parse(text)
    }
}

function buildPackage(definition) {
    ensurePatchExists(definition.patchFile)

    const targetDir = path.resolve(repoRoot, definition.targetDir)
    const localPackageJson = readLocalPackageJson(targetDir)
    const workingDir = mkdtempSync(path.join(tmpdir(), 'vite-plugin-taro-'))
    const tarballDir = path.join(workingDir, 'tarballs')
    const extractDir = path.join(workingDir, 'extract')
    const generatedDir = path.join(workingDir, 'generated')

    try {
        mkdirSync(tarballDir, { recursive: true })
        mkdirSync(extractDir, { recursive: true })

        const specifier = `${definition.upstreamName}@${upstreamVersion}`
        console.log(`Packing ${specifier}`)
        const tarballPath = npmPack(specifier, tarballDir)

        extractTarball(tarballPath, extractDir)
        const upstreamPackageDir = path.join(extractDir, 'package')

        cpSync(upstreamPackageDir, generatedDir, { recursive: true })
        applyPatch(generatedDir, definition.patchFile)

        writeFileSync(path.join(generatedDir, 'package.json'), localPackageJson.text)
        writeFileSync(path.join(generatedDir, 'README.md'), definition.readme)

        const targetNodeModules = path.join(targetDir, 'node_modules')
        const preservedNodeModules = path.join(workingDir, 'node_modules')

        if (existsSync(targetNodeModules)) {
            renameSync(targetNodeModules, preservedNodeModules)
        }

        rmSync(targetDir, { recursive: true, force: true })
        cpSync(generatedDir, targetDir, { recursive: true })

        if (existsSync(preservedNodeModules)) {
            renameSync(preservedNodeModules, targetNodeModules)
        }

        console.log(`Generated ${localPackageJson.value.name}@${localPackageJson.value.version}`)
    } finally {
        rmSync(workingDir, { recursive: true, force: true })
    }
}

for (const definition of packageDefinitions) {
    buildPackage(definition)
}
