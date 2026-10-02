import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

/** Composes an ordered series in a disposable pristine package, without touching the installed dependency or repository index. */
export function composePatchSeries(packageDirectory: string, patchFiles: readonly string[]): string {
    function git(args: string[]): string {
        return execFileSync(
            'git',
            ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'core.fileMode=false', ...args],
            {
                cwd: packageDirectory,
                encoding: 'utf8',
                maxBuffer: 16 * 1024 * 1024,
                timeout: 30000,
                stdio: ['ignore', 'pipe', 'pipe']
            }
        )
    }

    // The temporary index owns the successive package states. No commits, identity configuration, or hooks are needed.
    git(['init', '--quiet', '--object-format=sha1', '--initial-branch=patch-series'])
    // Preserve upstream bytes even when the host's global attributes install clean filters or line-ending conversions.
    writeFileSync(
        path.join(packageDirectory, '.git/info/attributes'),
        '* -text -filter -ident -working-tree-encoding\n'
    )
    git(['add', '--force', '--all'])
    const baseline = git(['write-tree']).trim()
    for (const patchFile of patchFiles) {
        // --index includes additions/deletions and rejects out-of-order or conflicting changes instead of leaving rejects.
        git(['apply', '--index', '--whitespace=nowarn', path.resolve(patchFile)])
    }
    // Compute the upstream-to-final diff once, with fixed formatting instead of the host's Git diff preferences.
    return git([
        'diff',
        '--cached',
        '--binary',
        '--full-index',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        '--no-relative',
        '--diff-algorithm=myers',
        '--no-indent-heuristic',
        '--unified=3',
        '--inter-hunk-context=0',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        baseline,
        '--'
    ])
}
