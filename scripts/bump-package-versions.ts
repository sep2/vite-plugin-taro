#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type JsonObject = Record<string, unknown>
type JsonFile = {
    relativePath: string
    absolutePath: string
    json: JsonObject
}
type Change = {
    relativePath: string
    field: string
    from: string
    to: string
    apply(): void
}
type Semver = {
    major: number
    minor: number
    patch: number
    prerelease: string[]
    build?: string
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const usage = `Usage:
  pnpm version:bump <version|major|minor|patch|premajor|preminor|prepatch|prerelease> [--preid beta] [--dry-run]

Examples:
  pnpm version:bump patch
  pnpm version:bump 0.2.0
  pnpm version:bump prerelease --preid beta

Options:
  --preid <id>  Prerelease identifier for pre* bumps, for example beta.
  --dry-run     Print the changes without writing files.
  --help        Show this help.
`

const args = process.argv.slice(2)
const dryRun = takeFlag('--dry-run')
const help = takeFlag('--help') || takeFlag('-h')
const preid = takeOption('--preid')
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

const packageJsonPaths = [
    'package.json',
    'packages/create-vite-taro/package.json',
    'packages/loan-genius/package.json',
    'packages/taro-plugin-framework-react/package.json',
    'packages/taro-react/package.json',
    'packages/vite-plugin-taro/package.json'
]
const templatePackageJsonPath = 'packages/create-vite-taro/templates/default/package.json'
const packageJsonFiles = packageJsonPaths.map(readJsonFile)
const rootPackageJson = packageJsonFiles[0] ?? fail('No package.json files configured.')
const currentVersion = rootPackageJson.json.version
assertString(currentVersion, `${rootPackageJson.relativePath} version`)
const currentVersions = new Set(packageJsonFiles.map(({ json }) => json.version))
const nextVersion = resolveVersion(bump, currentVersion, preid)

if (currentVersions.size > 1) {
    console.warn(`Package versions are not currently aligned: ${[...currentVersions].join(', ')}`)
    if (parseSemver(bump)) {
        console.warn(`Setting all package versions to ${nextVersion}.`)
    } else {
        console.warn(`Using ${currentVersion} from package.json as the base version.`)
    }
    console.warn('')
}

const changes: Change[] = []

for (const file of packageJsonFiles) {
    assertString(file.json.version, `${file.relativePath} version`)
    changes.push({
        relativePath: file.relativePath,
        field: 'version',
        from: file.json.version,
        to: nextVersion,
        apply() {
            file.json.version = nextVersion
            writeJsonFile(file)
        }
    })
}

const templatePackageJson = readJsonFile(templatePackageJsonPath)
const templateDevDependencies = templatePackageJson.json.devDependencies
if (!isJsonObject(templateDevDependencies)) {
    fail(`${templatePackageJsonPath} is missing devDependencies.`)
}
const templatePluginSpecifier = templateDevDependencies['vite-plugin-taro']
assertString(templatePluginSpecifier, `${templatePackageJsonPath} devDependencies.vite-plugin-taro`)
const nextTemplatePluginSpecifier = updateVersionSpecifier(templatePluginSpecifier, nextVersion)

changes.push({
    relativePath: templatePackageJson.relativePath,
    field: 'devDependencies.vite-plugin-taro',
    from: templatePluginSpecifier,
    to: nextTemplatePluginSpecifier,
    apply() {
        templateDevDependencies['vite-plugin-taro'] = nextTemplatePluginSpecifier
        writeJsonFile(templatePackageJson)
    }
})

console.log(`${dryRun ? 'Would bump' : 'Bumping'} package versions to ${nextVersion}:`)
for (const change of changes) {
    const marker = change.from === change.to ? '=' : '→'
    console.log(`- ${change.relativePath} ${change.field}: ${change.from} ${marker} ${change.to}`)
}

if (!dryRun) {
    for (const change of changes) {
        if (change.from !== change.to) change.apply()
    }
    console.log('\nVersion bump completed.')
}

function readJsonFile(relativePath: string): JsonFile {
    const absolutePath = path.join(repoRoot, relativePath)
    const source = readFileSync(absolutePath, 'utf8')
    const json: unknown = JSON.parse(source)

    if (!isJsonObject(json)) {
        fail(`${relativePath} must contain a JSON object.`)
    }

    return {
        relativePath,
        absolutePath,
        json
    }
}

function writeJsonFile(file: JsonFile): void {
    writeFileSync(file.absolutePath, `${JSON.stringify(file.json, null, 4)}\n`)
}

function resolveVersion(value: string, currentVersion: string, prereleaseIdentifier: string | undefined): string {
    const exactVersion = parseSemver(value)
    if (exactVersion) return formatSemver(exactVersion)

    const current = parseSemver(currentVersion)
    if (!current) fail(`Current version is not valid semver: ${currentVersion}`)

    switch (value) {
        case 'major':
            return formatSemver({ major: current.major + 1, minor: 0, patch: 0, prerelease: [] })
        case 'minor':
            return formatSemver({ major: current.major, minor: current.minor + 1, patch: 0, prerelease: [] })
        case 'patch':
            return formatSemver({
                major: current.major,
                minor: current.minor,
                patch: current.patch + 1,
                prerelease: []
            })
        case 'premajor':
            return formatSemver({
                major: current.major + 1,
                minor: 0,
                patch: 0,
                prerelease: initialPrerelease(prereleaseIdentifier)
            })
        case 'preminor':
            return formatSemver({
                major: current.major,
                minor: current.minor + 1,
                patch: 0,
                prerelease: initialPrerelease(prereleaseIdentifier)
            })
        case 'prepatch':
            return formatSemver({
                major: current.major,
                minor: current.minor,
                patch: current.patch + 1,
                prerelease: initialPrerelease(prereleaseIdentifier)
            })
        case 'prerelease':
            if (current.prerelease.length > 0) {
                return formatSemver({
                    major: current.major,
                    minor: current.minor,
                    patch: current.patch,
                    prerelease: incrementPrerelease(current.prerelease, prereleaseIdentifier)
                })
            }

            return formatSemver({
                major: current.major,
                minor: current.minor,
                patch: current.patch + 1,
                prerelease: initialPrerelease(prereleaseIdentifier)
            })
        default:
            fail(`Invalid version or bump type: ${value}\n\n${usage}`)
    }
}

function parseSemver(value: unknown): Semver | undefined {
    if (typeof value !== 'string') return undefined

    const match = value.match(
        /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
    )
    if (!match) return undefined

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] ? match[4].split('.') : [],
        build: match[5]
    }
}

