#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type PackageJson = {
    version: string
}

type CommandResult = {
    status: number | null
    stdout: string
    stderr: string
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const git = process.platform === 'win32' ? 'git.exe' : 'git'

const releaseFiles = [
    'package.json',
    'packages/create-vite-taro/package.json',
    'packages/create-vite-taro/templates/default/package.json',
    'packages/loan-genius/package.json',
    'packages/taro-plugin-framework-react/package.json',
    'packages/taro-react/package.json',
    'packages/vite-plugin-taro/package.json'
]

const usage = `Usage:
  pnpm release <version|major|minor|patch|premajor|preminor|prepatch|prerelease> [--preid beta]

Examples:
  pnpm release patch
  pnpm release 0.2.0
  pnpm release prerelease --preid beta
  pnpm release patch --dry-run

Options:
  --preid <id>       Prerelease identifier for pre* bumps, for example beta.
  --dry-run          Preview the version bump and git steps without writing files.
  --skip-validation  Skip the local pnpm publish:dry validation before committing.
  --no-push          Create the release commit and tag locally without pushing.
  --branch <name>    Release branch to push. Defaults to main.
  --remote <name>    Git remote to push. Defaults to origin.
  --help             Show this help.
`

const args = process.argv.slice(2)
const dryRun = takeFlag('--dry-run')
const skipValidation = takeFlag('--skip-validation')
const noPush = takeFlag('--no-push')
const help = takeFlag('--help') || takeFlag('-h')
const preid = takeOption('--preid')
const branch = takeOption('--branch') ?? 'main'
const remote = takeOption('--remote') ?? 'origin'
const bump = args.shift()

if (help) {
    console.log(usage)
    process.exit(0)
}

if (!bump) {
    fail(`Missing version or bump type.\n\n${usage}`)
}

if (args.length > 0) {
    fail(`Unknown argument(s): ${args.join(' ')}\n\n${usage}`)
}

if (preid && !bump.startsWith('pre')) {
    fail(`--preid can only be used with pre* bump types.\n\n${usage}`)
}

const versionBumpArgs = [bump]
if (preid) versionBumpArgs.push('--preid', preid)

if (dryRun) {
    const nextVersion = resolveNextVersion(true)
    const tagName = `v${nextVersion}`

    console.log('\nRelease dry run:')
    console.log(`- Would validate publishable packages: pnpm publish:dry -- --no-git-check`)
    console.log(`- Would create commit: chore: release ${tagName}`)
    console.log(`- Would create tag: ${tagName}`)
    console.log(
        noPush
            ? '- Would not push because --no-push was passed.'
            : `- Would push: git push ${remote} ${branch} ${tagName}`
    )
    process.exit(0)
}

assertCleanGitTree()
assertCurrentBranch(branch)

const nextVersion = resolveNextVersion(false)
const tagName = `v${nextVersion}`
assertTagIsAvailable(tagName, remote)

run(pnpm, ['version:bump', ...versionBumpArgs])

const actualVersion = readRootPackageVersion()
if (actualVersion !== nextVersion) {
    fail(`Expected package.json version ${nextVersion}, but found ${actualVersion}.`)
}

if (!skipValidation) {
    run(pnpm, ['publish:dry', '--', '--no-git-check'])
}

run(git, ['add', ...releaseFiles])
assertStagedChanges()
run(git, ['commit', '--message', `chore: release ${tagName}`])
run(git, ['tag', tagName])

if (noPush) {
    console.log(`\nCreated release commit and tag ${tagName} locally. Push with:`)
    console.log(`git push ${remote} ${branch} ${tagName}`)
} else {
    run(git, ['push', remote, branch, tagName])
    console.log(`\nRelease ${tagName} pushed. GitHub Actions will publish packages and deploy Pages.`)
}

function resolveNextVersion(printOutput: boolean): string {
    const result = runCapture(pnpm, ['--silent', 'version:bump', ...versionBumpArgs, '--dry-run'], { log: true })
    const output = `${result.stdout}\n${result.stderr}`

    if (printOutput) {
        process.stdout.write(result.stdout)
        process.stderr.write(result.stderr)
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }

    const match = output.match(/Would bump package versions to ([^:\n]+):/)
    if (!match) {
        fail(`Could not resolve next version from version:bump output.\n\n${output}`)
    }

    return match[1]
}

function readRootPackageVersion(): string {
    const packageJson: unknown = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

    if (!isPackageJson(packageJson)) {
        fail('package.json must contain a string version field.')
    }

    return packageJson.version
}

function assertCurrentBranch(expectedBranch: string): void {
    const currentBranch = runCapture(git, ['branch', '--show-current'], { log: false }).stdout.trim()

    if (!currentBranch) {
        fail('Cannot release from a detached HEAD checkout.')
    }

    if (currentBranch !== expectedBranch) {
        fail(`Release must run from ${expectedBranch}. Current branch is ${currentBranch}.`)
    }
}

function assertCleanGitTree(): void {
    const status = runCapture(git, ['status', '--porcelain'], { log: false })

    if (status.status !== 0) {
        process.exit(status.status ?? 1)
    }

    if (status.stdout.trim()) {
        fail(`Git working tree is not clean. Commit or stash changes first.\n\n${status.stdout}`)
    }
}

function assertTagIsAvailable(tagName: string, remoteName: string): void {
    const localTag = runCapture(git, ['rev-parse', '--quiet', '--verify', `refs/tags/${tagName}`], { log: false })
    if (localTag.status === 0) {
        fail(`Tag already exists locally: ${tagName}`)
    }

    const remoteTag = runCapture(git, ['ls-remote', '--exit-code', '--tags', remoteName, `refs/tags/${tagName}`], {
        log: false
    })
    if (remoteTag.status === 0) {
        fail(`Tag already exists on ${remoteName}: ${tagName}`)
    }

    if (remoteTag.status !== 2) {
        fail(`Could not check whether ${tagName} exists on ${remoteName}.\n\n${remoteTag.stdout}\n${remoteTag.stderr}`)
    }
}

function assertStagedChanges(): void {
    const diff = runCapture(git, ['diff', '--cached', '--quiet'], { log: false })

    if (diff.status === 0) {
        fail('No staged release changes were found.')
    }

    if (diff.status !== 1) {
        process.exit(diff.status ?? 1)
    }
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

function runCapture(command: string, commandArgs: string[], options: { log: boolean }): CommandResult {
    if (options.log) {
        console.log(`$ ${[command, ...commandArgs].join(' ')}`)
    }

    const result = spawnSync(command, commandArgs, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
    })

    if (result.error) {
        throw result.error
    }

    return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr
    }
}

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

function isPackageJson(value: unknown): value is PackageJson {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        'version' in value &&
        typeof value.version === 'string'
    )
}
