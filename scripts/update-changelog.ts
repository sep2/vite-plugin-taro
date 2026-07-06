#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type CommandResult = {
    status: number | null
    stdout: string
    stderr: string
}

type Commit = {
    hash: string
    subject: string
}

type ChangelogSection = {
    title: string
    date?: string
    commits: Commit[]
}

type ChangelogEntry = {
    category: ChangelogCategory
    summary: string
    hash: string
}

type ChangelogCategory = 'Added' | 'Changed' | 'Deprecated' | 'Removed' | 'Fixed' | 'Security'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const git = process.platform === 'win32' ? 'git.exe' : 'git'
const categories: ChangelogCategory[] = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security']
const usage = `Usage:
  pnpm changelog [-- --version 0.2.0] [-- --dry-run]

Options:
  --version <version>  Add a dated release section for commits since the latest tag.
  --dry-run           Print the generated changelog without writing CHANGELOG.md.
  --help              Show this help.
`

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const dryRun = takeFlag('--dry-run')
const help = takeFlag('--help') || takeFlag('-h')
const nextVersion = takeOption('--version')

if (help) {
    console.log(usage)
    process.exit(0)
}

if (args.length > 0) {
    fail(`Unknown argument(s): ${args.join(' ')}\n\n${usage}`)
}

const changelog = createChangelog(nextVersion)

if (dryRun) {
    process.stdout.write(changelog)
} else {
    writeFileSync(path.join(repoRoot, 'CHANGELOG.md'), changelog)
    console.log(`Updated CHANGELOG.md${nextVersion ? ` for ${nextVersion}` : ''}.`)
}

function createChangelog(version: string | undefined): string {
    const tags = getVersionTags()
    const sections: ChangelogSection[] = version
        ? [{ title: version, date: today(), commits: getCommits(createRange(tags[0], 'HEAD')) }]
        : []

    for (let index = 0; index < tags.length; index += 1) {
        const tag = tags[index]
        const previousTag = tags[index + 1]
        sections.push({
            title: tag.replace(/^v/, ''),
            date: getTagDate(tag),
            commits: previousTag ? getCommits(createRange(previousTag, tag)) : []
        })
    }

    return [createHeader(), ...sections.map(formatSection)].join('\n').replace(/\n+$/, '\n')
}

function createHeader(): string {
    return [
        '# Changelog',
        '',
        'All notable changes to this project are documented here.',
        '',
        'This file is generated from git release history by `pnpm changelog`.',
        ''
    ].join('\n')
}

function formatSection(section: ChangelogSection): string {
    const title = section.date ? `## [${section.title}] - ${section.date}` : `## [${section.title}]`
    const entriesByCategory = groupEntries(section.commits.map(toChangelogEntry))
    const lines = [title, '']

    if (Object.values(entriesByCategory).every((entries) => entries.length === 0)) {
        lines.push('Initial release.', '')
        return lines.join('\n')
    }

    for (const category of categories) {
        const entries = entriesByCategory[category]
        if (entries.length === 0) continue

        lines.push(`### ${category}`, '')
        for (const entry of entries) {
            lines.push(`- ${entry.summary} (${entry.hash.slice(0, 7)})`)
        }
        lines.push('')
    }

    return lines.join('\n')
}

function groupEntries(entries: ChangelogEntry[]): Record<ChangelogCategory, ChangelogEntry[]> {
    return categories.reduce(
        (grouped, category) => {
            grouped[category] = entries.filter((entry) => entry.category === category)
            return grouped
        },
        {} as Record<ChangelogCategory, ChangelogEntry[]>
    )
}

function toChangelogEntry(commit: Commit): ChangelogEntry {
    const conventional = commit.subject.match(/^([a-z]+)(?:\([^)]+\))?!?:\s*(.+)$/i)
    const type = conventional?.[1].toLowerCase()
    const summary = conventional?.[2] ?? commit.subject

    return {
        category: getCategory(type, commit.subject),
        summary: normalizeSummary(summary),
        hash: commit.hash
    }
}

function getCategory(type: string | undefined, subject: string): ChangelogCategory {
    if (type === 'feat') return 'Added'
    if (type === 'fix') return 'Fixed'
    if (type === 'security') return 'Security'
    if (type === 'deprecated' || type === 'deprecate') return 'Deprecated'
    if (type === 'remove' || type === 'removed') return 'Removed'

    const lowerSubject = subject.toLowerCase()
    if (lowerSubject.startsWith('add ')) return 'Added'
    if (lowerSubject.startsWith('fix ') || lowerSubject.startsWith('fix:')) return 'Fixed'
    if (lowerSubject.startsWith('remove ')) return 'Removed'
    if (lowerSubject.startsWith('deprecate ')) return 'Deprecated'
    if (lowerSubject.startsWith('security ')) return 'Security'

    return 'Changed'
}

function normalizeSummary(value: string): string {
    return value.trim().replace(/\s+/g, ' ')
}

function getVersionTags(): string[] {
    return gitCapture(['tag', '--list', 'v[0-9]*', '--sort=-v:refname'])
        .split('\n')
        .map((tag) => tag.trim())
        .filter(Boolean)
}

function getCommits(range: string): Commit[] {
    return gitCapture(['log', '--no-merges', '--format=%H%x1f%s', range])
        .split('\n')
        .map(parseCommit)
        .filter((commit): commit is Commit => Boolean(commit))
        .filter((commit) => !/^chore: release v/i.test(commit.subject))
}

function parseCommit(line: string): Commit | undefined {
    if (!line) return
    const [hash, subject] = line.split('\x1f')
    if (!hash || !subject) return
    return { hash, subject }
}

function getTagDate(tag: string): string {
    return gitCapture(['log', '-1', '--format=%cs', tag]).trim()
}

function createRange(from: string | undefined, to: string): string {
    return from ? `${from}..${to}` : to
}

function today(): string {
    return new Date().toISOString().slice(0, 10)
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

function gitCapture(args: string[]): string {
    const result = runCapture(git, args)

    if (result.status !== 0) {
        fail(`Git command failed: git ${args.join(' ')}\n\n${result.stderr}`)
    }

    return result.stdout
}

function runCapture(command: string, commandArgs: string[]): CommandResult {
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
