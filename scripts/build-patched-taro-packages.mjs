#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const upstreamVersion = '4.2.0'
const patchedVersion = '4.2.0-react19.0'

const packageDefinitions = [
    {
        upstreamName: '@tarojs/react',
        targetDir: 'packages/taro-react',
        patchFile: 'patches/@tarojs__react@4.2.0-react19.patch',
        packageJson: {
            name: 'vite-plugin-taro-react',
            version: patchedVersion,
            description: 'React 19 compatible fork of @tarojs/react for vite-plugin-taro.',
            author: 'O2Team, felix',
            license: 'MIT',
            main: 'dist/react.esm.js',
            module: 'dist/react.esm.js',
            types: 'dist/index.d.ts',
            files: ['dist', 'LICENSE', 'README.md'],
            repository: {
                type: 'git',
                url: 'git+https://github.com/NervJS/taro.git',
                directory: 'packages/taro-react'
            },
            bugs: {
                url: 'https://github.com/NervJS/taro/issues'
            },
            engines: {
                node: '>=20.19.0'
            },
            dependencies: {
                '@tarojs/runtime': upstreamVersion,
                '@tarojs/shared': upstreamVersion,
                'react-reconciler': '0.33.0'
            },
            peerDependencies: {
                react: '^19.0.0'
            },
            publishConfig: {
                access: 'public'
            }
        },
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
        packageJson: {
            name: 'vite-plugin-taro-plugin-framework-react',
            version: patchedVersion,
            description: 'React 19 compatible fork of @tarojs/plugin-framework-react for vite-plugin-taro.',
            author: 'O2Team, felix',
            license: 'MIT',
            main: 'index.js',
            files: ['dist', 'index.js', 'LICENSE', 'README.md'],
            repository: {
                type: 'git',
                url: 'git+https://github.com/NervJS/taro.git',
                directory: 'packages/taro-framework-react'
            },
            bugs: {
                url: 'https://github.com/NervJS/taro/issues'
            },
            engines: {
                node: '>=20.19.0'
            },
            dependencies: {
                '@tarojs/helper': upstreamVersion,
                '@tarojs/runtime': upstreamVersion,
                '@tarojs/shared': upstreamVersion,
                acorn: '^8.11.3',
                'acorn-walk': '^8.3.2',
                lodash: '^4.17.21',
                tslib: '^2.6.2'
            },
            peerDependencies: {
                '@vitejs/plugin-react': '^6.0.0',
                react: '^19.0.0',
                vite: '^8.0.0'
            },
            peerDependenciesMeta: {
                '@vitejs/plugin-react': {
                    optional: true
                },
                react: {
                    optional: true
                },
                vite: {
                    optional: true
                }
            },
            publishConfig: {
                access: 'public'
            }
        },
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

function writeJson(filePath, value) {
    writeFileSync(filePath, `${JSON.stringify(value, null, 4)}\n`)
}

function ensurePatchExists(patchFile) {
    const absolutePatchPath = path.resolve(repoRoot, patchFile)
    if (!existsSync(absolutePatchPath)) {
        throw new Error(`Missing patch file: ${patchFile}`)
    }
}

function buildPackage(definition) {
    ensurePatchExists(definition.patchFile)

    const targetDir = path.resolve(repoRoot, definition.targetDir)
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

        writeJson(path.join(generatedDir, 'package.json'), definition.packageJson)
        writeFileSync(path.join(generatedDir, 'README.md'), definition.readme)

        const generatedPackageJson = JSON.parse(readFileSync(path.join(generatedDir, 'package.json'), 'utf8'))
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

        console.log(`Generated ${generatedPackageJson.name}@${generatedPackageJson.version}`)
    } finally {
        rmSync(workingDir, { recursive: true, force: true })
    }
}

for (const definition of packageDefinitions) {
    buildPackage(definition)
}
