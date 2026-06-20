#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const usage = `Usage:
  pnpm publish:all [-- --otp 123456] [-- --tag latest] [-- --skip-checks] [-- --no-git-check]
  pnpm publish:dry

Options:
  --dry-run       Run pnpm publish --dry-run for every package.
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
    packageInfo('packages/vite-plugin-taro/package.json')
]
const packageFilters = packages.flatMap((pkg) => ['--filter', pkg.name])

console.log(dryRun ? 'Publishing dry run for:' : 'Publishing packages:')
for (const pkg of packages) {
    console.log(`- ${pkg.name}@${pkg.version}`)
}
console.log('')

if (!noGitCheck) {
    assertCleanGitTree()
}

if (!dryRun) {
    run(pnpm, ['whoami'])
}

run(pnpm, ['prepare:taro'])

if (!skipChecks) {
    run(pnpm, ['typecheck'])
    run(pnpm, ['-r', ...packageFilters, 'pack', '--dry-run'])
}

const publishArgs = ['publish', '--access', 'public', '--no-git-checks']
if (dryRun) publishArgs.push('--dry-run')
if (tag) publishArgs.push('--tag', tag)
if (otp) publishArgs.push('--otp', otp)

for (const pkg of packages) {
    run(pnpm, ['--filter', pkg.name, ...publishArgs])
}

console.log(dryRun ? '\nPublish dry run completed.' : '\nPublish completed.')

function packageInfo(packageJsonPath) {
    const absolutePath = path.join(repoRoot, packageJsonPath)
    const packageJson = JSON.parse(readFileSync(absolutePath, 'utf8'))
    return {
        name: packageJson.name,
        version: packageJson.version
    }
}

function takeFlag(name) {
    const index = args.indexOf(name)
    if (index === -1) return false
    args.splice(index, 1)
    return true
}

function takeOption(name) {
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

function assertCleanGitTree() {
    const insideGitTree = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
    })

    if (insideGitTree.status !== 0 || insideGitTree.stdout.trim() !== 'true') return

    const status = spawnSync('git', ['status', '--porcelain'], {
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

function run(command, commandArgs) {
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

function fail(message) {
    console.error(message)
    process.exit(1)
}
