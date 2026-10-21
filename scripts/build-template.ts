import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const creatorRoot = path.join(repoRoot, 'packages/create-vite-taro')
const pluginRoot = path.join(repoRoot, 'packages/vite-plugin-taro')
const packageRequire = createRequire(path.join(pluginRoot, 'package.json'))
const target = process.argv[2]
if (target !== 'wx' && target !== 'zfb' && target !== 'tt' && target !== 'h5') {
    throw new Error('Usage: node scripts/build-template.ts <wx|zfb|tt|h5>')
}

const temporaryRoot = path.join(pluginRoot, 'tmp')
mkdirSync(temporaryRoot, { recursive: true })
const directory = mkdtempSync(path.join(temporaryRoot, 'template-build-'))
try {
    const generator = path.join(directory, 'generator')
    mkdirSync(generator)
    for (const file of ['index.js', 'package.json']) {
        copyFileSync(path.join(creatorRoot, file), path.join(generator, file))
    }
    cpSync(path.join(creatorRoot, 'templates'), path.join(generator, 'templates'), {
        recursive: true,
        filter: (source) => path.basename(source) !== 'node_modules'
    })
    const project = path.join(directory, 'app')
    execFileSync(process.execPath, [path.join(generator, 'index.js'), project], {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 25_000
    })
    copyFileSync(path.join(creatorRoot, '.env.local'), path.join(project, '.env.local'))
    // Keep Tailwind's automatic source discovery inside the generated application.
    execFileSync('git', ['init', '--quiet', project], { cwd: repoRoot, stdio: 'pipe', timeout: 25_000 })
    for (const name of ['react', 'react-dom', 'vite', 'rolldown', 'vite-plugin-taro']) {
        const source = path.dirname(packageRequire.resolve(`${name}/package.json`))
        const destination = path.join(project, 'node_modules', name)
        mkdirSync(path.dirname(destination), { recursive: true })
        symlinkSync(source, destination, 'junction')
    }
    const vite = path.join(path.dirname(packageRequire.resolve('vite/package.json')), 'bin/vite.js')
    execFileSync(process.execPath, [vite, 'build', '--outDir', path.join(repoRoot, 'dist', target), '--emptyOutDir'], {
        cwd: project,
        env: { ...process.env, VITE_VPT_TARGET: target },
        stdio: 'inherit',
        timeout: 25_000
    })
} finally {
    rmSync(directory, { recursive: true, force: true })
}
