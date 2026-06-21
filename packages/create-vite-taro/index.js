#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const packageRoot = path.dirname(fileURLToPath(import.meta.url))
const defaultProjectName = 'vite-taro-app'
const defaultProjectTitle = 'Vite Taro App'
const defaultWechatAppId = 'wx0000000000000000'
const renamedFiles = {
    '_env.local': '.env.local',
    _gitignore: '.gitignore'
}
const helpText = `Usage:
  pnpm create vite-taro [project-name]
  npm create vite-taro@latest [project-name]
  yarn create vite-taro [project-name]
  bun create vite-taro [project-name]

Options:
  -f, --force   Create files even when the target directory is not empty.
  -h, --help    Show this help.
`

const options = parseArgs(process.argv.slice(2))

if (options.help) {
    console.log(helpText)
    process.exit(0)
}

const targetDirectory = options.targetDirectory ?? (await promptProjectName())
const projectPath = path.resolve(targetDirectory)
const projectName = toValidPackageName(path.basename(projectPath))
const projectTitle = toTitle(projectName)
const wechatAppId = createWechatAppId()

assertCanCreateProject(projectPath, options.force)
mkdirSync(projectPath, { recursive: true })
copyTemplate(path.join(packageRoot, 'templates/default'), projectPath, projectName, projectTitle, wechatAppId)

const packageManager = getPackageManager()
const displayProjectPath = getDisplayProjectPath(projectPath)
const cdCommand = displayProjectPath === '.' ? undefined : `cd ${quotePath(displayProjectPath)}`

console.log(`\nCreated ${projectName} in ${projectPath}\n`)
console.log('Next steps:')
if (cdCommand) console.log(`  ${cdCommand}`)
console.log(`  ${packageManager} install`)
console.log(`  ${packageManager} dev:h5`)
console.log(`  ${packageManager} dev:wx`)

function parseArgs(args) {
    const options = {
        force: false,
        help: false,
        targetDirectory: undefined
    }

    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            options.help = true
            continue
        }

        if (arg === '--force' || arg === '-f') {
            options.force = true
            continue
        }

        if (arg.startsWith('-')) {
            fail(`Unknown option: ${arg}\n\n${helpText}`)
        }

        if (options.targetDirectory) {
            fail(`Unexpected argument: ${arg}\n\n${helpText}`)
        }

        options.targetDirectory = arg
    }

    return options
}

async function promptProjectName() {
    if (!process.stdin.isTTY) return defaultProjectName

    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout })
    try {
        const answer = await prompt.question(`Project name (${defaultProjectName}): `)
        return answer.trim() || defaultProjectName
    } finally {
        prompt.close()
    }
}

function assertCanCreateProject(projectPath, force) {
    if (!existsSync(projectPath)) return

    const stats = statSync(projectPath)
    if (!stats.isDirectory()) {
        fail(`Target path exists and is not a directory: ${projectPath}`)
    }

    if (!force && readdirSync(projectPath).length > 0) {
        fail(`Target directory is not empty: ${projectPath}\nUse --force to write template files anyway.`)
    }
}

function copyTemplate(sourceDirectory, targetDirectory, projectName, projectTitle, wechatAppId) {
    for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
        const sourcePath = path.join(sourceDirectory, entry.name)
        const targetName = renamedFiles[entry.name] ?? entry.name
        const targetPath = path.join(targetDirectory, targetName)

        if (entry.isDirectory()) {
            mkdirSync(targetPath, { recursive: true })
            copyTemplate(sourcePath, targetPath, projectName, projectTitle, wechatAppId)
            continue
        }

        const source = readFileSync(sourcePath, 'utf8')
        writeFileSync(targetPath, transformTemplateFile(targetName, source, projectName, projectTitle, wechatAppId))
    }
}

function transformTemplateFile(fileName, source, projectName, projectTitle, wechatAppId) {
    if (fileName === 'package.json') {
        const packageJson = JSON.parse(source)
        packageJson.name = projectName
        return `${JSON.stringify(packageJson, null, 4)}\n`
    }

    if (fileName === 'index.html') {
        return source.replace(/<title>.*?<\/title>/, `<title>${projectTitle}</title>`)
    }

    return source
        .replaceAll(defaultProjectName, projectName)
        .replaceAll(defaultProjectTitle, projectTitle)
        .replaceAll(defaultWechatAppId, wechatAppId)
}

function createWechatAppId() {
    return `wx${randomBytes(8).toString('hex')}`
}

function toValidPackageName(name) {
    const normalizedName = name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/^[._]/, '')
        .replace(/[^a-z0-9-~]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return isValidPackageName(normalizedName) ? normalizedName : defaultProjectName
}

function isValidPackageName(name) {
    return /^(?:@[a-z\d-*~][a-z\d-*._~]*\/)?[a-z\d-~][a-z\d-._~]*$/.test(name)
}

function toTitle(name) {
    return name
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
        .join(' ')
}

function getPackageManager() {
    const userAgent = process.env.npm_config_user_agent ?? ''
    if (userAgent.startsWith('pnpm')) return 'pnpm'
    if (userAgent.startsWith('yarn')) return 'yarn'
    if (userAgent.startsWith('bun')) return 'bun'
    if (userAgent.startsWith('npm')) return 'npm'
    return 'pnpm'
}

function getDisplayProjectPath(projectPath) {
    const relativePath = path.relative(process.cwd(), projectPath) || '.'
    return relativePath.startsWith('..') ? projectPath : relativePath
}

function quotePath(value) {
    return value.includes(' ') ? JSON.stringify(value) : value
}

function fail(message) {
    console.error(message)
    process.exit(1)
}
