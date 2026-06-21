#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootReadmePath = path.join(repoRoot, 'README.md')
const pluginReadmePath = path.join(repoRoot, 'packages/vite-plugin-taro/README.md')

const rootReadme = readFileSync(rootReadmePath, 'utf8')
const pluginReadme = readFileSync(pluginReadmePath, 'utf8')

if (pluginReadme === rootReadme) {
    console.log('README already synced: README.md -> packages/vite-plugin-taro/README.md')
    process.exit(0)
}

writeFileSync(pluginReadmePath, rootReadme)
console.log('Copied README.md -> packages/vite-plugin-taro/README.md')
