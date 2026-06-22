#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginRoot = path.join(repoRoot, 'packages/vite-plugin-taro')
const readmeFiles = ['README.md', 'README.zh.md']

let copiedCount = 0

for (const readmeFile of readmeFiles) {
    const rootReadmePath = path.join(repoRoot, readmeFile)
    const pluginReadmePath = path.join(pluginRoot, readmeFile)
    const rootReadme = readFileSync(rootReadmePath, 'utf8')
    const pluginReadme = existsSync(pluginReadmePath) ? readFileSync(pluginReadmePath, 'utf8') : undefined

    if (pluginReadme === rootReadme) {
        console.log(`README already synced: ${readmeFile} -> packages/vite-plugin-taro/${readmeFile}`)
        continue
    }

    writeFileSync(pluginReadmePath, rootReadme)
    copiedCount += 1
    console.log(`Copied ${readmeFile} -> packages/vite-plugin-taro/${readmeFile}`)
}

if (copiedCount === 0) {
    process.exit(0)
}
