#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type PackageInfo = {
    name: string
    version: string
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const git = process.platform === 'win32' ? 'git.exe' : 'git'

const usage = `Usage:
  pnpm publish:all [-- --otp 123456] [-- --tag latest] [-- --skip-checks] [-- --no-git-check]
  pnpm publish:dry

Options:
  --dry-run       Run npm publish --dry-run for every packed package.
  --otp <code>    npm 2FA one-time password. You can also use NPM_CONFIG_OTP.
  --tag <tag>     npm dist-tag to publish with, for example next.
  --skip-checks   Skip typecheck and package validation before publish.
  --no-git-check  Do not require a clean git working tree.
  --help          Show this help.
`

const rawArgs = process.argv.slice(2)
const args = rawArgs.filter((arg) => arg !== '--')
const dryRun = takeFlag('--dry-run')
const skipChecks = takeFlag('--skip-checks')
const noGitCheck = takeFlag('--no-git-check')
const help = takeFlag('--help') || takeFlag('-h')
const otp = takeOption('--otp') ?? process.env.NPM_CONFIG_OTP
const tag = takeOption('--tag')

if (help) {
    console.log(usage)
    process.exit(0)
}

if (args.length > 0) {
    fail(`Unknown argument(s): ${args.join(' ')}\n\n${usage}`)
}

const packages = [
    packageInfo('packages/taro-react/package.json'),
    packageInfo('packages/taro-plugin-framework-react/package.json'),
    packageInfo('packages/vite-plugin-taro/package.json'),
    packageInfo('packages/create-vite-taro/package.json')
]
console.log(dryRun ? 'Publishing dry run for:' : 'Publishing packages:')
for (const pkg of packages) {
    console.log(`- ${pkg.name}@${pkg.version}`)
}
console.log('')

const publishTargets = dryRun ? packages : packages.filter((pkg) => !isPackageVersionPublished(pkg))

if (!dryRun && publishTargets.length === 0) {
    console.log('All package versions already exist on npm. Nothing to publish.')
    process.exit(0)
}

const packageFilters = publishTargets.flatMap((pkg) => ['--filter', pkg.name])

if (!noGitCheck) {
    assertCleanGitTree()
}

run(pnpm, ['prepare:taro'])
run(pnpm, ['build:plugin'])

if (!skipChecks) {
    run(pnpm, ['typecheck'])
    run(pnpm, ['-r', ...packageFilters, 'pack', '--dry-run'])
}

const packRoot = mkdtempSync(path.join(tmpdir(), 'vite-plugin-taro-publish-'))

try {
    for (const pkg of publishTargets) {
        const tarballPath = packPackage(pkg, packRoot)
        publishPackage(tarballPath)
    }
} finally {
    rmSync(packRoot, { recursive: true, force: true })
}

console.log(dryRun ? '\nPublish dry run completed.' : '\nPublish completed.')

function packageInfo(packageJsonPath: string): PackageInfo {
    const absolutePath = path.join(repoRoot, packageJsonPath)
    const packageJson: unknown = JSON.parse(readFileSync(absolutePath, 'utf8'))

    if (!isPackageInfo(packageJson)) {
        fail(`${packageJsonPath} must contain string name and version fields.`)
    }

    return {
        name: packageJson.name,
        version: packageJson.version
    }
}

function packPackage(pkg: PackageInfo, packRoot: string): string {
    const packDir = path.join(packRoot, pkg.name.replace(/[^a-zA-Z0-9._-]/g, '_'))
    mkdirSync(packDir, { recursive: true })
    run(pnpm, ['--filter', pkg.name, 'pack', '--pack-destination', packDir])

    const tarballs = readdirSync(packDir).filter((fileName) => fileName.endsWith('.tgz'))
    if (tarballs.length !== 1) {
        fail(`Expected one tarball for ${pkg.name}, found ${tarballs.length} in ${packDir}.`)
    }

    return path.join(packDir, tarballs[0])
}

function publishPackage(tarballPath: string): void {
    const publishArgs = ['publish', tarballPath, '--access', 'public']
    if (dryRun) publishArgs.push('--dry-run', '--force')
    if (tag) publishArgs.push('--tag', tag)
    if (otp) publishArgs.push('--otp', otp)

    run(npm, publishArgs)
}

function isPackageVersionPublished(pkg: PackageInfo): boolean {
    const packageSpecifier = `${pkg.name}@${pkg.version}`
    const result = spawnSync(npm, ['view', packageSpecifier, 'version'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
    })

    if (result.error) {
        throw result.error
    }

    if (result.status === 0) {
        console.log(`Skipping ${packageSpecifier}; already published.`)
        return true
    }

    const output = `${result.stdout}\n${result.stderr}`
    if (output.includes('E404') || output.includes('404')) {
        return false
    }

    fail(`Could not check whether ${packageSpecifier} is already published.\n\n${output}`)
}

function takeFlag(name: string): boolean {
    const index = args.indexOf(name)
    if (index === -1) return false
    args.splice(index, 1)
    return true
}

function takeOption(name: string): string | undefined {
    const equalsIndex = args.findIndex((arg) => arg.startsWith(`${name}=`))
    if (equalsIndex !== -1) {
        const [value] = args.splice(equalsIndex, 1)
        return value.slice(name.length + 1)
    }

    const index = args.indexOf(name)
    if (index === -1) return undefined

    const value = args[index + 1]
    if (!value || value.startsWith('--')) {
        fail(`Missing value for ${name}.\n\n${usage}`)
    }

    args.splice(index, 2)
    return value
}

function assertCleanGitTree(): void {
    const insideGitTree = spawnSync(git, ['rev-parse', '--is-inside-work-tree'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
    })

    if (insideGitTree.status !== 0 || insideGitTree.stdout.trim() !== 'true') return

    const status = spawnSync(git, ['status', '--porcelain'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit']
    })

    if (status.status !== 0) {
        process.exit(status.status ?? 1)
    }

    if (status.stdout.trim()) {
        fail(
            `Git working tree is not clean. Commit or stash changes first, or pass --no-git-check.\n\n${status.stdout}`
        )
    }
}

function run(command: string, commandArgs: string[]): void {
    console.log(`$ ${[command, ...commandArgs].join(' ')}`)
    const result = spawnSync(command, commandArgs, {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env
    })

    if (result.error) {
        throw result.error
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

function isPackageInfo(value: unknown): value is PackageInfo {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        'name' in value &&
        'version' in value &&
        typeof value.name === 'string' &&
        typeof value.version === 'string'
    )
}