function formatSemver(version: Semver): string {
    const prerelease = version.prerelease.length > 0 ? `-${version.prerelease.join('.')}` : ''
    const build = version.build ? `+${version.build}` : ''
    return `${version.major}.${version.minor}.${version.patch}${prerelease}${build}`
}

function initialPrerelease(prereleaseIdentifier: string | undefined): string[] {
    return prereleaseIdentifier ? [...validatePreid(prereleaseIdentifier), '0'] : ['0']
}

function incrementPrerelease(prerelease: string[], prereleaseIdentifier: string | undefined): string[] {
    if (prereleaseIdentifier) {
        const preidParts = validatePreid(prereleaseIdentifier)
        const currentPreid = prerelease.slice(0, preidParts.length)
        if (currentPreid.join('.') !== preidParts.join('.')) return [...preidParts, '0']

        const suffix = prerelease.slice(preidParts.length)
        const numericIndex = findLastNumericIdentifierIndex(suffix)
        if (numericIndex === -1) return [...preidParts, ...suffix, '0']

        const nextSuffix = [...suffix]
        nextSuffix[numericIndex] = String(Number(nextSuffix[numericIndex]) + 1)
        return [...preidParts, ...nextSuffix]
    }

    const nextPrerelease = [...prerelease]
    const numericIndex = findLastNumericIdentifierIndex(nextPrerelease)
    if (numericIndex === -1) return [...nextPrerelease, '0']

    nextPrerelease[numericIndex] = String(Number(nextPrerelease[numericIndex]) + 1)
    return nextPrerelease
}

function findLastNumericIdentifierIndex(identifiers: string[]): number {
    for (let index = identifiers.length - 1; index >= 0; index -= 1) {
        if (/^(0|[1-9]\d*)$/.test(identifiers[index])) return index
    }

    return -1
}

function updateVersionSpecifier(specifier: string, nextVersion: string): string {
    const match = specifier.match(/^([~^]?)(?:v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/)
    if (!match) fail(`Unsupported vite-plugin-taro version specifier in template: ${specifier}`)
    return `${match[1]}${nextVersion}`
}

function validatePreid(value: string): string[] {
    const identifiers = value.split('.')
    if (
        identifiers.length === 0 ||
        identifiers.some((identifier) => !/^(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)$/.test(identifier))
    ) {
        fail(`Invalid prerelease identifier: ${value}`)
    }

    return identifiers
}

function assertString(value: unknown, label: string): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
        fail(`${label} must be a non-empty string.`)
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

function fail(message: string): never {
    console.error(message)
    process.exit(1)
}

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
